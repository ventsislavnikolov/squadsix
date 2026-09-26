// The harness around Jev.
//
// Jev is a "System One" model: it does not write text or do sums, it answers typed
// questions (yes/no, pick one, score on a scale) with calibrated probabilities, fast.
// Its own notes say it is weak at counting and maths. So the work is split the way
// RefAI splits it — the machine measures, the model judges:
//
//   1. measure   code enumerates every 6v6 split and keeps ~10 near-even, distinct ones
//   2. judge     Jev scores each candidate on its own (small state, no context rot)
//   3. compare   Jev picks the single best game out of all candidates
//   4. decide    code combines the answers into a ranking and keeps the top three
//
// Every call is recorded as a step so the UI can show exactly how the teams were chosen.

import { boolean, choice, decide, score } from "@tanstack/ai";
import { createTypesafeDecider } from "@tanstack/ai-typesafe";
import {
  bestSplits,
  effectiveRating,
  scoreSplit,
  type Player,
  type Split,
  type SplitScore,
} from "@/domain/balance";

export const JEV_MODEL = "jev-latest";
const CANDIDATES = 10;
const PICK = 3;

const FAIRNESS_LEVELS = ["one-sided", "uneven", "close", "dead even"] as const;

export type Verdict = {
  /** Which candidate this was in the trace (c1..c10). */
  candidate: string;
  /** Jev's fairness score, 0..1 (raw fraction across FAIRNESS_LEVELS). */
  fairness: number;
  fairnessLabel: string;
  fairnessConfidence: number;
  /** P(a neutral player would call one side stacked). */
  stacked: number;
  /** P(Jev picks this as the best game of all candidates). */
  preferred: number;
  /** The combined number we rank on. */
  rank: number;
};

