// TanStack Query options for every read. Routes prefetch these in their loaders; components
// read them with useSuspenseQuery, so a page never renders half-loaded.

import { queryOptions } from "@tanstack/react-query";
import { getMatchday, getMatchdays, getPlayers } from "@/server/functions";

export const playersQuery = queryOptions({
  queryKey: ["players"],
  queryFn: () => getPlayers(),
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
