// The arithmetic of a fair game. Jev proposes; this file checks.
//
// Everything the model says about a split is re-derived here before anyone sees it, so a
// proposal on screen always carries our totals, not the model's claim about them.

export const TEAM_SIZE = 6;
export const SQUAD_SIZE = TEAM_SIZE * 2;

/** What an unrated guest counts as. Shown as "?" — this number is only for the maths. */
export const GUEST_RATING = 2.5;

export type Player = {
  id: string;
  name: string;
  /** null = guest with no rating. */
  rating: number | null;
  isGuest: boolean;
};

export type Split = { teamA: string[]; teamB: string[] };

export type SplitScore = {
  totalA: number;
  totalB: number;
  /** |totalA - totalB| — the number a proposal is judged on first. */
  gap: number;
  guestsA: number;
  guestsB: number;
  /** Best player on each side — a split with both stars on one team is unfair at any gap. */
  topA: number;
  topB: number;
};

export function effectiveRating(p: Pick<Player, "rating">): number {
  return p.rating ?? GUEST_RATING;
}

export function scoreSplit(split: Split, byId: Map<string, Player>): SplitScore {
  const side = (ids: string[]) => {
    const ps = ids.map((id) => byId.get(id)!);
    return {
      total: round1(ps.reduce((s, p) => s + effectiveRating(p), 0)),
      guests: ps.filter((p) => p.rating === null).length,
      top: Math.max(...ps.map(effectiveRating)),
    };
  };
  const a = side(split.teamA);
  const b = side(split.teamB);
  return {
    totalA: a.total,
    totalB: b.total,
    gap: round1(Math.abs(a.total - b.total)),
    guestsA: a.guests,
    guestsB: b.guests,
    topA: a.top,
    topB: b.top,
  };
}

/**
 * Why a split cannot be shown, or null if it can. The reasons are written for the model:
 * the harness hands them straight back to Jev so it can fix its own answer.
 */
export function splitProblem(split: Split, squad: Player[]): string | null {
  const ids = new Set(squad.map((p) => p.id));
  const all = [...split.teamA, ...split.teamB];
  if (split.teamA.length !== TEAM_SIZE || split.teamB.length !== TEAM_SIZE) {
    return `Each team needs exactly ${TEAM_SIZE} players; got ${split.teamA.length} and ${split.teamB.length}.`;
  }
  const unknown = all.filter((id) => !ids.has(id));
  if (unknown.length) return `Unknown player ids: ${unknown.join(", ")}.`;
  const seen = new Set<string>();
  const dup = all.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  if (dup.length) return `Players listed twice: ${dup.join(", ")}.`;
  return null;
}

/** Same two teams regardless of which is called A — used to reject duplicate proposals. */
export function splitKey(split: Split): string {
  const a = [...split.teamA].sort().join(",");
  const b = [...split.teamB].sort().join(",");
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * The deterministic answer, used when Jev is unavailable or fails validation. Every
 * 6-of-12 split is only 462 distinct games, so we can simply try them all and keep the
 * best few that differ from each other.
 */
export function bestSplits(squad: Player[], count = 3): Split[] {
  if (squad.length !== SQUAD_SIZE) return [];
  const byId = new Map(squad.map((p) => [p.id, p]));
  const [first, ...rest] = squad;
  const candidates: { split: Split; score: SplitScore }[] = [];

  // Fixing the first player on team A halves the search: each game is seen once.
  for (const combo of combinations(rest, TEAM_SIZE - 1)) {
    const teamA = [first!.id, ...combo.map((p) => p.id)];
    const inA = new Set(teamA);
    const teamB = squad.filter((p) => !inA.has(p.id)).map((p) => p.id);
    const split = { teamA, teamB };
    candidates.push({ split, score: scoreSplit(split, byId) });
  }

  candidates.sort((x, y) => rank(x.score) - rank(y.score));

  // Pick proposals that are genuinely different games, not one swap apart.
  const picked: Split[] = [];
  for (const c of candidates) {
    if (picked.every((p) => overlap(p, c.split) <= TEAM_SIZE - 2)) picked.push(c.split);
    if (picked.length === count) break;
  }
  return picked;
}

/** How many players two splits keep together on the same side (best orientation). */
export function overlap(x: Split, y: Split): number {
  const a = new Set(x.teamA);
  const same = y.teamA.filter((id) => a.has(id)).length;
  return Math.max(same, TEAM_SIZE - same);
}

function rank(s: SplitScore): number {
  // Gap dominates; guests piled on one side, then lopsided best players, break ties.
  return s.gap * 100 + Math.abs(s.guestsA - s.guestsB) * 10 + Math.abs(s.topA - s.topB);
}

function* combinations<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    yield* combinations(items, k, i + 1, [...acc, items[i]!]);
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatRating(rating: number | null): string {
  return rating === null ? "?" : rating.toFixed(1);
}
