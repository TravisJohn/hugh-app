// ── Topic domain gate ────────────────────────────────────────────────────────
// Hugh is strictly a data & analytics skill-prep app. Before ANY topic entry
// point builds a track or starts a session, an LLM judge (server-side, Haiku)
// decides whether the topic's core skill is in-domain (data engineering / data
// science / ML & LLM engineering / analytics / statistics / SQL / BI / cloud
// data / related tooling).
//
// The verdict is THREE-WAY, not two-way. A binary gate has only "build it" and
// "go away", and a bare topic like "Generative AI" is neither: its core skill
// depends entirely on which reading the learner meant (building RAG pipelines
// and evals is ML engineering — in domain; using ChatGPT to write faster is
// not). The old gate resolved that ambiguity by rejecting, then offered data
// reframes — telling the learner their topic was off-limits and in the same
// breath suggesting the same topic in different words. "needs_angle" is that
// missing third state: don't reject an under-specified topic, ask which angle
// they meant.

/**
 * - `in`          — the core skill is data/analytics. Proceed.
 * - `needs_angle` — a genuine data reading exists but the phrasing hasn't
 *                   committed to one. Don't proceed, and don't reject: ask,
 *                   carrying `suggestions` as the answers.
 * - `out`         — the core skill is a different profession or subject.
 */
export type TopicVerdict = "in" | "needs_angle" | "out";

export interface TopicDomainVerdict {
  /** Which of the three ways this topic resolved. */
  verdict: TopicVerdict;
  /** One short clause explaining the call (for logs / debugging). */
  reason: string;
  /** Learner-facing copy. Empty when `verdict` is "in". */
  message: string;
  /** 0–3 data-angle options. Required when "needs_angle"; optional when "out". */
  suggestions: string[];
}

/** True only when a track may actually be built from this topic. */
export function mayProceed(v: TopicDomainVerdict): boolean {
  return v.verdict === "in";
}

/** The permissive default used whenever the judge can't be reached. */
export function openVerdict(reason = "classifier-unavailable"): TopicDomainVerdict {
  return { verdict: "in", reason, message: "", suggestions: [] };
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asSuggestions(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 3);
}

/**
 * Turn an untrusted judge response into a safe verdict. Shared by the server
 * judge and the browser wrapper so the fail-open rules exist in exactly one
 * place and cannot drift apart.
 *
 * Fails OPEN by construction: anything unrecognised resolves to "in". Only an
 * explicit, well-formed "out" or "needs_angle" blocks a learner, because a
 * malformed model response is a Hugh problem and must never read as a verdict
 * against the person typing.
 */
export function normalizeVerdict(raw: unknown): TopicDomainVerdict {
  if (typeof raw !== "object" || raw === null) return openVerdict("malformed-response");

  const r      = raw as Record<string, unknown>;
  const reason = asString(r.reason);
  const suggestions = asSuggestions(r.suggestions);

  // Legacy/regression path: an older prompt (or a model reverting to the old
  // shape) emits the boolean instead. `inDomain:false` meant "out".
  const raw3 = typeof r.verdict === "string" ? r.verdict : r.inDomain === false ? "out" : "";

  if (raw3 === "out") {
    return { verdict: "out", reason, message: asString(r.message), suggestions };
  }

  if (raw3 === "needs_angle") {
    // A question with no answers is a dead end, and Hugh does not build dead
    // ends (CLAUDE.md rule 5 — a block needs its own way out). If the judge
    // could not name a single angle, its own ambiguity claim is unsupported,
    // so let the topic through rather than stranding the learner.
    if (suggestions.length === 0) return openVerdict("needs-angle-without-suggestions");
    return { verdict: "needs_angle", reason, message: asString(r.message), suggestions };
  }

  return openVerdict(reason || "unrecognised-verdict");
}

/**
 * Ask the server-side judge whether `topic` is within Hugh's domain. Called at
 * every topic ENTRY point to enforce the "data & analytics skill prep only"
 * protocol.
 *
 * Fails OPEN on any network/parse error so a transient classifier failure never
 * blocks a legitimate learner — the app's downstream flows keep their own
 * per-message guards.
 */
export async function classifyTopic(topic: string): Promise<TopicDomainVerdict> {
  try {
    const res = await fetch("/api/dashboard/classify-topic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });
    if (!res.ok) return openVerdict();
    return normalizeVerdict(await res.json());
  } catch {
    return openVerdict();
  }
}
