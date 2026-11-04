// Who plays and who waits.
//
// A sign-up list orders itself: the first twelve play, the rest are reserves. Guests can
// only be put on the list in the last 24 hours before kick-off, when it's clear the
// office is short. From then on whoever signs up joins the back of the queue, guest or
// not, and nobody already in is pushed out. (A guest added before this rule existed sits
// behind the regulars until the 24-hour mark, then stays.)

import { SQUAD_SIZE } from "./balance";

export const GUEST_PRIORITY_CUTOFF_H = 24;
/** Teams are made on their own this long before kick-off, if nobody pressed the button. */
export const AUTO_TEAMS_BEFORE_H = 2;
/** How far ahead a game can be announced. */
export const MAX_DAYS_AHEAD = 14;

export interface Signup {
  /** ISO time the person was put on the list. */
  createdAt: string;
  isGuest: boolean;
  playerId: string;
}

/**
 * The list in playing order. `startsAt` null means no kick-off time (a quick game), where
 * the list is simply first come, first served.
 */
export function orderSignups<T extends Signup>(
  signups: T[],
  startsAt: string | null
): T[] {
  const cutoff = startsAt
    ? Date.parse(startsAt) - GUEST_PRIORITY_CUTOFF_H * 3_600_000
    : null;
  const tier = (s: Signup) => {
    if (cutoff === null) {
      return 0;
    }
    if (Date.parse(s.createdAt) >= cutoff) {
      return 2; // late: everyone equal, back of the queue
    }
    return s.isGuest ? 1 : 0; // early: regulars before guests
  };
  return [...signups].sort(
    (a, b) =>
      tier(a) - tier(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
}

export function splitSquad<T>(ordered: T[]): { squad: T[]; reserves: T[] } {
  return {
    squad: ordered.slice(0, SQUAD_SIZE),
    reserves: ordered.slice(SQUAD_SIZE),
  };
}

/**
 * Locked teams are public, so they change as little as possible: whoever came in takes
 * the exact place of whoever left. With nobody to come in, the place stays empty (that
 * team is one short); a later arrival fills the shorter team first.
 */
export function patchLockedTeams(
  teams: { teamA: string[]; teamB: string[] },
  squad: string[]
): { teamA: string[]; teamB: string[]; changed: boolean } {
  const inSquad = new Set(squad);
  const onTeams = new Set([...teams.teamA, ...teams.teamB]);
  const arrivals = squad.filter((id) => !onTeams.has(id));

  let changed = false;
  const patch = (team: string[]) =>
    team.flatMap((id) => {
      if (inSquad.has(id)) {
        return [id];
      }
      changed = true;
      const next = arrivals.shift();
      return next ? [next] : [];
    });
  const teamA = patch(teams.teamA);
  const teamB = patch(teams.teamB);

  for (const id of arrivals) {
    changed = true;
    (teamA.length <= teamB.length ? teamA : teamB).push(id);
  }
  return { teamA, teamB, changed };
}

/** Guests can be signed up from 24 hours before kick-off. A quick game has no kick-off. */
export function guestsOpenAt(startsAt: string | null): number | null {
  return startsAt
    ? Date.parse(startsAt) - GUEST_PRIORITY_CUTOFF_H * 3_600_000
    : null;
}

export function guestsOpen(startsAt: string | null, now = Date.now()): boolean {
  const at = guestsOpenAt(startsAt);
  return at === null || now >= at;
}

export function teamsDue(startsAt: string, now = Date.now()): boolean {
  return now >= Date.parse(startsAt) - AUTO_TEAMS_BEFORE_H * 3_600_000;
}

export function hasStarted(startsAt: string | null, now = Date.now()): boolean {
  return startsAt !== null && now >= Date.parse(startsAt);
}
