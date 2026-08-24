import { describe, it, expect, vi, beforeEach } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";

// generateTrack is orchestration, not pure logic: it calls Claude, writes two
// tables, and has to leave the database clean when the second write fails.
// Those failure paths are the ones that shipped a "ready" track with an empty
// board, so they are what this file exercises.

const { messagesCreate, logUsageMock, assignBacklogPriorityMock } = vi.hoisted(() => ({
  messagesCreate:            vi.fn(),
  logUsageMock:              vi.fn(),
  assignBacklogPriorityMock: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: messagesCreate };
  },
}));

// lib/usage is `import "server-only"`, which will not load under Vitest.
vi.mock("@/lib/usage", () => ({ logUsage: logUsageMock }));
vi.mock("@/lib/tracker/priority", () => ({ assignBacklogPriority: assignBacklogPriorityMock }));

const { generateTrack, TrackGenerationError } = await import("./generate");

// -- Fixtures ---------------------------------------------------------------

const THREE_MILESTONES = {
  trackTitle: "Window Functions in SQL",
  milestones: [
    { title: "Frames and partitions", summary: "How a window is defined.",      column: "learn"   },
    { title: "Ranking functions",     summary: "ROW_NUMBER, RANK, DENSE_RANK.",  column: "backlog" },
    { title: "Running totals",        summary: "Cumulative sums over a frame.",  column: "backlog" },
  ],
};

function claudeReply(payload: unknown, tokensIn = 100, tokensOut = 50) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    usage:   { input_tokens: tokensIn, output_tokens: tokensOut },
  };
}

interface Script {
  trackInsert?:     { data: { id: string } | null; error: { message: string } | null };
  milestoneInsert?: { data: { id: string }[] | null; error: { message: string } | null };
  trackDelete?:     { error: { message: string } | null };
}

interface Spy {
  deletedTrackIds:      string[];
  milestoneRowsWritten: number;
  trackRowWritten:      Record<string, unknown> | null;
}