/** Plain JSON — trace steps go to Postgres and over the wire as-is. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type HarnessStep =
  | { kind: "measure"; label: string; candidates: number; ms: number }
  | {
      kind: "judge" | "compare";
      label: string;
      state: Json;
      questions: { [key: string]: Json };
      answers: { [key: string]: Json };
      model: string;
      tokens: number | null;
      ms: number;
    }
  | { kind: "decide"; label: string; picked: string[]; ms: number }
  | { kind: "error"; label: string; message: string };

export type HarnessResult = {
  source: "jev" | "fallback";
  model: string;
  error: string | null;
  trace: HarnessStep[];
  picks: { split: Split; score: SplitScore; verdict: Verdict | null; rationale: string }[];
};

export async function balanceWithJev(squad: Player[]): Promise<HarnessResult> {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const trace: HarnessStep[] = [];

  let t = performance.now();
  const candidates = bestSplits(squad, CANDIDATES).map((split, i) => ({
    key: `c${i + 1}`,
    split,
    score: scoreSplit(split, byId),
  }));
  trace.push({
    kind: "measure",
    label: `Кодът пробва всички 462 разпределения и остави ${candidates.length} почти равни и различни помежду си`,
    candidates: candidates.length,
    ms: ms(t),
  });

  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return fallback(candidates, trace, "TYPESAFE_API_KEY не е зададен — Jev не е извикан.");
  }
  const adapter = createTypesafeDecider(JEV_MODEL, apiKey, { timeout: 15_000 });

  try {
    // 2. judge — one small request per candidate, run in parallel.
    const judged = await Promise.all(
      candidates.map(async (c) => {
        const state = describeGame(c.split, c.score, byId);
        const questions = {
          fairness: score({
            instructions:
              "This is a casual 6-a-side office football game. Ratings run 1 (weak) to 5 (strong); " +
              "'?' is an unrated guest, counted as 2.5. Team totals are already computed and correct. " +
              "How evenly matched will this game be?",
            levels: FAIRNESS_LEVELS,
          }),
          stacked: boolean({
            instructions:
              "Would a neutral player look at these two line-ups and say one team is stacked — " +
              "for example the best players together, or all the unknown guests on one side?",
          }),
        };
        const s = performance.now();
        const r = await decide({ adapter, state, questions });
        trace.push({
          kind: "judge",
          label: `Jev оцени вариант ${c.key}`,
          state: json(state),
          questions: json(questions),
          answers: json({ fairness: r.fairness, stacked: r.stacked }),
          model: r.meta.model,
          tokens: r.meta.usage?.totalTokens ?? null,
          ms: ms(s),
        });
        return { ...c, fairness: r.fairness, stacked: r.stacked, model: r.meta.model };
      }),
    );

    // 3. compare — Jev sees every candidate and picks one.
    const state = {
      games: Object.fromEntries(
        candidates.map((c) => [c.key, describeGame(c.split, c.score, byId)]),
      ),
    };
    const options = Object.fromEntries(candidates.map((c) => [c.key, null])) as Record<
      string,
      null
    >;
    const questions = {
      best: choice({
        instructions:
          "Several possible line-ups for tonight's 6-a-side office game. Totals are precomputed and correct. " +
          "Which game will be the most fun because it is the closest contest?",
        options,
      }),
    };
    t = performance.now();
    const cmp = await decide({ adapter, state, questions });
    trace.push({
      kind: "compare",
      label: "Jev сравни всички варианти и избра най-добрия",
      state: { games: `${candidates.length} варианта` },
      questions: json(questions),
      answers: json({ best: cmp.best }),
      model: cmp.meta.model,
      tokens: cmp.meta.usage?.totalTokens ?? null,
      ms: ms(t),
    });

    // 4. decide — our ranking over Jev's answers. Weights are deliberately simple.
    t = performance.now();
    const ranked = judged
      .map((j) => {
        const preferred = cmp.best.probabilities[j.key] ?? 0;
        const verdict: Verdict = {
          candidate: j.key,
          fairness: j.fairness.score,
          fairnessLabel: j.fairness.value,
          fairnessConfidence: j.fairness.confidence,
          stacked: j.stacked.probability,
          preferred,
          rank: j.fairness.score - 0.5 * j.stacked.probability + 0.5 * preferred,
        };
        return { ...j, verdict };
      })
      .sort((a, b) => b.verdict.rank - a.verdict.rank)
      .slice(0, PICK);

    trace.push({
      kind: "decide",
      label: "Кодът подреди по: оценка − ½·„натъкмен“ + ½·„избран“ и взе първите 3",
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
        rationale: explain(r.verdict),
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    trace.push({ kind: "error", label: "Jev върна грешка", message });
    return fallback(candidates, trace, `Jev не отговори: ${message}`);
  }
}

function fallback(
  candidates: { key: string; split: Split; score: SplitScore }[],
  trace: HarnessStep[],
  error: string,
): HarnessResult {
  const picks = candidates.slice(0, PICK);
  trace.push({
    kind: "decide",
    label: "Без Jev: взимат се трите с най-малка разлика",
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
      rationale: `Най-малка разлика в сумата на рейтингите (${c.score.gap.toFixed(1)}). Jev не е питан.`,
    })),
  };
}

/** What Jev sees for one game: names, ratings as text, and totals we computed. */
function describeGame(split: Split, s: SplitScore, byId: Map<string, Player>) {
  const side = (ids: string[]) =>
    ids
      .map((id) => byId.get(id)!)
      .sort((a, b) => effectiveRating(b) - effectiveRating(a))
      .map((p) => `${p.name} (${p.rating === null ? "?" : p.rating.toFixed(1)})`);
  return {
    teamA: side(split.teamA),
    teamB: side(split.teamB),
    totalA: s.totalA,
    totalB: s.totalB,
    difference: s.gap,
    unratedGuests: { teamA: s.guestsA, teamB: s.guestsB },
  };
}

const LABEL_BG: Record<string, string> = {
  "one-sided": "едностранен",
  uneven: "неравен",
  close: "оспорван",
  "dead even": "напълно равен",
};

function explain(v: Verdict): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    `Оценка „${LABEL_BG[v.fairnessLabel] ?? v.fairnessLabel}“ (${pct(v.fairnessConfidence)} сигурност). ` +
    `Шанс да изглежда натъкмен: ${pct(v.stacked)}. ` +
    `Вероятност да е най-добрият мач: ${pct(v.preferred)}.`
  );
}

function json<T>(value: T): { [key: string]: Json } {
  return JSON.parse(JSON.stringify(value)) as { [key: string]: Json };
}

function ms(start: number) {
  return Math.round(performance.now() - start);
}
