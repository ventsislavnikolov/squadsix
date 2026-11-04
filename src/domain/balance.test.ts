import { assert, describe, expect, it } from "vitest";
import {
  bestSplits,
  formatRating,
  overlap,
  type Player,
  playerById,
  RATING_STEPS,
  scoreSplit,
  splitKey,
  splitProblem,
} from "./balance";
import { brokenRules, type Rules } from "./rules";

const EXACTLY_SIX = /exactly 6/u;
const TWICE = /twice/u;
const UNKNOWN = /Unknown/u;

const squad: Player[] = [5, 4.5, 4, 4, 3.5, 3, 3, 2.5, 2, 2, 1.5, null].map(
  (rating, i) => ({
    id: `p${i}`,
    rating,
    isGuest: rating === null,
  })
);
const byId = new Map(squad.map((p) => [p.id, p]));

describe("scoreSplit", () => {
  it("counts a guest as 2.5 and reports it", () => {
    const split = {
      teamA: ["p0", "p1", "p2", "p3", "p4", "p11"],
      teamB: ["p5", "p6", "p7", "p8", "p9", "p10"],
    };
    const s = scoreSplit(split, byId);
    expect(s.totalA).toBe(23.5);
    expect(s.totalB).toBe(14);
    expect(s.gap).toBe(9.5);
    expect(s.guestsA).toBe(1);
  });
});

describe("splitProblem", () => {
  it("rejects wrong sizes, duplicates and unknown ids", () => {
    const [ok] = bestSplits(squad);
    assert(ok, "bestSplits found no split");
    const [firstOfB] = ok.teamB;
    assert(firstOfB, "team B is empty");
    expect(splitProblem(ok, squad)).toBeNull();
    expect(
      splitProblem({ teamA: ok.teamA.slice(1), teamB: ok.teamB }, squad)
    ).toMatch(EXACTLY_SIX);
    expect(
      splitProblem(
        { teamA: [...ok.teamA.slice(1), firstOfB], teamB: ok.teamB },
        squad
      )
    ).toMatch(TWICE);
    expect(
      splitProblem(
        { teamA: [...ok.teamA.slice(1), "x"], teamB: ok.teamB },
        squad
      )
    ).toMatch(UNKNOWN);
  });
});

describe("bestSplits", () => {
  it("returns three distinct, near-even games", () => {
    const splits = bestSplits(squad);
    expect(splits).toHaveLength(3);
    expect(new Set(splits.map(splitKey)).size).toBe(3);
    for (const s of splits) {
      expect(scoreSplit(s, byId).gap).toBeLessThanOrEqual(0.5);
    }
    const [first, second] = splits;
    assert(first && second, "fewer than two splits");
    expect(overlap(first, second)).toBeLessThanOrEqual(4);
  });

  it("needs exactly twelve players", () => {
    expect(bestSplits(squad.slice(1))).toEqual([]);
  });
});

describe("bestSplits with rules", () => {
  const sameSide = (s: { teamA: string[]; teamB: string[] }, ids: string[]) =>
    ids.every((id) => s.teamA.includes(id)) ||
    ids.every((id) => s.teamB.includes(id));

  it("keeps a Together group on one side and an Apart pair on two", () => {
    // The two best together, the next two apart — the gap has to give, the rules don't.
    const rules: Rules = {
      together: [["p0", "p1", "p2"]],
      apart: [["p3", "p4"]],
    };
    const splits = bestSplits(squad, 3, rules);
    expect(splits).toHaveLength(3);
    for (const s of splits) {
      expect(sameSide(s, ["p0", "p1", "p2"])).toBe(true);
      expect(sameSide(s, ["p3", "p4"])).toBe(false);
    }
  });

  it("breaks as few pairs as possible when the rules can't all hold", () => {
    // Three people pairwise apart can't fit on two teams: one pair has to give.
    const rules: Rules = {
      together: [],
      apart: [
        ["p0", "p1"],
        ["p1", "p2"],
        ["p2", "p0"],
      ],
    };
    const splits = bestSplits(squad, 3, rules);
    expect(splits).toHaveLength(3);
    for (const s of splits) {
      expect(brokenRules(s, rules)).toBe(1);
    }
  });

  it("still offers three when the rules leave only near-identical games", () => {
    // p0–p2 together, five others pinned to the far side: four legal games, one swap apart.
    const rules: Rules = {
      together: [["p0", "p1", "p2"]],
      apart: [
        ["p0", "p3"],
        ["p0", "p4"],
        ["p1", "p5"],
        ["p1", "p6"],
        ["p2", "p7"],
      ],
    };
    const splits = bestSplits(squad, 3, rules);
    expect(splits).toHaveLength(3);
    expect(new Set(splits.map(splitKey)).size).toBe(3);
    for (const s of splits) {
      expect(brokenRules(s, rules)).toBe(0);
    }
  });
});

describe("playerById", () => {
  it("finds a squad member and refuses an outsider", () => {
    expect(playerById(byId, "p3")).toEqual({
      id: "p3",
      rating: 4,
      isGuest: false,
    });
    expect(() => playerById(byId, "x")).toThrow("Unknown player id: x");
  });
});

describe("splitKey", () => {
  it("names the same game the same way whichever side is A", () => {
    const split = {
      teamA: ["p6", "p7", "p8", "p9", "p10", "p11"],
      teamB: ["p0", "p1", "p2", "p3", "p4", "p5"],
    };
    const swapped = { teamA: split.teamB, teamB: split.teamA };
    expect(splitKey(split)).toBe(splitKey(swapped));
    expect(splitKey(split)).toBe("p0,p1,p2,p3,p4,p5|p10,p11,p6,p7,p8,p9");
  });
});

describe("ratings", () => {
  it("shows one decimal, and a question mark for the unrated", () => {
    expect(formatRating(4)).toBe("4.0");
    expect(formatRating(2.5)).toBe("2.5");
    expect(formatRating(null)).toBe("?");
  });

  it("offers every half step from 1 to 5", () => {
    expect(RATING_STEPS).toEqual([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  });
});
