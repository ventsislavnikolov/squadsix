// The app's server surface: TanStack Start server functions, called like local functions
// from the client and run only on the server (a Vercel function in production).
//
// Refusals are thrown as short codes ("locked", "run-limit", …); the page words them in
// the reader's language. Every action — refused or not — goes to the activity log.

import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { SQUAD_SIZE } from "@/domain/balance";
import { hasStarted, MAX_DAYS_AHEAD } from "@/domain/signup";
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
  | "admin-only"
  | "started"
  | "cancelled"
  | "not-allowed"
  | "not-full"
  | "bad-date"
  | "who";

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
export const getOpenMatch = createServerFn({ method: "GET" }).handler(async () => {
  const id = await repo.openMatchdayId();
  if (id) await clock(id);
  return { id };
});

export const getVenues = createServerFn({ method: "GET" }).handler(() =>
  repo.listVenues(isAdmin()),
);

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
  .handler(async ({ data }) => {
    await clock(data.id);
    return repo.getMatchday(data.id, isAdmin());
  });

export const getMatchdays = createServerFn({ method: "GET" }).handler(() =>
  repo.listMatchdays(),
);

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TIME = z.string().regex(/^\d{2}:\d{2}$/);
const VENUE = z.union([
  z.object({ id: z.uuid() }),
  z.object({ name: z.string().trim().min(2).max(60), mapUrl: z.url().max(500).nullable() }),
]);

async function venueId(v: z.infer<typeof VENUE>): Promise<string> {
  return "id" in v ? v.id : repo.ensureVenue(v.name, v.mapUrl);
}

/** Today .. 14 days ahead, and not in the past. */
async function checkWhen(date: string, time: string) {
  const w = await repo.checkWhen(date, time);
  if (!w.future || w.days < 0 || w.days > MAX_DAYS_AHEAD) fail("bad-date");
}

/** "Tuesday 20:00 at the office pitch" — people then sign up. One open game at a time. */
export const announce = createServerFn({ method: "POST" })
  .validator(
    z.object({
      date: DATE,
      time: TIME,
      venue: VENUE,
      note: z.string().trim().max(300).nullable(),
      actorId: z.uuid(),
    }),
  )
  .handler(async ({ data }) => {
    await checkWhen(data.date, data.time);
    const id = await repo.announce({
      date: data.date,
      time: data.time,
      venueId: await venueId(data.venue),
      note: data.note || null,
      createdBy: data.actorId,
    });
    await logAction({
      action: "matchday.announce",
      ok: id !== null,
      actor: await repo.playerLabel(data.actorId),
      matchdayId: id,
      detail: { date: data.date, time: data.time },
    });
    if (!id) fail("exists");
    return { id };
  });

/** Twelve ticked on the spot, teams straight away. */
export const quickCreate = createServerFn({ method: "POST" })
  .validator(
    z.object({
      playerIds: z.array(z.uuid()).length(SQUAD_SIZE),
      time: TIME.nullable(),
      venue: VENUE.nullable(),
      actorId: z.uuid().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    if (new Set(data.playerIds).size !== SQUAD_SIZE) fail("not-in-squad");
    const id = await repo.createQuick({
      playerIds: data.playerIds,
      time: data.time,
      venueId: data.venue ? await venueId(data.venue) : null,
      createdBy: data.actorId,
    });
    await logAction({ action: "matchday.create", ok: id !== null, matchdayId: id });
    if (!id) fail("exists");
    await runBalance(id, "manual");
    return { id };
  });

/** Who may change or cancel a game: whoever announced it, or the admin. */
async function requireOwner(id: string, actorId: string | null) {
  const info = await repo.matchInfo(id);
  if (!info) fail("not-found");
  if (info.cancelled) fail("cancelled");
  if (!isAdmin() && (!actorId || info.createdBy !== actorId)) fail("not-allowed");
  return info;
}

export const editMatch = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.uuid(),
      actorId: z.uuid().nullable(),
      date: DATE,
      time: TIME,
      venue: VENUE,
      note: z.string().trim().max(300).nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const info = await requireOwner(data.id, data.actorId);
    if (info.locked || hasStarted(info.startsAt)) fail("started");
    await checkWhen(data.date, data.time);
    const changes = await repo.editMatch(data.id, {
      date: data.date,
      time: data.time,
      venueId: await venueId(data.venue),
      note: data.note || null,
    });
    await logAction({
      action: "matchday.edit",
      actor: data.actorId ? await repo.playerLabel(data.actorId) : "admin",
      matchdayId: data.id,
      detail: { changes },
    });
  });

export const cancelMatch = createServerFn({ method: "POST" })
  .validator(
    z.object({ id: z.uuid(), actorId: z.uuid().nullable(), reason: z.string().trim().max(200).nullable() }),
  )
  .handler(async ({ data }) => {
    await requireOwner(data.id, data.actorId);
    await repo.cancelMatch(data.id, data.reason || null);
    await logAction({
      action: "matchday.cancel",
      actor: data.actorId ? await repo.playerLabel(data.actorId) : "admin",
      matchdayId: data.id,
      detail: { reason: data.reason },
    });
  });

