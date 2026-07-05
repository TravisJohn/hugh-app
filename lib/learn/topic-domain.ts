// ── Topic domain gate ────────────────────────────────────────────────────────
// Hugh is strictly a data & analytics skill-prep app. Before ANY topic entry
// point builds a track or starts a session, an LLM judge (server-side, Haiku)
// decides whether the topic's core skill is in-domain (data engineering / data
// science / ML / analytics / statistics / SQL / BI / cloud data / related
// tooling). Out-of-domain topics are blocked with a kind reminder.

export interface TopicDomainVerdict {
  /** True when the topic belongs to Hugh's data & analytics domain. */
  inDomain: boolean;
  /** One short clause explaining the call (for logs / debugging). */
  reason: string;
  /** Warm, learner-facing reminder shown when out of domain ("" when in-domain). */
  message: string;
  /** 0–3 data-angle reframes when a sensible bridge exists (else empty). */
  suggestions: string[];
}

/** The permissive default used whenever the judge can't be reached. */
function openVerdict(): TopicDomainVerdict {
  return { inDomain: true, reason: "classifier-unavailable", message: "", suggestions: [] };
}

/**
 * Ask the server-side judge whether `topic` is within Hugh's domain. Called at
 * every topic ENTRY point (course builder, Focused Learning) to enforce the
 * "data & analytics skill prep only" protocol.
 *
 * Fails OPEN on any network/parse error (returns inDomain:true) so a transient
 * classifier failure never blocks a legitimate learner — the app's downstream
 * flows keep their own per-message guards.
 */
export async function classifyTopic(topic: string): Promise<TopicDomainVerdict> {
  try {
    const res = await fetch("/api/dashboard/classify-topic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });
    if (!res.ok) return openVerdict();
    const data = (await res.json()) as Partial<TopicDomainVerdict>;
    return {
      // Only an explicit `false` blocks — a malformed body fails open.
      inDomain: data.inDomain !== false,
      reason: typeof data.reason === "string" ? data.reason : "",
      message: typeof data.message === "string" ? data.message : "",
      suggestions: Array.isArray(data.suggestions)
        ? data.suggestions.filter((s): s is string => typeof s === "string").slice(0, 3)
        : [],
    };
  } catch {
    return openVerdict();
  }
}
