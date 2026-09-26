import { describe, expect, it } from "vitest";
import {
  bestSplits,
  overlap,
  scoreSplit,
  splitKey,
  splitProblem,
  type Player,
} from "./balance";

const squad: Player[] = [5, 4.5, 4, 4, 3.5, 3, 3, 2.5, 2, 2, 1.5, null].map((rating, i) => ({
  id: `p${i}`,
  rating,
  isGuest: rating === null,
}));
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
    const ok = bestSplits(squad)[0]!;
    expect(splitProblem(ok, squad)).toBeNull();
    expect(splitProblem({ teamA: ok.teamA.slice(1), teamB: ok.teamB }, squad)).toMatch(/exactly 6/);
    expect(
      splitProblem({ teamA: [...ok.teamA.slice(1), ok.teamB[0]!], teamB: ok.teamB }, squad),
    ).toMatch(/twice/);
    expect(splitProblem({ teamA: [...ok.teamA.slice(1), "x"], teamB: ok.teamB }, squad)).toMatch(
      /Unknown/,
    );
  });
});

describe("bestSplits", () => {
  it("returns three distinct, near-even games", () => {
    const splits = bestSplits(squad);
    expect(splits).toHaveLength(3);
    expect(new Set(splits.map(splitKey)).size).toBe(3);
    for (const s of splits) expect(scoreSplit(s, byId).gap).toBeLessThanOrEqual(0.5);
    expect(overlap(splits[0]!, splits[1]!)).toBeLessThanOrEqual(4);
  });

  it("needs exactly twelve players", () => {
    expect(bestSplits(squad.slice(1))).toEqual([]);
  });
});
