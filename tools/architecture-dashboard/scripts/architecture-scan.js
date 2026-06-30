#!/usr/bin/env node
'use strict';

/**
 * architecture-scan.js
 * -----------------------------------------------------------------------------
 * Static health scan for the Hugh codebase. Walks the real source roots
 * (app/, components/, hooks/, lib/, types/, utils/ — there is no src/), builds
 * an internal import dependency graph, and computes per-file metrics:
 *
 *   - loc          non-blank lines of code
 *   - fanOut       number of internal modules this file imports
 *   - fanIn        number of internal modules that import this file
 *   - complexity   fanIn + fanOut (a cheap structural-coupling proxy)
 *   - churn        commit count touching this file in the last 30 days
 *   - hotspotScore normalize(churn) * normalize(complexity), scaled 0-100
 *   - lastModified ISO date of the most recent commit touching the file
 *
 * Output is written to ../architecture-data.json (next to dashboard.html) so the
 * dashboard can fetch it with no build step.
 *
 * Exposes runScan() for reuse by watch.js. Run directly (`node architecture-scan.js`)
 * to perform a one-shot scan.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// --- Configuration ----------------------------------------------------------

const TOOL_DIR = path.resolve(__dirname, '..'); // tools/architecture-dashboard
const PROJECT_ROOT = path.resolve(TOOL_DIR, '..', '..'); // repo root
const OUTPUT_FILE = path.join(TOOL_DIR, 'architecture-data.json');

// Hugh keeps source in these roots — no src/ directory exists.
const SOURCE_ROOTS = ['app', 'components', 'hooks', 'lib', 'types', 'utils'];
const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const CHURN_WINDOW_DAYS = 30;
const RECENT_CHANGES_LIMIT = 25;

// Path alias from tsconfig.json: "@/*" -> "./*" (relative to project root).
const ALIAS_PREFIX = '@/';

// --- Filesystem walking ------------------------------------------------------

/** Recursively collect all source files under the configured roots. */
function collectSourceFiles() {
  const files = [];
  for (const root of SOURCE_ROOTS) {
    const abs = path.join(PROJECT_ROOT, root);
    if (fs.existsSync(abs)) walk(abs, files);
  }
  return files;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXTS.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
}

/** Convert an absolute path to a repo-relative, forward-slash key. */
function toRel(absPath) {
  return path.relative(PROJECT_ROOT, absPath).split(path.sep).join('/');
}

// --- LOC + import extraction -------------------------------------------------

/** Strip line and block comments so they don't pollute import detection. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments (avoid http://)
}

/** Count non-blank lines as LOC. */
function countLoc(source) {
  return source.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

const IMPORT_PATTERNS = [
  /\bimport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g, // import X from '...'
  /\bimport\s*['"]([^'"]+)['"]/g, // side-effect import '...'
  /\bexport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g, // re-export from '...'
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('...')
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('...')
];

/** Extract every module specifier referenced by a file. */
function extractSpecifiers(source) {
  const clean = stripComments(source);
  const specs = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    let m;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(clean)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

/**
 * Resolve a module specifier to an absolute file path within the scanned set,
 * or null if it's external (node_modules) or otherwise unresolvable.
 */
function resolveSpecifier(spec, fromFile, fileSet) {
  let base;
  if (spec.startsWith(ALIAS_PREFIX)) {
    base = path.join(PROJECT_ROOT, spec.slice(ALIAS_PREFIX.length));
  } else if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    return null; // bare specifier => external dependency, not part of the graph
  }

  const candidates = [];
  if (path.extname(base)) candidates.push(base);
  for (const ext of SOURCE_EXTS) candidates.push(base + ext);
  for (const ext of SOURCE_EXTS) candidates.push(path.join(base, 'index' + ext));

  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

// --- Git metrics -------------------------------------------------------------

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // A missing git history shouldn't kill the scan — degrade gracefully.
    console.warn(`[scan] git ${args.join(' ')} failed: ${err.message}`);
    return '';
  }
}

/** Commit count per file within the churn window, keyed by repo-relative path. */
function computeChurn() {
  const out = git([
    'log',
    `--since=${CHURN_WINDOW_DAYS} days ago`,
    '--name-only',
    '--pretty=format:',
  ]);
  const churn = {};
  for (const line of out.split(/\r?\n/)) {
    const file = line.trim();
    if (!file) continue;
    churn[file] = (churn[file] || 0) + 1;
  }
  return churn;
}

