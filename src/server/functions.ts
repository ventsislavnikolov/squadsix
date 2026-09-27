// The app's server surface: TanStack Start server functions, called like local functions
// from the client and run only on the server (a Vercel function in production).
//
// Refusals are thrown as short codes ("locked", "run-limit", …); the page words them in
// the reader's language. Every action — refused or not — goes to the activity log.

import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { SQUAD_SIZE } from "@/domain/balance";
import type { Lang } from "@/domain/names";
import { checkCredentials, endSession, isAdmin, requireAdmin, startSession } from "./auth";
import { balanceWithJev } from "./jev-harness";
import { logAction, readLog } from "./log";
import * as repo from "./repo";

export type ErrorCode =
  | "exists"
  | "locked"
  | "has-votes"
  | "run-limit"
  | "not-found"
  | "not-in-squad"
  | "not-locked"
  | "bad-login"
  | "admin-only";

function fail(code: ErrorCode): never {
  throw new Error(code);
}

const RATING = z
  .number()
  .min(1)
  .max(5)
  .refine((n) => Number.isInteger(n * 2))
  .nullable();

/* --------------------------------------------------------------------- session -- */

export type Session = { lang: Lang; isAdmin: boolean };

export const getSession = createServerFn({ method: "GET" }).handler(
  (): Session => ({
    lang: getCookie("s6_lang") === "en" ? "en" : "bg",
    isAdmin: isAdmin(),
  }),
);

export const setLang = createServerFn({ method: "POST" })
  .validator(z.object({ lang: z.enum(["bg", "en"]) }))
  .handler(({ data }) => {
    setCookie("s6_lang", data.lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  });

export const login = createServerFn({ method: "POST" })
  .validator(z.object({ email: z.string().max(200), password: z.string().max(200) }))
  .handler(async ({ data }) => {
    const ok = checkCredentials(data.email, data.password);
    await logAction({ action: "admin.login", ok, actor: data.email.slice(0, 100) });
    if (!ok) fail("bad-login");
    startSession();
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  await logAction({ action: "admin.logout" });
  endSession();
});

/* ----------------------------------------------------------------------- roster -- */

export const getPickList = createServerFn({ method: "GET" }).handler(() =>
  repo.pickList(isAdmin()),
);

/** The game still open (or today's), if any. While it exists, no new game. */
export const getOpenMatch = createServerFn({ method: "GET" }).handler(async () => ({
  id: await repo.openMatchdayId(),
}));

export const addGuest = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(2).max(60) }))
  .handler(async ({ data }) => {
    const guest = await repo.addGuest(data.name);
    await logAction({ action: "guest.add", actor: data.name, detail: { id: guest.id } });
    return guest;
  });

/* -------------------------------------------------------------------- matchdays -- */

export const getMatchday = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.uuid() }))
  .handler(({ data }) => repo.getMatchday(data.id, isAdmin()));

export const getMatchdays = createServerFn({ method: "GET" }).handler(() =>
  repo.listMatchdays(),
);

/** Pick 12 and ask Jev for three proposals. One game a day: returns today's if it exists. */
export const createMatchday = createServerFn({ method: "POST" })
  .validator(z.object({ playerIds: z.array(z.uuid()).length(SQUAD_SIZE) }))
  .handler(async ({ data }) => {
    if (new Set(data.playerIds).size !== SQUAD_SIZE) fail("not-in-squad");
    const { id, created } = await repo.createMatchday(data.playerIds);
    await logAction({ action: "matchday.create", ok: created, matchdayId: id });
    if (!created) return { id, created };
    await runBalance(id);
    return { id, created };
  });

/** Ask Jev again. Only before anyone has voted, only while open, at most three runs. */
export const rebalance = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const state = await repo.matchdayState(data.id);
    if (!state) fail("not-found");
    const refusal: ErrorCode | null = state.locked
      ? "locked"
      : state.votes > 0
        ? "has-votes"
        : state.runs >= repo.MAX_RUNS_PER_MATCHDAY
          ? "run-limit"
          : null;
    if (refusal) {
      await logAction({ action: "balance.run", ok: false, matchdayId: data.id, detail: { refusal } });
      fail(refusal);
    }
    await runBalance(data.id);
  });

export const vote = createServerFn({ method: "POST" })
  .validator(z.object({ matchdayId: z.uuid(), proposalId: z.uuid(), playerId: z.uuid() }))
  .handler(async ({ data }) => {
    const ok = await repo.castVote(data.matchdayId, data.playerId, data.proposalId);
    await logAction({
      action: "vote.cast",
      ok,
      actor: await repo.playerLabel(data.playerId),
      matchdayId: data.matchdayId,
      detail: { proposalId: data.proposalId },
    });
    if (!ok) fail("locked");
  });

export const lock = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const chosen = await repo.lockMatchday(data.id);
    await logAction({
      action: "matchday.lock",
      ok: chosen !== null,
      matchdayId: data.id,
      detail: { proposalId: chosen },
    });
    if (!chosen) fail("locked");
  });

export const unlock = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const admin = isAdmin();
    await logAction({ action: "matchday.unlock", ok: admin, matchdayId: data.id });
    if (!admin) fail("admin-only");
    await repo.unlockMatchday(data.id);
  });

export const setResult = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.uuid(),
      winner: z.enum(["a", "b", "draw"]),
      scoreA: z.number().int().min(0).max(99).nullable(),
      scoreB: z.number().int().min(0).max(99).nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const ok = await repo.setResult(data.id, data.winner, data.scoreA, data.scoreB);
    await logAction({
      action: "matchday.result",
      ok,
      matchdayId: data.id,
      detail: { winner: data.winner, scoreA: data.scoreA, scoreB: data.scoreB },
    });
    if (!ok) fail("not-locked");
  });

async function runBalance(matchdayId: string) {
  const { squad, namesEn } = await repo.squadForBalance(matchdayId);
  const started = performance.now();
  const result = await balanceWithJev(squad, namesEn);
  await repo.saveRun(
    matchdayId,
    {
      model: result.model,
      source: result.source,
      trace: result.trace,
      error: result.error,
      durationMs: Math.round(performance.now() - started),
    },
    result.picks.map((p) => ({
      teamA: p.split.teamA,
      teamB: p.split.teamB,
      totalA: p.score.totalA,
      totalB: p.score.totalB,
      verdict: p.verdict,
    })),
  );
  await logAction({
    action: "balance.run",
    matchdayId,
    detail: { source: result.source, model: result.model, error: result.error },
  });
}

/* ------------------------------------------------------------------------ admin -- */

export const getFullRoster = createServerFn({ method: "GET" }).handler(() => {
  requireAdmin();
  return repo.fullRoster();
});

export const savePlayer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.uuid().optional(),
      firstBg: z.string().trim().min(1).max(40),
      lastBg: z.string().trim().max(40),
      firstEn: z.string().trim().min(1).max(40),
      lastEn: z.string().trim().max(40),
      rating: RATING,
      isGuest: z.boolean(),
      hidden: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const saved = await repo.savePlayer(data);
    await logAction({
      action: "admin.player.save",
      actor: "admin",
      detail: { id: saved.id, created: !data.id, hidden: data.hidden, rated: data.rating !== null },
    });
    return saved;
  });

export const getLog = createServerFn({ method: "GET" }).handler(() => {
  requireAdmin();
  return readLog();
});
