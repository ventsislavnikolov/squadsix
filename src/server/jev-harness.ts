// The harness around Jev.
//
// Jev is a "System One" model: it does not write text or do sums, it answers typed
// questions (yes/no, pick one, score on a scale) with calibrated probabilities, fast.
// Its own notes say it is weak at counting and maths. So the work is split the way
// RefAI splits it — the machine measures, the model judges:
//
//   1. measure   code enumerates every 6v6 split and keeps ~10 near-even, distinct ones
//                that keep the admin's rules (Jev is never told there are any)
//   2. judge     Jev scores each candidate on its own (small state, no context rot)
//   3. compare   Jev picks the single best game out of all candidates
//   4. decide    code combines the answers into a ranking and keeps the top three
//
// Every call is recorded as a step so the match page can show how the teams were chosen.
// Steps carry data, not sentences: the page words them in the reader's language.

import {
  type AnyEvaluateAdapter,
  boolean,
  choice,
  decide,
  score,
} from "@tanstack/ai";
import { createOpenRouterDecider } from "@tanstack/ai-openrouter";
import {
  bestSplits,
  effectiveRating,
  type Player,
  playerById,
  type Split,
  type SplitScore,
  scoreSplit,
} from "@/domain/balance";
import { brokenRules, inPlay, NO_RULES, type Rules } from "@/domain/rules";
import { SITE } from "@/lib/preview";

/** Jev as OpenRouter hosts it. */
export const JEV_MODEL = "~typesafe/jev-latest";
const CANDIDATES = 10;
const PICK = 3;

export const FAIRNESS_LEVELS = [
  "one-sided",
  "uneven",
  "close",
  "dead even",
] as const;
export type FairnessLevel = (typeof FAIRNESS_LEVELS)[number];

export interface Verdict {
  /** Which candidate this was in the trace (c1..c10). */
  candidate: string;
  /** Jev's fairness score, 0..1 across FAIRNESS_LEVELS. */
  fairness: number;
  fairnessConfidence: number;
  fairnessLabel: FairnessLevel;
  /** P(Jev picks this as the best game of all candidates). */
  preferred: number;
  /** The combined number we rank on. */
  rank: number;
  /** P(a neutral player would call one side stacked). */
  stacked: number;
}

/** Plain JSON — trace steps go to Postgres and over the wire as-is. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

interface JevCall {
  answers: { [key: string]: Json };
  model: string;
  ms: number;
  questions: { [key: string]: Json };
  /** What Jev was shown. Contains ratings, so only the admin ever receives it. */
  state: Json | null;
  tokens: number | null;
}

export type HarnessStep =
  | {
      kind: "measure";
      combinations: number;
      candidates: number;
      ms: number;
      /** Rules binding today's twelve, and how many pairs every candidate breaks. Older runs lack them. */
      rules?: number;
      broken?: number;
    }
  | ({ kind: "judge"; candidate: string } & JevCall)
  | ({ kind: "compare" } & JevCall)
  | { kind: "decide"; mode: "jev" | "fallback"; picked: string[]; ms: number }
  | { kind: "error"; message: string };

export interface HarnessResult {
  error: string | null;
  model: string;
  picks: { split: Split; score: SplitScore; verdict: Verdict | null }[];
  source: "jev" | "fallback";
  trace: HarnessStep[];
}

/**
 * @param names what to call each player in Jev's state — English, its strongest language.
 * @param rules who must or mustn't share a side. Applied before Jev sees anything.
 */
