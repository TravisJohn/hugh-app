/**
 * Cloud Skills provenance tool.
 *
 *   npx tsx scripts/cloud-meta.ts             # print the review queue
 *   npx tsx scripts/cloud-meta.ts --backfill  # give every unstamped service a meta block
 *   npx tsx scripts/cloud-meta.ts --check     # exit 1 if any file is malformed (CI-able)
 *
 * The content is AI-authored and cloud services move, so the question this
 * answers is not "is it right" — no script can know that — but "what do I still
 * not know about, and what have I not looked at longest". Verifying a claim is
 * human work; deciding what to verify next should not be.
 *
 * Imports the same pure module the app renders from (lib/cloud/provenance.ts),
 * so the queue here and the line a learner sees can never disagree.
 */
import fs from "fs";
import path from "path";
import type { Service, CloudManifest } from "../types/cloud";
import { reviewQueue, factCoverage } from "../lib/cloud/provenance";

const DIR = path.resolve(process.cwd(), "public", "cloud-data");
const PROVIDERS = ["aws", "gcp", "azure"] as const;

interface Loaded {
  file: string;
  service: Service;
}

function loadAll(): Loaded[] {
  const out: Loaded[] = [];
  for (const p of PROVIDERS) {
    const dir = path.join(DIR, p);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
      const file = path.join(dir, f);
      out.push({ file, service: JSON.parse(fs.readFileSync(file, "utf8")) as Service });
    }
  }
  return out;
}

function loadManifest(): CloudManifest {
  return JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8")) as CloudManifest;
}

/**
 * The structural checks a validator can actually make. Deliberately modest:
 * these catch a broken edit, not a wrong fact. Run before any write-back, and
 * cheap enough to run in CI.
 */
function check(loaded: Loaded[]): string[] {
  const manifest = loadManifest();
  const known = new Set(manifest.services.map(s => `${s.provider}/${s.id}`));
  const problems: string[] = [];

  const required = [
    "id", "provider", "name", "groups", "oneLiner", "whatItIs",
    "coreConcepts", "whenToUse", "whenNotToUse", "keyFacts",
    "pricingShape", "gotchas", "equivalents",
  ] as const;

  for (const { file, service } of loaded) {
    const key = `${service.provider}/${service.id}`;
    const where = path.relative(process.cwd(), file);

    for (const field of required) {
      if (service[field] === undefined) problems.push(`${where}: missing "${field}"`);
    }
    if (!known.has(key)) problems.push(`${where}: not listed in manifest.json`);

    // The manifest duplicates five fields. Nothing enforces that they agree, so
    // check it here — a rename that lands in one and not the other shows up as
    // a card whose title differs from its own page.
    const stub = manifest.services.find(s => `${s.provider}/${s.id}` === key);
    if (stub) {
      for (const field of ["name", "oneLiner", "short"] as const) {
        if ((stub[field] ?? null) !== (service[field] ?? null)) {
          problems.push(`${where}: "${field}" disagrees with manifest.json`);
        }
      }
      if (JSON.stringify(stub.groups) !== JSON.stringify(service.groups)) {
        problems.push(`${where}: "groups" disagrees with manifest.json`);
      }
    }

    // Every cross-cloud link must land on a service that exists, or the detail
    // page renders a card that 404s.
    for (const e of service.equivalents ?? []) {
      if (!known.has(`${e.provider}/${e.id}`)) {
        problems.push(`${where}: equivalent ${e.provider}/${e.id} does not exist`);
      }
    }

    // A citation without a quote is a link, and a link asks the reader to go and
    // re-derive the finding. Refuse the half-done version.
    for (const f of service.keyFacts ?? []) {
      if (!f.source) continue;
      if (!f.source.url || !f.source.quote || !f.source.checked) {
        problems.push(`${where}: keyFact "${f.label}" has an incomplete source`);
      }
      if (f.source.url && !/^https:\/\//.test(f.source.url)) {
        problems.push(`${where}: keyFact "${f.label}" source url is not https`);
      }
    }

    const stubMissing = manifest.services.filter(s => !loaded.some(
      l => `${l.service.provider}/${l.service.id}` === `${s.provider}/${s.id}`));
    for (const s of stubMissing) {
      problems.push(`manifest.json: ${s.provider}/${s.id} has no detail file`);
    }
  }
  return [...new Set(problems)];
}

/**
 * Stamp `meta.authored` on any service that has none, so the review queue can
 * tell "written in July and never checked" from "never written down at all".
 * Never touches `verified` — that is a claim about work someone actually did.
 */
function backfill(loaded: Loaded[]): number {
  const authored = loadManifest().version;
  let written = 0;

  for (const { file, service } of loaded) {
    if (service.meta) continue;

    // Inserted as text, not via JSON.stringify. A round-trip would reformat all
    // 63 files — every array collapsed or expanded differently — and bury a
    // one-line change under a whole-corpus diff. A review tool whose own output
    // is unreviewable is not much of a review tool.
    const raw = fs.readFileSync(file, "utf8");
    const brace = raw.indexOf("{");
    if (brace === -1) throw new Error(`${file}: not an object`);

    const next =
      `${raw.slice(0, brace + 1)}
  "meta": { "authored": ${JSON.stringify(authored)} },` +
      raw.slice(brace + 1);

    // Prove it still parses before it hits disk, so a bad insert can never ship.
    JSON.parse(next);
    fs.writeFileSync(file, next, "utf8");
    written++;
  }
  return written;
}

function report(loaded: Loaded[]): void {
  const queue = reviewQueue(loaded.map(l => l.service));
  const counts = queue.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});

  const cited = loaded.reduce((n, l) => n + factCoverage(l.service.keyFacts).cited, 0);
  const facts = loaded.reduce((n, l) => n + l.service.keyFacts.length, 0);

  console.log(`\nCloud Skills — ${loaded.length} services`);
  console.log(`  verified ${counts.verified ?? 0}  aging ${counts.aging ?? 0}` +
              `  stale ${counts.stale ?? 0}  unverified ${counts.unverified ?? 0}`);
  console.log(`  key facts with a citation: ${cited}/${facts}\n`);

  console.log("Review queue — least-known first:");
  for (const i of queue.slice(0, 20)) {
    const age = i.ageDays === null ? "never" : `${i.ageDays}d ago`;
    console.log(
      `  ${i.status.padEnd(11)} ${i.key.padEnd(24)} ${age.padEnd(10)}` +
      ` cited ${i.coverage.cited}/${i.coverage.total}  ${i.name}`);
  }
  if (queue.length > 20) console.log(`  … and ${queue.length - 20} more`);
  console.log();
}

const loaded = loadAll();
const mode = process.argv[2];

if (mode === "--check") {
  const problems = check(loaded);
  if (problems.length === 0) {
    console.log(`cloud-data OK — ${loaded.length} services, no structural problems.`);
    process.exit(0);
  }
  console.error(`cloud-data has ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
} else if (mode === "--backfill") {
  const problems = check(loaded);
  if (problems.length > 0) {
    // Never write over a corpus that is already broken — the backfill would
    // rewrite every file and bury whatever went wrong under a formatting diff.
    console.error("Refusing to backfill: fix these first.");
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const n = backfill(loaded);
  console.log(`Stamped meta.authored on ${n} service(s); ${loaded.length - n} already had one.`);
} else {
  report(loaded);
}
