import { describe, expect, it } from "vitest";
import { brokenRules, NO_RULES, type Rules, ruleProblem } from "./rules";

const split = {
  teamA: ["p0", "p1", "p2", "p3", "p4", "p5"],
  teamB: ["p6", "p7", "p8", "p9", "p10", "p11"],
};

describe("brokenRules", () => {
  it("is 0 with no rules", () => {
    expect(brokenRules(split, NO_RULES)).toBe(0);
  });

  it("counts a Together group across both sides once per split pair", () => {
    expect(
      brokenRules(split, { together: [["p0", "p1", "p2"]], apart: [] })
    ).toBe(0);
    expect(
      brokenRules(split, { together: [["p0", "p1", "p6"]], apart: [] })
    ).toBe(2);
    expect(brokenRules(split, { together: [["p0", "p6"]], apart: [] })).toBe(1);
  });

  it("counts an Apart pair on the same side", () => {
    expect(brokenRules(split, { together: [], apart: [["p0", "p6"]] })).toBe(0);
    expect(brokenRules(split, { together: [], apart: [["p0", "p1"]] })).toBe(1);
  });

  it("binds only the players who are playing", () => {
    // "x" is not in the twelve: p0 and p6 still owe each other a side.
    expect(
      brokenRules(split, { together: [["p0", "p6", "x"]], apart: [] })
    ).toBe(1);
    expect(
      brokenRules(split, { together: [["p0", "x"]], apart: [["p1", "y"]] })
    ).toBe(0);
  });

  it("adds both kinds up", () => {
    const rules: Rules = {
      together: [["p0", "p6"]],
      apart: [
        ["p1", "p2"],
        ["p7", "p8"],
      ],
    };
    expect(brokenRules(split, rules)).toBe(3);
  });
});

describe("ruleProblem", () => {
  const rules: Rules = {
    together: [["a", "b"]],
    apart: [
      ["c", "d"],
      ["c", "e"],
    ],
  };

  it("accepts a rule that fits", () => {
    expect(
      ruleProblem(rules, { kind: "together", players: ["f", "g", "h"] })
    ).toBeNull();
    expect(
      ruleProblem(rules, { kind: "apart", players: ["a", "f"] })
    ).toBeNull();
  });

  it("keeps a player in one Together group", () => {
    expect(ruleProblem(rules, { kind: "together", players: ["b", "f"] })).toBe(
      "rule-taken"
    );
  });

  it("refuses Together and Apart on the same pair, either way round", () => {
    expect(ruleProblem(rules, { kind: "apart", players: ["b", "a"] })).toBe(
      "rule-conflict"
    );
    expect(ruleProblem(rules, { kind: "together", players: ["d", "c"] })).toBe(
      "rule-conflict"
    );
  });

  it("refuses the same Apart pair twice", () => {
    expect(ruleProblem(rules, { kind: "apart", players: ["d", "c"] })).toBe(
      "rule-exists"
    );
  });

  it("caps Apart partners at two, counted from both ends", () => {
    expect(ruleProblem(rules, { kind: "apart", players: ["c", "f"] })).toBe(
      "rule-limit"
    );
    expect(ruleProblem(rules, { kind: "apart", players: ["f", "c"] })).toBe(
      "rule-limit"
    );
    expect(
      ruleProblem(rules, { kind: "apart", players: ["d", "f"] })
    ).toBeNull();
  });
});