export async function balanceWithJev(
  squad: Player[],
  names: Map<string, string>,
  rules: Rules = NO_RULES
): Promise<HarnessResult> {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const trace: HarnessStep[] = [];

  let t = performance.now();
  const candidates = bestSplits(squad, CANDIDATES, rules).map((split, i) => ({
    key: `c${i + 1}`,
    split,
    score: scoreSplit(split, byId),
  }));
  const today = inPlay(
    rules,
    squad.map((p) => p.id)
  );
  trace.push({
    kind: "measure",
    combinations: 462,
    candidates: candidates.length,
    ms: ms(t),
    rules: today.together.length + today.apart.length,
    broken: candidates[0] ? brokenRules(candidates[0].split, rules) : 0,
  });

  const adapter = jevAdapter();
  if (!adapter) {
    return fallback(candidates, trace, "missing-key");
  }
  const describe = (c: (typeof candidates)[number]) =>
    describeGame(c.split, c.score, byId, names);

  try {
    // 2. judge — one small request per candidate, run in parallel.
    const judged = await Promise.all(
      candidates.map(async (c) => {
        const state = describe(c);
        const questions = {
          fairness: score({
            instructions:
              "This is a casual 6-a-side office football game. Ratings run 1 (weak) to 5 (strong); " +
              "'?' is an unrated player, counted as 2.5. Team totals are already computed and correct. " +
              "How evenly matched will this game be?",
            levels: FAIRNESS_LEVELS,
          }),
          stacked: boolean({
            instructions:
              "Would a neutral player look at these two line-ups and say one team is stacked — " +
              "for example the best players together, or all the unrated players on one side?",
          }),
        };
        const s = performance.now();
        const r = await decide({ adapter, state, questions });
        trace.push({
          kind: "judge",
          candidate: c.key,
          state: json(state),
          questions: json(questions),
          answers: json({ fairness: r.fairness, stacked: r.stacked }),
          model: r.meta.model,
          tokens: r.meta.usage.totalTokens,
          ms: ms(s),
        });
        return {
          ...c,
          fairness: r.fairness,
          stacked: r.stacked,
          model: r.meta.model,
        };
      })
    );

    // 3. compare — Jev sees every candidate and picks one.
    const state = {
      games: Object.fromEntries(candidates.map((c) => [c.key, describe(c)])),
    };
    const questions = {
      best: choice({
        instructions:
          "Several possible line-ups for tonight's 6-a-side office game. Totals are precomputed and correct. " +
          "Which game will be the most fun because it is the closest contest?",
        options: Object.fromEntries(
          candidates.map((c) => [c.key, null])
        ) as Record<string, null>,
      }),
    };
    t = performance.now();
    const cmp = await decide({ adapter, state, questions });
    trace.push({
      kind: "compare",
      state: json(state),
      questions: json(questions),
      answers: json({ best: cmp.best }),
      model: cmp.meta.model,
      tokens: cmp.meta.usage.totalTokens,
      ms: ms(t),
    });

    // 4. decide — our ranking over Jev's answers. Weights are deliberately simple.
    t = performance.now();
    const ranked = judged
      .map((j) => {
        const preferred = cmp.best.probabilities[j.key] ?? 0;
        // Jev's score runs 0..(levels − 1) — 2.99 means "almost dead even" on four
        // levels. Bring it to 0..1 so it weighs the same as the probabilities beside it.
        const fairness = clamp01(
          j.fairness.score / (FAIRNESS_LEVELS.length - 1)
        );
        const verdict: Verdict = {
          candidate: j.key,
          fairness,
          fairnessLabel: j.fairness.value,
          fairnessConfidence: j.fairness.confidence,
          stacked: j.stacked.probability,
          preferred,
          rank: fairness - 0.5 * j.stacked.probability + 0.5 * preferred,
        };
        return { ...j, verdict };
      })
      .sort((a, b) => b.verdict.rank - a.verdict.rank)
      .slice(0, PICK);

    trace.push({
      kind: "decide",
      mode: "jev",
      picked: ranked.map((r) => r.key),
      ms: ms(t),
    });

    return {
      source: "jev",
      model: judged[0]?.model ?? JEV_MODEL,
      error: null,
      trace,
      picks: ranked.map((r) => ({
        split: r.split,
        score: r.score,
        verdict: r.verdict,
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    trace.push({ kind: "error", message });
    return fallback(candidates, trace, message);
  }
}

/** Jev is reached through OpenRouter, which hosts the model. No key, no Jev. */
function jevAdapter(): AnyEvaluateAdapter | null {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return null;
  }
  return createOpenRouterDecider(JEV_MODEL, key, {
    xTitle: "Squad Six",
    httpReferer: SITE,
  });
}

function fallback(
  candidates: { key: string; split: Split; score: SplitScore }[],
  trace: HarnessStep[],
  error: string
): HarnessResult {
  const picks = candidates.slice(0, PICK);
  trace.push({
    kind: "decide",
    mode: "fallback",
    picked: picks.map((c) => c.key),
    ms: 0,
  });
  return {
    source: "fallback",
    model: "arithmetic",
    error,
    trace,
    picks: picks.map((c) => ({
      split: c.split,
      score: c.score,
      verdict: null,
    })),
  };
}

/** What Jev sees for one game: names, ratings as text, and totals we computed. */
function describeGame(
  split: Split,
  s: SplitScore,
  byId: Map<string, Player>,
  names: Map<string, string>
) {
  const side = (ids: string[]) =>
    ids
      .map((id) => playerById(byId, id))
      .sort((a, b) => effectiveRating(b) - effectiveRating(a))
      .map(
        (p) =>
          `${names.get(p.id) ?? "?"} (${p.rating === null ? "?" : p.rating.toFixed(1)})`
      );
  return {
    teamA: side(split.teamA),
    teamB: side(split.teamB),
    totalA: s.totalA,
    totalB: s.totalB,
    difference: s.gap,
    unratedPlayers: { teamA: s.guestsA, teamB: s.guestsB },
  };
}

function json<T>(value: T): { [key: string]: Json } {
  return JSON.parse(JSON.stringify(value)) as { [key: string]: Json };
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function ms(start: number) {
  return Math.round(performance.now() - start);
}
