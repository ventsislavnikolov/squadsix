// Together and Apart rules — the admin's quiet say in who plays with whom.
//
// Rules are secret: nothing outside the admin's pages may mention them, so a split that
// keeps them must look like any other fair split. Both kinds come down to pairs of
// players, and a split is judged by how many of those pairs it breaks.

import type { Split } from "./balance";

export const TOGETHER_MAX = 3;
export const APART_MAX = 2;

export interface Rules {
  /** Pairs who never play on the same side. A player has at most APART_MAX partners. */
  apart: [string, string][];
  /** Groups of 2–3 players who always play on the same side. A player is in at most one. */
  together: string[][];
}

export const NO_RULES: Rules = { together: [], apart: [] };

export type RuleProblem =
  | "rule-exists"
  | "rule-taken"
  | "rule-limit"
  | "rule-conflict";

/**
 * How many rule pairs this split breaks: a Together pair on opposite sides, or an Apart
 * pair on the same side. Players not in the split are ignored, so a rule only binds
 * whoever of its players is playing. 0 = every rule kept.
 */
export function brokenRules(split: Split, rules: Rules): number {
  const inA = new Set(split.teamA);
  const inB = new Set(split.teamB);
  let broken = 0;
  // A group split a+b across the sides breaks a·b pairs: 2+1 breaks 2, 3+0 none.
  for (const group of rules.together) {
    broken +=
      group.filter((id) => inA.has(id)).length *
      group.filter((id) => inB.has(id)).length;
  }
  for (const [x, y] of rules.apart) {
    if ((inA.has(x) && inA.has(y)) || (inB.has(x) && inB.has(y))) {
      broken += 1;
    }
  }
  return broken;
}

/** The rules as they bind today's players: absent players dropped, idle rules gone. */
export function inPlay(rules: Rules, playerIds: string[]): Rules {
  const here = new Set(playerIds);
  return {
    together: rules.together
      .map((g) => g.filter((id) => here.has(id)))
      .filter((g) => g.length > 1),
    apart: rules.apart.filter(([a, b]) => here.has(a) && here.has(b)),
  };
}

/**
 * Why a new rule cannot be saved next to the existing ones, or null if it can. Only
 * direct contradictions are refused; anything else the day can't satisfy is left to the
 * balancer, which then breaks as few pairs as possible.
 */
export function ruleProblem(
  rules: Rules,
  rule: { kind: "together" | "apart"; players: string[] }
): RuleProblem | null {
  const [a, b] = rule.players;
  if (rule.kind === "together") {
    if (rule.players.some((id) => rules.together.some((g) => g.includes(id)))) {
      return "rule-taken";
    }
    const inside = new Set(rule.players);
    if (rules.apart.some(([x, y]) => inside.has(x) && inside.has(y))) {
      return "rule-conflict";
    }
    return null;
  }
  // The schema asks for two players; without both there is no pair to check.
  if (a === undefined || b === undefined) {
    return null;
  }
  if (
    rules.apart.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
  ) {
    return "rule-exists";
  }
  if (rules.together.some((g) => g.includes(a) && g.includes(b))) {
    return "rule-conflict";
  }
  const partners = (id: string) =>
    rules.apart.filter((pair) => pair.includes(id)).length;
  if (partners(a) >= APART_MAX || partners(b) >= APART_MAX) {
    return "rule-limit";
  }
  return null;
}
