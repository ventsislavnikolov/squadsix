// Realistic server answers for page tests, shaped like the views in src/server/repo.ts.
import type { LogEntry } from "@/server/log";
import type {
  BallHandover,
  MatchdaySummary,
  MatchdayView,
  ProposalView,
  RosterPlayer,
  RuleView,
  Venue,
} from "@/server/repo";

const HOUR = 60 * 60 * 1000;

/** An ISO time this many hours from now (negative: in the past). */
export function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * HOUR).toISOString();
}

/** The `YYYY-MM-DD` day of an ISO time. */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Player `i`: "Player i" in English, "Играч i" in Bulgarian, id `p<i>`. */
export function player(
  i: number,
  overrides: Partial<RosterPlayer> = {}
): RosterPlayer {
  return {
    id: `p${i}`,
    name: { bg: `Играч ${i}`, en: `Player ${i}` },
    hidden: false,
    isGuest: false,
    lastPlayed: null,
    ...overrides,
  };
}

/** Players 1..n. */
export function roster(
  n: number,
  overrides: Partial<RosterPlayer> = {}
): RosterPlayer[] {
  return Array.from({ length: n }, (_, i) => player(i + 1, overrides));
}

/** The admin's view of a player: full names and a rating. */
export function ratedPlayer(
  i: number,
  rating: number | null,
  overrides: Partial<RosterPlayer> = {}
): RosterPlayer {
  return player(i, {
    full: {
      firstBg: "Играч",
      lastBg: String(i),
      firstEn: "Player",
      lastEn: String(i),
    },
    rating,
    ...overrides,
  });
}

export function proposal(
  position: number,
  overrides: Partial<ProposalView> = {}
): ProposalView {
  const ids = roster(12).map((p) => p.id);
  // Each option swaps a different pair, so the three differ.
  const teamA = ids.slice(0, 6);
  const teamB = ids.slice(6);
  const [a] = teamA.splice(position - 1, 1, teamB[position - 1] ?? "p7");
  teamB.splice(position - 1, 1, a ?? "p1");
  return {
    id: `prop${position}`,
    position,
    gap: position * 0.5,
    teamA,
    teamB,
    verdict: null,
    ...overrides,
  };
}

export const VENUE: Venue = {
  id: "v1",
  name: "Office pitch",
  mapUrl: null,
  hidden: false,
};

/** An announced game three days ahead with `signed` players on the list. */
export function matchday(
  overrides: Partial<MatchdayView> = {},
  signed = 5
): MatchdayView {
  const players = roster(Math.max(signed, 1));
  // Three days ahead, unless the test gives a kick-off (or none).
  const startsAt = overrides.startsAt ?? hoursFromNow(72);
  const list = players.slice(0, signed);
  return {
    id: "m1",
    kind: "announced",
    playedOn: dayOf(startsAt),
    startsAt,
    venue: { id: VENUE.id, name: VENUE.name, mapUrl: null },
    note: null,
    createdBy: null,
    changedAt: null,
    changes: null,
    cancelledAt: null,
    cancelReason: null,
    lockedAt: null,
    lockedProposalId: null,
    players,
    proposals: [],
    run: null,
    scoreA: null,
    scoreB: null,
    signups: list.map((p) => ({
      playerId: p.id,
      addedBy: null,
      createdAt: hoursFromNow(-1),
    })),
    squad: list.slice(0, 12).map((p) => p.id),
    votes: [],
    winner: null,
    ...overrides,
  };
}

/** Twelve signed up and three options to vote on. */
export function votingDay(overrides: Partial<MatchdayView> = {}): MatchdayView {
  return matchday(
    {
      proposals: [proposal(1), proposal(2), proposal(3)],
      ...overrides,
    },
    12
  );
}

/** Voting over: option 1 won. */
export function lockedDay(overrides: Partial<MatchdayView> = {}): MatchdayView {
  return votingDay({
    lockedAt: hoursFromNow(-2),
    lockedProposalId: "prop1",
    ...overrides,
  });
}

export function summary(
  overrides: Partial<MatchdaySummary> = {}
): MatchdaySummary {
  return {
    id: "m1",
    kind: "announced",
    playedOn: "2026-10-30",
    startsAt: null,
    venueName: null,
    cancelled: false,
    locked: false,
    signupCount: 0,
    voteCount: 0,
    scoreA: null,
    scoreB: null,
    winner: null,
    ...overrides,
  };
}

export function handover(
  playerId: string,
  since: string,
  setBy: string | null = null
): BallHandover {
  return { playerId, since, setBy };
}

export function rule(
  id: string,
  kind: RuleView["kind"],
  players: string[]
): RuleView {
  return { id, kind, players };
}

export function logEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: "l1",
    at: "2026-10-30T18:00:00.000Z",
    action: "vote.cast",
    ok: true,
    actor: null,
    matchdayId: null,
    detail: null,
    ip: null,
    userAgent: null,
    ...overrides,
  };
}
