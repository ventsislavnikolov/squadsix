// TanStack Query options for every read. Routes start these in their loaders without
// waiting (`warm`); components read them with useSuspenseQuery, so the page shows its
// skeleton at once and never renders half-loaded.

import { type QueryClient, queryOptions } from "@tanstack/react-query";
import {
  getBalls,
  getFullRoster,
  getLog,
  getMatchday,
  getMatchdays,
  getOpenMatch,
  getPickList,
  getRules,
  getSession,
  getVenues,
} from "@/server/functions";

/** Start reads without waiting for them; whoever renders them suspends until they land. */
export function warm(qc: QueryClient, ...queries: { queryKey: readonly unknown[] }[]) {
  for (const q of queries) void qc.ensureQueryData(q as never).catch(() => {});
}

/** Language and whether the admin is signed in. Changes only on explicit action. */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: () => getSession(),
  staleTime: Infinity,
});

/** Drives the nav ("New game" vs "Game") and whether "/" shows the picker at all. */
export const openMatchQuery = queryOptions({
  queryKey: ["open-match"],
  queryFn: () => getOpenMatch(),
});

export const pickListQuery = queryOptions({
  queryKey: ["pick-list"],
  queryFn: () => getPickList(),
});

export const matchdaysQuery = queryOptions({
  queryKey: ["matchdays"],
  queryFn: () => getMatchdays(),
});

export const matchdayQuery = (id: string) =>
  queryOptions({
    queryKey: ["matchday", id],
    queryFn: () => getMatchday({ data: { id } }),
    // Votes arrive from other phones; keep the page current without a manual refresh.
    refetchInterval: 5_000,
  });

/** Together and Apart rules. Admin-only. */
export const rulesQuery = queryOptions({
  queryKey: ["rules"],
  queryFn: () => getRules(),
});

export const fullRosterQuery = queryOptions({
  queryKey: ["full-roster"],
  queryFn: () => getFullRoster(),
});

export const logQuery = queryOptions({
  queryKey: ["log"],
  queryFn: () => getLog(),
});

/** Where the balls are: newest handover first. */
export const ballsQuery = queryOptions({
  queryKey: ["balls"],
  queryFn: () => getBalls(),
});

export const venuesQuery = queryOptions({
  queryKey: ["venues"],
  queryFn: () => getVenues(),
});