// A hand-rolled stand-in for the two query chains generateTrack actually uses:
//   tracks:     .insert(row).select("id").single()  and  .delete().eq("id", ...)
//   milestones: .insert(rows).select("id")
// Anything else throws, so a change in the module's query shape fails loudly
// here rather than silently passing against a permissive mock.
function makeSupabase(script: Script): { client: SupabaseClient; spy: Spy } {
  const spy: Spy = { deletedTrackIds: [], milestoneRowsWritten: 0, trackRowWritten: null };

  const client = {
    from(table: string) {
      if (table === "tracks") {
        return {
          insert(row: Record<string, unknown>) {
            spy.trackRowWritten = row;
            return {
              select: () => ({
                single: async () =>
                  script.trackInsert ?? { data: { id: "track-1" }, error: null },
              }),
            };
          },
          delete: () => ({
            eq: async (_column: string, id: string) => {
              spy.deletedTrackIds.push(id);
              return script.trackDelete ?? { error: null };
            },
          }),
        };
      }
      if (table === "milestones") {
        return {
          insert(rows: unknown[]) {
            spy.milestoneRowsWritten = rows.length;
            return {
              select: async () =>
                script.milestoneInsert ?? {
                  data:  rows.map((_, i) => ({ id: `m-${i}` })),
                  error: null,
                },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };

  return { client: client as unknown as SupabaseClient, spy };
}

beforeEach(() => {
  messagesCreate.mockReset();
  logUsageMock.mockReset();
  assignBacklogPriorityMock.mockReset();
  assignBacklogPriorityMock.mockResolvedValue(null);
});

// -- Happy path -------------------------------------------------------------

describe("generateTrack - the successful build", () => {
  it("returns the track id and writes every milestone the model produced", async () => {
    messagesCreate.mockResolvedValue(claudeReply(THREE_MILESTONES));
    const { client, spy } = makeSupabase({});

    const trackId = await generateTrack(client, "user-1", "SQL window functions");

    expect(trackId).toBe("track-1");
    expect(spy.milestoneRowsWritten).toBe(3);
    expect(spy.deletedTrackIds).toEqual([]);
  });

  it("links the track to the goal when a goalId is supplied, and omits it otherwise", async () => {
    messagesCreate.mockResolvedValue(claudeReply(THREE_MILESTONES));

    const withGoal = makeSupabase({});
    await generateTrack(withGoal.client, "user-1", "SQL", "goal-9");
    expect(withGoal.spy.trackRowWritten).toMatchObject({ goal_id: "goal-9" });

    const without = makeSupabase({});
    await generateTrack(without.client, "user-1", "SQL");
    expect(without.spy.trackRowWritten).not.toHaveProperty("goal_id");
  });
});

// -- The bug this file exists for -------------------------------------------

describe("generateTrack - a failed milestone insert must not look like success", () => {
  it("throws instead of returning a track id whose board would be empty", async () => {
    messagesCreate.mockResolvedValue(claudeReply(THREE_MILESTONES));
    const { client } = makeSupabase({
      milestoneInsert: { data: null, error: { message: "permission denied for table milestones" } },
    });

    await expect(generateTrack(client, "user-1", "SQL")).rejects.toBeInstanceOf(TrackGenerationError);
  });

  it("deletes the track it just created, so no orphan row is left behind", async () => {
    messagesCreate.mockResolvedValue(claudeReply(THREE_MILESTONES));
    const { client, spy } = makeSupabase({
      milestoneInsert: { data: null, error: { message: "insert failed" } },
    });

    await expect(generateTrack(client, "user-1", "SQL")).rejects.toThrow();
    expect(spy.deletedTrackIds).toEqual(["track-1"]);
  });

  it("treats a partial insert as a failure - three asked for, two saved", async () => {
    // Postgres can accept some rows and reject others under a constraint. Two
    // thirds of a curriculum is not a curriculum, and the learner has no way to
    // tell which third is missing.
    messagesCreate.mockResolvedValue(claudeReply(THREE_MILESTONES));
    const { client, spy } = makeSupabase({
      milestoneInsert: { data: [{ id: "m-0" }, { id: "m-1" }], error: null },
    });

    await expect(generateTrack(client, "user-1", "SQL")).rejects.toThrow(/expected 3, saved 2/);
    expect(spy.deletedTrackIds).toEqual(["track-1"]);
  });

  it("still throws when the orphan cleanup itself fails", async () => {
    // A failed cleanup is worse, not better: the caller must still learn that
    // the track is unusable.
    messagesCreate.mockResolvedValue(claudeReply(THREE_MILESTONES));
    const { client } = makeSupabase({
      milestoneInsert: { data: null, error: { message: "insert failed" } },
      trackDelete:     { error: { message: "delete failed too" } },
    });

    await expect(generateTrack(client, "user-1", "SQL")).rejects.toBeInstanceOf(TrackGenerationError);
  });
});

describe("generateTrack - a failed track insert", () => {
  it("throws and never attempts a milestone write or a cleanup", async () => {
    messagesCreate.mockResolvedValue(claudeReply(THREE_MILESTONES));
    const { client, spy } = makeSupabase({
      trackInsert: { data: null, error: { message: "duplicate key" } },
    });

    await expect(generateTrack(client, "user-1", "SQL")).rejects.toBeInstanceOf(TrackGenerationError);
    expect(spy.milestoneRowsWritten).toBe(0);
    expect(spy.deletedTrackIds).toEqual([]);
  });
});

// -- Accounting -------------------------------------------------------------

describe("generateTrack - spend is recorded whatever the database does", () => {
  it("logs the Claude spend even when the milestone insert then fails", async () => {
    // The tokens were bought before the write was attempted. A failed build
    // that bills nothing under-states real spend (CLAUDE.md, usage accounting).
    messagesCreate.mockResolvedValue(claudeReply(THREE_MILESTONES, 900, 400));
    const { client } = makeSupabase({
      milestoneInsert: { data: null, error: { message: "insert failed" } },
    });

    await expect(generateTrack(client, "user-1", "SQL")).rejects.toThrow();
    expect(logUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "tracker/generate", tokensIn: 900, tokensOut: 400 }),
    );
  });

  it("bills both attempts when the first response is unparseable", async () => {
    messagesCreate
      .mockResolvedValueOnce(claudeReply({ trackTitle: "", milestones: [] }, 700, 20))
      .mockResolvedValueOnce(claudeReply(THREE_MILESTONES, 700, 300));
    const { client } = makeSupabase({});

    await generateTrack(client, "user-1", "SQL");

    expect(logUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ tokensIn: 1400, tokensOut: 320 }),
    );
  });

  it("gives up after the second unparseable response without writing anything", async () => {
    messagesCreate.mockResolvedValue(claudeReply({ nonsense: true }));
    const { client, spy } = makeSupabase({});

    await expect(generateTrack(client, "user-1", "SQL")).rejects.toThrow();
    expect(spy.trackRowWritten).toBeNull();
    expect(messagesCreate).toHaveBeenCalledTimes(2);
  });
});

// -- Non-blocking extras ----------------------------------------------------

describe("generateTrack - backlog ranking is best-effort", () => {
  it("still returns a usable track when the ranking call throws", async () => {
    messagesCreate.mockResolvedValue(claudeReply(THREE_MILESTONES));
    assignBacklogPriorityMock.mockRejectedValue(new Error("ranking exploded"));
    const { client } = makeSupabase({});

    await expect(generateTrack(client, "user-1", "SQL")).resolves.toBe("track-1");
  });

  it("logs ranking spend separately when the ranking call succeeds", async () => {
    messagesCreate.mockResolvedValue(claudeReply(THREE_MILESTONES));
    assignBacklogPriorityMock.mockResolvedValue({
      model: "claude-haiku-4-5", inputTokens: 120, outputTokens: 40,
    });
    const { client } = makeSupabase({});

    await generateTrack(client, "user-1", "SQL");

    expect(logUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "tracker/priority", model: "claude-haiku-4-5" }),
    );
  });
});
