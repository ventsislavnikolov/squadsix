// TanStack Query options for every read. Routes prefetch these in their loaders; components
// read them with useSuspenseQuery, so a page never renders half-loaded.

import { queryOptions } from "@tanstack/react-query";
import {
  getFullRoster,
  getLog,
  getMatchday,
  getMatchdays,
  getPickList,
  getSession,
} from "@/server/functions";

/** Language and whether the admin is signed in. Changes only on explicit action. */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: () => getSession(),
  staleTime: Infinity,
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

export const fullRosterQuery = queryOptions({
  queryKey: ["full-roster"],
  queryFn: () => getFullRoster(),
});

export const logQuery = queryOptions({
  queryKey: ["log"],
  queryFn: () => getLog(),
});
