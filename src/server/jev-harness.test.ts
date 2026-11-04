import { decide } from "@tanstack/ai";
import { createOpenRouterDecider } from "@tanstack/ai-openrouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Player } from "@/domain/balance";
import { balanceWithJev, JEV_MODEL } from "./jev-harness";

vi.mock("@tanstack/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/ai")>()),
  decide: vi.fn(),
}));
vi.mock("@tanstack/ai-openrouter", () => ({
  createOpenRouterDecider: vi.fn(() => ({ name: "openrouter" })),
}));

const decideMock = vi.mocked(decide);

const squad: Player[] = [5, 4.5, 4, 4, 3.5, 3, 3, 2.5, 2, 2, 1.5, null].map(
  (rating, i) => ({ id: `p${i}`, rating, isGuest: rating === null })
);
const names = new Map(squad.slice(0, 11).map((p) => [p.id, `Name ${p.id}`]));

const meta = (model = "jev-1") => ({
  model,
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 7 },
});

/** Jev's answers: every candidate is "close", c2 looks stacked, c3 is the best game. */
function answerLikeJev() {
  decideMock.mockImplementation(((args: {
    questions: Record<string, unknown>;
  }) => {
    if ("best" in args.questions) {
      return Promise.resolve({
        best: { value: "c3", probabilities: { c3: 0.9, c1: 0.1 } },
        meta: meta(),
      });
    }
    return Promise.resolve({
      fairness: { score: 2, value: "close", confidence: 0.8 },
      stacked: { value: false, probability: 0.1 },
      meta: meta(),
    });
  }) as never);
}

describe("balanceWithJev", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENROUTER_API_KEY", "key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to arithmetic without an OpenRouter key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const result = await balanceWithJev(squad, names);

    expect(result.source).toBe("fallback");
    expect(result.model).toBe("arithmetic");
    expect(result.error).toBe("missing-key");
    expect(result.picks).toHaveLength(3);
    expect(result.picks.every((p) => p.verdict === null)).toBe(true);
    expect(result.trace.map((s) => s.kind)).toEqual(["measure", "decide"]);
    expect(result.trace[0]).toMatchObject({
      kind: "measure",
      combinations: 462,
      candidates: 10,
      rules: 0,
      broken: 0,
    });
    expect(result.trace[1]).toMatchObject({
      mode: "fallback",
      picked: ["c1", "c2", "c3"],
    });
    expect(decideMock).not.toHaveBeenCalled();
    expect(createOpenRouterDecider).not.toHaveBeenCalled();
  });

  it("judges every candidate, compares them and keeps the best three", async () => {
    answerLikeJev();
    const result = await balanceWithJev(squad, names);

    expect(createOpenRouterDecider).toHaveBeenCalledWith(JEV_MODEL, "key", {
      xTitle: "Squad Six",
      httpReferer: expect.any(String),
    });
    // Ten judge calls and one compare.
    expect(decideMock).toHaveBeenCalledTimes(11);
    expect(result.source).toBe("jev");
    expect(result.model).toBe("jev-1");
    expect(result.error).toBeNull();
    expect(result.picks).toHaveLength(3);

    // c3 is Jev's favourite, so it ranks first.
    const [first] = result.picks;
    expect(first?.verdict).toMatchObject({
      candidate: "c3",
      fairnessLabel: "close",
      fairnessConfidence: 0.8,
      stacked: 0.1,
      preferred: 0.9,
    });
    expect(first?.verdict?.fairness).toBeCloseTo(2 / 3);
    expect(first?.verdict?.rank).toBeCloseTo(2 / 3 - 0.05 + 0.45);

    const kinds = result.trace.map((s) => s.kind);
    expect(kinds.filter((k) => k === "judge")).toHaveLength(10);
    expect(kinds.slice(-2)).toEqual(["compare", "decide"]);
    const decided = result.trace.at(-1);
    expect(decided).toMatchObject({ kind: "decide", mode: "jev" });
    expect(decided?.kind === "decide" && decided.picked[0]).toBe("c3");

    const judge = result.trace.find((s) => s.kind === "judge");
    expect(judge).toMatchObject({ tokens: 7, model: "jev-1" });
  });

  it("shows Jev names and ratings, with '?' for the unknown and the unrated", async () => {
    answerLikeJev();
    await balanceWithJev(squad, names);

    const states = decideMock.mock.calls.map(
      ([args]) => (args as { state: unknown }).state
    );
    const lines = JSON.stringify(states);
    expect(lines).toContain("Name p0 (5.0)");
    // p11 is unrated and has no English name.
    expect(lines).toContain("? (?)");
    expect(states[0]).toMatchObject({
      totalA: expect.any(Number),
      totalB: expect.any(Number),
      difference: expect.any(Number),
      unratedPlayers: { teamA: expect.any(Number), teamB: expect.any(Number) },
    });
  });

  it("keeps fairness within 0..1 and treats a missing preference as 0", async () => {
    decideMock.mockImplementation((async (args: {
      questions: Record<string, unknown>;
    }) =>
      "best" in args.questions
        ? { best: { value: "c9", probabilities: {} }, meta: meta("jev-2") }
        : {
            fairness: { score: 9, value: "dead even", confidence: 1 },
            stacked: { value: true, probability: 0 },
            meta: meta("jev-2"),
          }) as never);
    const result = await balanceWithJev(squad, names);

    expect(result.model).toBe("jev-2");
    for (const pick of result.picks) {
      expect(pick.verdict?.fairness).toBe(1);
      expect(pick.verdict?.preferred).toBe(0);
    }
  });

  it("falls back and records the error when Jev fails", async () => {
    decideMock.mockRejectedValue(new Error("rate limited"));
    const result = await balanceWithJev(squad, names);

    expect(result.source).toBe("fallback");
    expect(result.error).toBe("rate limited");
    expect(result.trace.map((s) => s.kind)).toEqual([
      "measure",
      "error",
      "decide",
    ]);
    expect(result.trace[1]).toEqual({ kind: "error", message: "rate limited" });
  });

  it("words a thrown non-Error too", async () => {
    decideMock.mockRejectedValue("offline");
    const result = await balanceWithJev(squad, names);
    expect(result.error).toBe("offline");
  });

  it("measures the rules binding today's twelve", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const result = await balanceWithJev(squad, names, {
      together: [["p0", "p1"]],
      apart: [
        ["p2", "p3"],
        ["p4", "outsider"],
      ],
    });
    expect(result.trace[0]).toMatchObject({ rules: 2, broken: 0 });
    const [first] = result.picks;
    const sameSide = (a: string, b: string) =>
      [first?.split.teamA, first?.split.teamB].some(
        (team) => team?.includes(a) && team.includes(b)
      );
    expect(sameSide("p0", "p1")).toBe(true);
    expect(sameSide("p2", "p3")).toBe(false);
  });

  it("returns no picks and no broken count when the squad is not twelve", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const result = await balanceWithJev(squad.slice(1), names);
    expect(result.picks).toEqual([]);
    expect(result.trace[0]).toMatchObject({ candidates: 0, broken: 0 });
  });

  it("names the default model when nothing was judged", async () => {
    answerLikeJev();
    const result = await balanceWithJev(squad.slice(1), names);
    expect(result.source).toBe("jev");
    expect(result.model).toBe(JEV_MODEL);
    expect(result.picks).toEqual([]);
  });
});
