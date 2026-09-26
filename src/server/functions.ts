// The app's server surface: TanStack Start server functions, called like local functions
// from the client and run only on the server (a Vercel function in production).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SQUAD_SIZE } from "@/domain/balance";
import { balanceWithJev } from "./jev-harness";
import * as repo from "./repo";

export const getPlayers = createServerFn({ method: "GET" }).handler(() => repo.listPlayers());

export const getMatchdays = createServerFn({ method: "GET" }).handler(() =>
  repo.listMatchdays(),
);

export const getMatchday = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) => repo.getMatchday(data.id));

export const addGuest = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(2).max(40) }))
  .handler(({ data }) => repo.addGuest(data.name));

/** Pick 12, save the game day, ask Jev for three proposals. Returns the game day id. */
export const createMatchday = createServerFn({ method: "POST" })
  .validator(z.object({ playerIds: z.array(z.uuid()).length(SQUAD_SIZE) }))
  .handler(async ({ data }) => {
    const id = await repo.createMatchday(data.playerIds);
    await runBalance(id);
    return { id };
  });

/** Ask Jev again for the same twelve. Replaces the proposals and clears the votes. */
export const rebalance = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await runBalance(data.id);
    return { id: data.id };
  });

export const vote = createServerFn({ method: "POST" })
  .validator(
    z.object({
      matchdayId: z.uuid(),
      proposalId: z.uuid(),
      voter: z.string().trim().min(2).max(40),
    }),
  )
  .handler(({ data }) => repo.castVote(data.matchdayId, data.voter, data.proposalId));

async function runBalance(matchdayId: string) {
  const squad = await repo.getSquad(matchdayId);
  const started = performance.now();
  const result = await balanceWithJev(squad);
  await repo.saveRun(
    matchdayId,
    {
      model: result.model,
      source: result.source,
      trace: result.trace,
      error: result.error,
      durationMs: Math.round(performance.now() - started),
    },
    result.picks.map((p, i) => ({
      position: i + 1,
      teamA: p.split.teamA,
      teamB: p.split.teamB,
      totalA: p.score.totalA,
      totalB: p.score.totalB,
      rationale: p.rationale,
      verdict: p.verdict,
    })),
  );
}