/** Most recent commit date (ISO) per file across all history. */
function computeLastModified() {
  // Newest-first; first time we see a file is its latest commit date.
  const out = git(['log', '--name-only', '--pretty=format:__C__%cI']);
  const lastModified = {};
  let currentDate = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('__C__')) {
      currentDate = line.slice('__C__'.length).trim();
    } else {
      const file = line.trim();
      if (file && currentDate && !lastModified[file]) {
        lastModified[file] = currentDate;
      }
    }
  }
  return lastModified;
}

/** Recent commit feed for the dashboard's changes panel. */
function computeRecentChanges() {
  const SEP = '\x1f';
  const out = git([
    'log',
    `-n${RECENT_CHANGES_LIMIT}`,
    '--name-only',
    `--pretty=format:__C__%h${SEP}%cI${SEP}%an${SEP}%s`,
  ]);
  const commits = [];
  let current = null;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('__C__')) {
      const [hash, date, author, subject] = line.slice('__C__'.length).split(SEP);
      current = { hash, date, author, subject, files: [] };
      commits.push(current);
    } else if (current && line.trim()) {
      current.files.push(line.trim());
    }
  }
  return commits;
}

// --- Normalization -----------------------------------------------------------

/** Min-max normalize a value into 0..1; returns 0 when the range is degenerate. */
function makeNormalizer(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return (v) => (range === 0 ? 0 : (v - min) / range);
}

// --- Main scan ---------------------------------------------------------------

function runScan(outPath = OUTPUT_FILE) {
  const absFiles = collectSourceFiles();
  const fileSet = new Set(absFiles);

  // Pass 1: LOC + raw import edges.
  const edges = []; // { from, to } repo-relative
  const fanOut = new Map(); // abs -> count
  const fanIn = new Map(); // abs -> count
  const loc = new Map(); // abs -> loc
  for (const abs of absFiles) {
    fanOut.set(abs, 0);
    fanIn.set(abs, 0);
  }

  for (const abs of absFiles) {
    const source = fs.readFileSync(abs, 'utf8');
    loc.set(abs, countLoc(source));
    const targets = new Set();
    for (const spec of extractSpecifiers(source)) {
      const resolved = resolveSpecifier(spec, abs, fileSet);
      if (resolved && resolved !== abs) targets.add(resolved);
    }
    for (const target of targets) {
      edges.push({ from: toRel(abs), to: toRel(target) });
      fanOut.set(abs, fanOut.get(abs) + 1);
      fanIn.set(target, fanIn.get(target) + 1);
    }
  }

  // Git metrics (keyed by repo-relative path).
  const churnMap = computeChurn();
  const lastModifiedMap = computeLastModified();
  const recentChanges = computeRecentChanges();

  // Pass 2: assemble per-file records + normalization inputs.
  const draft = absFiles.map((abs) => {
    const rel = toRel(abs);
    const complexity = fanIn.get(abs) + fanOut.get(abs);
    return {
      path: rel,
      loc: loc.get(abs),
      fanIn: fanIn.get(abs),
      fanOut: fanOut.get(abs),
      complexity,
      churn: churnMap[rel] || 0,
      lastModified: lastModifiedMap[rel] || null,
    };
  });

  const normChurn = makeNormalizer(draft.map((d) => d.churn));
  const normComplexity = makeNormalizer(draft.map((d) => d.complexity));

  const components = draft
    .map((d) => ({
      ...d,
      hotspotScore: Math.round(normChurn(d.churn) * normComplexity(d.complexity) * 100),
    }))
    .sort((a, b) => b.hotspotScore - a.hotspotScore);

  const data = {
    generatedAt: new Date().toISOString(),
    projectRoot: toRel(PROJECT_ROOT) || '.',
    sourceRoots: SOURCE_ROOTS,
    churnWindowDays: CHURN_WINDOW_DAYS,
    components,
    edges,
    recentChanges,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  return data;
}

module.exports = { runScan, OUTPUT_FILE, PROJECT_ROOT, SOURCE_ROOTS };

// Run directly => one-shot scan with a short summary. Optional: --out <path>.
if (require.main === module) {
  const start = Date.now();
  const outArg = process.argv.indexOf('--out');
  const outPath = outArg !== -1 ? path.resolve(process.argv[outArg + 1]) : OUTPUT_FILE;
  const data = runScan(outPath);
  const top = data.components[0];
  console.log(
    `[scan] ${data.components.length} files, ${data.edges.length} edges in ${
      Date.now() - start
    }ms`
  );
  if (top) console.log(`[scan] top hotspot: ${top.path} (score ${top.hotspotScore})`);
  console.log(`[scan] wrote ${path.relative(process.cwd(), outPath)}`);
}