/** Sign yourself (or someone else, or a guest) up. Closes at kick-off. */
export const signUp = createServerFn({ method: "POST" })
  .validator(z.object({ matchdayId: z.uuid(), playerId: z.uuid(), actorId: z.uuid() }))
  .handler(async ({ data }) => {
    const info = await repo.matchInfo(data.matchdayId);
    if (!info) fail("not-found");
    const refusal: ErrorCode | null = info.cancelled
      ? "cancelled"
      : hasStarted(info.startsAt) && info.kind === "announced"
        ? "started"
        : null;
    const added = refusal ? false : await repo.signUp(data.matchdayId, data.playerId, data.actorId);
    await logAction({
      action: "signup.add",
      ok: added,
      actor: await repo.playerLabel(data.actorId),
      matchdayId: data.matchdayId,
      detail: { player: await repo.playerLabel(data.playerId), refusal },
    });
    if (refusal) fail(refusal);
    if (added) await afterListChange(data.matchdayId);
  });

/** Take someone off: themselves, whoever added them, or the admin. */
export const withdraw = createServerFn({ method: "POST" })
  .validator(z.object({ matchdayId: z.uuid(), playerId: z.uuid(), actorId: z.uuid().nullable() }))
  .handler(async ({ data }) => {
    const [info, entry] = await Promise.all([
      repo.matchInfo(data.matchdayId),
      repo.signupOf(data.matchdayId, data.playerId),
    ]);
    if (!info || !entry) fail("not-found");
    const allowed =
      isAdmin() ||
      (data.actorId !== null &&
        (data.actorId === data.playerId || data.actorId === entry.addedBy));
    const refusal: ErrorCode | null = !allowed
      ? "not-allowed"
      : info.cancelled
        ? "cancelled"
        : hasStarted(info.startsAt) && info.kind === "announced"
          ? "started"
          : null;
    await logAction({
      action: "signup.remove",
      ok: !refusal,
      actor: data.actorId ? await repo.playerLabel(data.actorId) : "admin",
      matchdayId: data.matchdayId,
      detail: { player: await repo.playerLabel(data.playerId), refusal },
    });
    if (refusal) fail(refusal);
    await repo.withdraw(data.matchdayId, data.playerId);
    await afterListChange(data.matchdayId);
  });

/** "Make the teams" — once twelve are in. Counts as one of the three tries. */
export const makeTeams = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const info = await repo.matchInfo(data.id);
    if (!info) fail("not-found");
    const refusal: ErrorCode | null = info.cancelled
      ? "cancelled"
      : info.locked
        ? "locked"
        : info.squad !== SQUAD_SIZE
          ? "not-full"
          : info.hasTeams
            ? "exists"
            : info.runs >= repo.MAX_RUNS_PER_MATCHDAY
              ? "run-limit"
              : null;
    if (refusal) {
      await logAction({ action: "balance.run", ok: false, matchdayId: data.id, detail: { refusal } });
      fail(refusal);
    }
    await runBalance(data.id, "manual");
  });

/** Ask Jev again. Only before anyone has voted, only while open, at most three runs. */
export const rebalance = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const state = await repo.matchInfo(data.id);
    if (!state) fail("not-found");
    const refusal: ErrorCode | null = state.cancelled
      ? "cancelled"
      : state.locked
        ? "locked"
        : state.squad !== SQUAD_SIZE
          ? "not-full"
          : state.votes > 0
            ? "has-votes"
            : state.runs >= repo.MAX_RUNS_PER_MATCHDAY
              ? "run-limit"
              : null;
    if (refusal) {
      await logAction({ action: "balance.run", ok: false, matchdayId: data.id, detail: { refusal } });
      fail(refusal);
    }
    await runBalance(data.id, "manual");
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

/** The list changed: bring the twelve, the teams and the votes back in line. */
async function afterListChange(matchdayId: string) {
  const outcome = await repo.reconcile(matchdayId);
  if (outcome === "balance") await runBalance(matchdayId, "auto");
  if (outcome !== "none") {
    await logAction({ action: "signup.reconcile", matchdayId, detail: { outcome } });
  }
}

/** Whatever the clock says is due for this game — see repo.dueNow. */
async function clock(matchdayId: string) {
  const due = await repo.dueNow(matchdayId);
  if (due === "teams") await runBalance(matchdayId, "auto");
  if (due === "lock") {
    const chosen = await repo.lockMatchday(matchdayId);
    await logAction({
      action: "matchday.lock",
      ok: chosen !== null,
      actor: "auto",
      matchdayId,
      detail: { proposalId: chosen },
    });
  }
}

async function runBalance(matchdayId: string, trigger: "manual" | "auto") {
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
      trigger,
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
    actor: trigger === "auto" ? "auto" : null,
    detail: { source: result.source, model: result.model, error: result.error, trigger },
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

export const saveVenue = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.uuid(),
      name: z.string().trim().min(2).max(60),
      mapUrl: z.url().max(500).nullable(),
      hidden: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await repo.saveVenue(data);
    await logAction({ action: "admin.venue.save", actor: "admin", detail: { id: data.id } });
  });

export const getLog = createServerFn({ method: "GET" }).handler(() => {
  requireAdmin();
  return readLog();
});
