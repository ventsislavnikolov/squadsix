import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  setCookie,
} from "@tanstack/react-start/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOFIA } from "@/lib/weather";
import {
  checkCredentials,
  endSession,
  isAdmin,
  requireAdmin,
  startSession,
} from "./auth";
import {
  addGuest,
  addRule,
  announce,
  cancelMatch,
  editMatch,
  getBalls,
  getCoords,
  getFullRoster,
  getLog,
  getMatchday,
  getMatchdays,
  getNowcast,
  getOpenMatch,
  getPickList,
  getRules,
  getSession,
  getVenues,
  lock,
  login,
  logout,
  makeTeams,
  passBalls,
  quickCreate,
  rebalance,
  rememberMe,
  removeRule,
  savePlayer,
  saveVenue,
  setLang,
  setResult,
  signUp,
  unlock,
  vote,
  withdraw,
} from "./functions";
import { resolveCoords } from "./geo";
import { balanceWithJev, type HarnessResult } from "./jev-harness";
import { logAction, readLog } from "./log";

// Server functions run their handler directly, after the validator parses the input,
// so a test exercises both the schema and the handler without Start.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let schema: { parse: (input: unknown) => unknown } | undefined;
    const builder = {
      validator(s: typeof schema) {
        schema = s;
        return builder;
      },
      handler(fn: (ctx: { data: unknown }) => unknown) {
        return (arg?: { data?: unknown }) =>
          fn({ data: schema ? schema.parse(arg?.data) : arg?.data });
      },
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  deleteCookie: vi.fn(),
  getCookie: vi.fn(),
  getRequestHeader: vi.fn(),
  setCookie: vi.fn(),
}));
vi.mock("./auth", () => ({
  checkCredentials: vi.fn(),
  endSession: vi.fn(),
  isAdmin: vi.fn(),
  requireAdmin: vi.fn(),
  startSession: vi.fn(),
}));
vi.mock("./log", () => ({ logAction: vi.fn(), readLog: vi.fn() }));
vi.mock("./geo", () => ({ resolveCoords: vi.fn() }));
vi.mock("./jev-harness", () => ({ balanceWithJev: vi.fn() }));
vi.mock("./repo", () => ({
  MAX_RUNS_PER_MATCHDAY: 3,
  addGuest: vi.fn(),
  addRule: vi.fn(),
  announce: vi.fn(),
  ballTrail: vi.fn(),
  cancelMatch: vi.fn(),
  castVote: vi.fn(),
  checkWhen: vi.fn(),
  clearVotes: vi.fn(),
  createQuick: vi.fn(),
  dueNow: vi.fn(),
  editMatch: vi.fn(),
  ensureVenue: vi.fn(),
  fullRoster: vi.fn(),
  getMatchday: vi.fn(),
  isGuest: vi.fn(),
  listMatchdays: vi.fn(),
  listRules: vi.fn(),
  listVenues: vi.fn(),
  lockMatchday: vi.fn(),
  matchInfo: vi.fn(),
  matchPlace: vi.fn(),
  openMatchdayId: vi.fn(),
  passBalls: vi.fn(),
  pickList: vi.fn(),
  playerLabel: vi.fn(),
  reconcile: vi.fn(),
  removeRule: vi.fn(),
  saveRun: vi.fn(),
  savePlayer: vi.fn(),
  saveVenue: vi.fn(),
  setResult: vi.fn(),
  signUp: vi.fn(),
  signupOf: vi.fn(),
  squadForBalance: vi.fn(),
  toRules: vi.fn(),
  unlockMatchday: vi.fn(),
  withdraw: vi.fn(),
}));

// The repo is mocked above; read it back typed, without a namespace import.
const repo = await import("./repo");
const r = vi.mocked(repo);
const admin = vi.mocked(isAdmin);
const log = vi.mocked(logAction);

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MATCH = uuid(1);
const ALICE = uuid(2);
const BOB = uuid(3);
const CAROL = uuid(4);
const PROPOSAL = uuid(5);
const VENUE = uuid(6);
const TWELVE = Array.from({ length: 12 }, (_, i) => uuid(100 + i));

const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

type Info = NonNullable<Awaited<ReturnType<typeof repo.matchInfo>>>;
function info(overrides: Partial<Info> = {}): Info {
  return {
    kind: "announced",
    startsAt: inHours(48),
    createdBy: null,
    locked: false,
    cancelled: false,
    votes: 0,
    runs: 0,
    squad: 12,
    hasTeams: false,
    ...overrides,
  };
}

const harnessResult: HarnessResult = {
  source: "jev",
  model: "jev-1",
  error: null,
  trace: [],
  picks: [
    {
      split: { teamA: ["a"], teamB: ["b"] },
      score: {
        totalA: 3,
        totalB: 3,
        gap: 0,
        guestsA: 0,
        guestsB: 0,
        topA: 0,
        topB: 0,
      },
      verdict: null,
    },
  ],
};

/** The last thing written to the activity log. */
const lastLog = () => log.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  admin.mockReturnValue(false);
  r.playerLabel.mockImplementation(async (id) => `label:${id}`);
  r.squadForBalance.mockResolvedValue({
    squad: [],
    namesEn: new Map(),
    rules: { together: [], apart: [] },
  });
  vi.mocked(balanceWithJev).mockResolvedValue(harnessResult);
  r.reconcile.mockResolvedValue("none");
  r.dueNow.mockResolvedValue(null as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("session", () => {
  it("reads the language, the admin, a crawler and the remembered player", async () => {
    vi.mocked(getCookie).mockImplementation((name) =>
      name === "s6_lang" ? "en" : ALICE
    );
    vi.mocked(getRequestHeader).mockReturnValue("facebookexternalhit/1.1");
    admin.mockReturnValue(true);
    expect(await getSession()).toEqual({
      lang: "en",
      isAdmin: true,
      crawler: true,
      me: ALICE,
    });
  });

  it("defaults to Bulgarian, a person and nobody picked", async () => {
    vi.mocked(getCookie).mockImplementation((name) =>
      name === "s6_me" ? "not-a-uuid" : undefined
    );
    vi.mocked(getRequestHeader).mockReturnValue(undefined);
    expect(await getSession()).toEqual({
      lang: "bg",
      isAdmin: false,
      crawler: false,
      me: "",
    });
    vi.mocked(getCookie).mockReturnValue(undefined);
    expect((await getSession()).me).toBe("");
  });

  it("remembers the picked player in a cookie, and forgets it", () => {
    vi.stubEnv("NODE_ENV", "production");
    rememberMe({ data: { playerId: ALICE } });
    expect(setCookie).toHaveBeenCalledWith(
      "s6_me",
      ALICE,
      expect.objectContaining({ path: "/", sameSite: "lax", secure: true })
    );
    rememberMe({ data: { playerId: "" } });
    expect(deleteCookie).toHaveBeenCalledWith("s6_me", { path: "/" });
    expect(() => rememberMe({ data: { playerId: "nope" } })).toThrow();
  });

  it("keeps the language for a year", () => {
    setLang({ data: { lang: "en" } });
    expect(setCookie).toHaveBeenCalledWith(
      "s6_lang",
      "en",
      expect.objectContaining({ maxAge: 60 * 60 * 24 * 365 })
    );
    expect(() => setLang({ data: { lang: "de" } as never })).toThrow();
  });

  it("signs the admin in and logs every attempt", async () => {
    vi.mocked(checkCredentials).mockReturnValue(true);
    await login({ data: { email: "a@b.c", password: "pw" } });
    expect(startSession).toHaveBeenCalled();
    expect(lastLog()).toEqual({
      action: "admin.login",
      ok: true,
      actor: "a@b.c",
    });

    vi.mocked(checkCredentials).mockReturnValue(false);
    await expect(
      login({ data: { email: "x@y.z", password: "no" } })
    ).rejects.toThrow("bad-login");
    expect(lastLog()).toMatchObject({ ok: false });
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it("signs out", async () => {
    await logout();
    expect(endSession).toHaveBeenCalled();
    expect(lastLog()).toEqual({ action: "admin.logout" });
  });
});

describe("roster and reads", () => {
  it("passes the admin flag to the lists that hide things", async () => {
    admin.mockReturnValue(true);
    r.pickList.mockResolvedValue([]);
    r.listVenues.mockResolvedValue([]);
    await getPickList();
    await getVenues();
    expect(r.pickList).toHaveBeenCalledWith(true);
    expect(r.listVenues).toHaveBeenCalledWith(true);
  });

  it("returns the ball trail and the matchdays as they are", async () => {
    r.ballTrail.mockResolvedValue("trail" as never);
    r.listMatchdays.mockResolvedValue("days" as never);
    expect(await getBalls()).toBe("trail");
    expect(await getMatchdays()).toBe("days");
  });

  it("adds a guest and logs who it is", async () => {
    r.addGuest.mockResolvedValue({ id: ALICE } as never);
    expect(await addGuest({ data: { name: "  Ivo  " } })).toEqual({
      id: ALICE,
    });
    expect(r.addGuest).toHaveBeenCalledWith("Ivo");
    expect(lastLog()).toEqual({
      action: "guest.add",
      actor: "Ivo",
      detail: { id: ALICE },
    });
    expect(() => addGuest({ data: { name: "I" } })).toThrow();
  });
});

describe("the clock", () => {
  it("has no open game to look after", async () => {
    r.openMatchdayId.mockResolvedValue(null);
    expect(await getOpenMatch()).toEqual({ id: null });
    expect(r.dueNow).not.toHaveBeenCalled();
  });

  it("makes the teams when they are due", async () => {
    r.openMatchdayId.mockResolvedValue(MATCH);
    r.dueNow.mockResolvedValue("teams" as never);
    expect(await getOpenMatch()).toEqual({ id: MATCH });
    expect(balanceWithJev).toHaveBeenCalled();
    expect(r.saveRun).toHaveBeenCalledWith(
      MATCH,
      expect.objectContaining({ trigger: "auto", model: "jev-1" }),
      [{ teamA: ["a"], teamB: ["b"], totalA: 3, totalB: 3, verdict: null }]
    );
    expect(lastLog()).toMatchObject({
      action: "balance.run",
      actor: "auto",
      detail: { trigger: "auto", source: "jev" },
    });
  });

  it("locks the game at kick-off", async () => {
    r.dueNow.mockResolvedValue("lock" as never);
    r.lockMatchday.mockResolvedValue(PROPOSAL);
    r.getMatchday.mockResolvedValue("day" as never);
    expect(await getMatchday({ data: { id: MATCH } })).toBe("day");
    expect(r.lockMatchday).toHaveBeenCalledWith(MATCH);
    expect(lastLog()).toEqual({
      action: "matchday.lock",
      ok: true,
      actor: "auto",
      matchdayId: MATCH,
      detail: { proposalId: PROPOSAL },
    });

    r.lockMatchday.mockResolvedValue(null);
    await getMatchday({ data: { id: MATCH } });
    expect(lastLog()).toMatchObject({ ok: false });
    expect(r.getMatchday).toHaveBeenCalledWith(MATCH, false);
  });
});

describe("balls", () => {
  it("lets a picked player pass the balls", async () => {
    r.passBalls.mockResolvedValue(true);
    await passBalls({ data: { playerId: BOB, actorId: ALICE } });
    expect(r.passBalls).toHaveBeenCalledWith(BOB, ALICE);
    expect(lastLog()).toEqual({
      action: "balls.pass",
      ok: true,
      actor: `label:${ALICE}`,
      detail: { to: `label:${BOB}`, moved: true },
    });
  });

  it("lets the admin pass them without picking a name", async () => {
    admin.mockReturnValue(true);
    r.passBalls.mockResolvedValue(true);
    await passBalls({ data: { playerId: BOB, actorId: null } });
    expect(lastLog()).toMatchObject({ ok: true, actor: "admin" });
  });

  it("refuses an anonymous visitor", async () => {
    await expect(
      passBalls({ data: { playerId: BOB, actorId: null } })
    ).rejects.toThrow("who");
    expect(r.passBalls).not.toHaveBeenCalled();
    expect(lastLog()).toMatchObject({
      ok: false,
      actor: null,
      detail: { moved: false },
    });
  });
});

describe("announce", () => {
  const data = {
    date: "2030-01-02",
    time: "19:00",
    venue: { id: VENUE },
    note: "",
    actorId: ALICE,
  };

  beforeEach(() => {
    r.checkWhen.mockResolvedValue({ future: true, days: 3 });
  });

  it("announces at a known venue", async () => {
    r.announce.mockResolvedValue(MATCH);
    expect(await announce({ data })).toEqual({ id: MATCH });
    expect(r.announce).toHaveBeenCalledWith({
      date: "2030-01-02",
      time: "19:00",
      venueId: VENUE,
      note: null,
      createdBy: ALICE,
    });
    expect(lastLog()).toEqual({
      action: "matchday.announce",
      ok: true,
      actor: `label:${ALICE}`,
      matchdayId: MATCH,
      detail: { date: "2030-01-02", time: "19:00" },
    });
  });

  it("adds a new venue on the way", async () => {
    r.announce.mockResolvedValue(MATCH);
    r.ensureVenue.mockResolvedValue(VENUE);
    await announce({
      data: {
        ...data,
        note: "Bring water",
        venue: { name: "Pitch", mapUrl: "https://maps.app.goo.gl/x" },
      },
    });
    expect(r.ensureVenue).toHaveBeenCalledWith(
      "Pitch",
      "https://maps.app.goo.gl/x"
    );
    expect(r.announce).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: VENUE, note: "Bring water" })
    );
  });

  it("refuses a second open game", async () => {
    r.announce.mockResolvedValue(null);
    await expect(announce({ data })).rejects.toThrow("exists");
    expect(lastLog()).toMatchObject({ ok: false, matchdayId: null });
  });

  it.each([
    { future: false, days: 1 },
    { future: true, days: -1 },
    { future: true, days: 15 },
  ])("refuses a date out of range (%o)", async (when) => {
    r.checkWhen.mockResolvedValue(when);
    await expect(announce({ data })).rejects.toThrow("bad-date");
    expect(r.announce).not.toHaveBeenCalled();
  });

  it("validates the input", () => {
    expect(() => announce({ data: { ...data, date: "2.1.2030" } })).toThrow();
    expect(() => announce({ data: { ...data, time: "7pm" } })).toThrow();
  });
});

describe("quick pick", () => {
  it("creates the game and makes the teams at once", async () => {
    r.createQuick.mockResolvedValue(MATCH);
    r.ensureVenue.mockResolvedValue(VENUE);
    expect(
      await quickCreate({
        data: {
          playerIds: TWELVE,
          time: "18:00",
          venue: { name: "Park", mapUrl: null },
          actorId: ALICE,
        },
      })
    ).toEqual({ id: MATCH });
    expect(r.createQuick).toHaveBeenCalledWith({
      playerIds: TWELVE,
      time: "18:00",
      venueId: VENUE,
      createdBy: ALICE,
    });
    expect(r.saveRun).toHaveBeenCalledWith(
      MATCH,
      expect.objectContaining({ trigger: "manual" }),
      expect.any(Array)
    );
    expect(lastLog()).toMatchObject({ action: "balance.run", actor: null });
  });

  it("works without a time or place", async () => {
    r.createQuick.mockResolvedValue(MATCH);
    await quickCreate({
      data: { playerIds: TWELVE, time: null, venue: null, actorId: null },
    });
    expect(r.createQuick).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: null, time: null, createdBy: null })
    );
  });

  it("refuses a player twice", async () => {
    const twice = [...TWELVE.slice(0, 11), uuid(100)];
    await expect(
      quickCreate({
        data: { playerIds: twice, time: null, venue: null, actorId: null },
      })
    ).rejects.toThrow("not-in-squad");
  });

  it("refuses when a game is already open", async () => {
    r.createQuick.mockResolvedValue(null);
    await expect(
      quickCreate({
        data: { playerIds: TWELVE, time: null, venue: null, actorId: null },
      })
    ).rejects.toThrow("exists");
    expect(balanceWithJev).not.toHaveBeenCalled();
  });
});

describe("edit and cancel", () => {
  const edit = {
    id: MATCH,
    actorId: null,
    date: "2030-01-02",
    time: "19:00",
    venue: { id: VENUE },
    note: "",
  };

  beforeEach(() => {
    r.checkWhen.mockResolvedValue({ future: true, days: 3 });
  });

  it("is for the admin only", async () => {
    await expect(editMatch({ data: edit })).rejects.toThrow("admin-only");
    await expect(
      cancelMatch({ data: { id: MATCH, actorId: null, reason: null } })
    ).rejects.toThrow("admin-only");
  });

  it("needs a game that exists and is not cancelled", async () => {
    admin.mockReturnValue(true);
    r.matchInfo.mockResolvedValue(null);
    await expect(editMatch({ data: edit })).rejects.toThrow("not-found");
    r.matchInfo.mockResolvedValue(info({ cancelled: true }));
    await expect(editMatch({ data: edit })).rejects.toThrow("cancelled");
  });

  it("leaves a locked or started game alone", async () => {
    admin.mockReturnValue(true);
    r.matchInfo.mockResolvedValue(info({ locked: true }));
    await expect(editMatch({ data: edit })).rejects.toThrow("started");
    r.matchInfo.mockResolvedValue(info({ startsAt: inHours(-1) }));
    await expect(editMatch({ data: edit })).rejects.toThrow("started");
  });

  it("saves the change and logs what changed", async () => {
    admin.mockReturnValue(true);
    r.matchInfo.mockResolvedValue(info());
    r.editMatch.mockResolvedValue(["time"] as never);
    await editMatch({ data: { ...edit, note: "Late" } });
    expect(r.editMatch).toHaveBeenCalledWith(MATCH, {
      date: "2030-01-02",
      time: "19:00",
      venueId: VENUE,
      note: "Late",
    });
    expect(lastLog()).toEqual({
      action: "matchday.edit",
      actor: "admin",
      matchdayId: MATCH,
      detail: { changes: ["time"] },
    });

    await editMatch({ data: { ...edit, actorId: ALICE } });
    expect(r.editMatch).toHaveBeenLastCalledWith(
      MATCH,
      expect.objectContaining({ note: null })
    );
    expect(lastLog()).toMatchObject({ actor: `label:${ALICE}` });
  });

  it("cancels with or without a reason", async () => {
    admin.mockReturnValue(true);
    r.matchInfo.mockResolvedValue(info());
    await cancelMatch({ data: { id: MATCH, actorId: null, reason: "" } });
    expect(r.cancelMatch).toHaveBeenCalledWith(MATCH, null);
    expect(lastLog()).toMatchObject({ actor: "admin" });

    await cancelMatch({ data: { id: MATCH, actorId: ALICE, reason: "Rain" } });
    expect(r.cancelMatch).toHaveBeenLastCalledWith(MATCH, "Rain");
    expect(lastLog()).toEqual({
      action: "matchday.cancel",
      actor: `label:${ALICE}`,
      matchdayId: MATCH,
      detail: { reason: "Rain" },
    });
  });
});

describe("sign-up", () => {
  const data = { matchdayId: MATCH, playerId: BOB, actorId: ALICE };

  it("needs the game", async () => {
    r.matchInfo.mockResolvedValue(null);
    await expect(signUp({ data })).rejects.toThrow("not-found");
  });

  it("signs a player up and brings the list back in line", async () => {
    r.matchInfo.mockResolvedValue(info());
    r.signUp.mockResolvedValue(true);
    r.reconcile.mockResolvedValue("balance");
    await signUp({ data });
    expect(r.signUp).toHaveBeenCalledWith(MATCH, BOB, ALICE);
    expect(balanceWithJev).toHaveBeenCalled();
    expect(lastLog()).toEqual({
      action: "signup.reconcile",
      matchdayId: MATCH,
      detail: { outcome: "balance" },
    });
    expect(log).toHaveBeenCalledWith({
      action: "signup.add",
      ok: true,
      actor: `label:${ALICE}`,
      matchdayId: MATCH,
      detail: { player: `label:${BOB}`, refusal: null },
    });
  });

  it("logs a reconcile that needs no new teams", async () => {
    r.matchInfo.mockResolvedValue(info());
    r.signUp.mockResolvedValue(true);
    r.reconcile.mockResolvedValue("patched" as never);
    await signUp({ data });
    expect(balanceWithJev).not.toHaveBeenCalled();
    expect(lastLog()).toMatchObject({ detail: { outcome: "patched" } });
  });

  it("does nothing more when the player was already on the list", async () => {
    r.matchInfo.mockResolvedValue(info());
    r.signUp.mockResolvedValue(false);
    await signUp({ data });
    expect(r.reconcile).not.toHaveBeenCalled();
    expect(lastLog()).toMatchObject({ action: "signup.add", ok: false });
  });

  it("refuses a cancelled or started game", async () => {
    r.matchInfo.mockResolvedValue(info({ cancelled: true }));
    await expect(signUp({ data })).rejects.toThrow("cancelled");
    r.matchInfo.mockResolvedValue(info({ startsAt: inHours(-1) }));
    await expect(signUp({ data })).rejects.toThrow("started");
    expect(r.signUp).not.toHaveBeenCalled();
    expect(lastLog()).toMatchObject({
      ok: false,
      detail: { refusal: "started" },
    });
  });

  it("keeps a quick game open after its time", async () => {
    r.matchInfo.mockResolvedValue(
      info({ kind: "quick", startsAt: inHours(-1) })
    );
    r.signUp.mockResolvedValue(true);
    await signUp({ data });
    expect(r.signUp).toHaveBeenCalled();
  });

  it("refuses a guest more than a day before an announced game", async () => {
    r.matchInfo.mockResolvedValue(info());
    r.isGuest.mockResolvedValue(true);
    await expect(signUp({ data })).rejects.toThrow("guest-early");
    expect(r.isGuest).toHaveBeenCalledWith(BOB);
  });

  it("lets a guest in during the last day, a player any time, and the admin always", async () => {
    r.signUp.mockResolvedValue(true);
    r.isGuest.mockResolvedValue(true);
    r.matchInfo.mockResolvedValue(info({ startsAt: inHours(12) }));
    await signUp({ data });

    r.isGuest.mockResolvedValue(false);
    r.matchInfo.mockResolvedValue(info());
    await signUp({ data });

    admin.mockReturnValue(true);
    r.isGuest.mockResolvedValue(true);
    await signUp({ data });
    expect(r.signUp).toHaveBeenCalledTimes(3);
  });
});

describe("withdraw", () => {
  const data = { matchdayId: MATCH, playerId: BOB, actorId: BOB };

  beforeEach(() => {
    r.matchInfo.mockResolvedValue(info());
    r.signupOf.mockResolvedValue({ addedBy: ALICE } as never);
  });

  it("needs the game and the sign-up", async () => {
    r.signupOf.mockResolvedValue(null as never);
    await expect(withdraw({ data })).rejects.toThrow("not-found");
    r.matchInfo.mockResolvedValue(null);
    await expect(withdraw({ data })).rejects.toThrow("not-found");
  });

  it("lets the player, whoever added them, or the admin take them off", async () => {
    await withdraw({ data });
    await withdraw({ data: { ...data, actorId: ALICE } });
    admin.mockReturnValue(true);
    await withdraw({ data: { ...data, actorId: null } });
    expect(r.withdraw).toHaveBeenCalledTimes(3);
    expect(r.reconcile).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "signup.remove", actor: "admin" })
    );
  });

  it("refuses anybody else", async () => {
    await expect(
      withdraw({ data: { ...data, actorId: CAROL } })
    ).rejects.toThrow("not-allowed");
    await expect(
      withdraw({ data: { ...data, actorId: null } })
    ).rejects.toThrow("not-allowed");
    expect(r.withdraw).not.toHaveBeenCalled();
    expect(lastLog()).toMatchObject({
      ok: false,
      detail: { player: `label:${BOB}`, refusal: "not-allowed" },
    });
  });

  it("refuses once the game is closed", async () => {
    r.matchInfo.mockResolvedValue(info({ cancelled: true }));
    await expect(withdraw({ data })).rejects.toThrow("cancelled");
  });
});

describe("make teams", () => {
  it("needs the game", async () => {
    r.matchInfo.mockResolvedValue(null);
    await expect(makeTeams({ data: { id: MATCH } })).rejects.toThrow(
      "not-found"
    );
  });

  it.each([
    [{ cancelled: true }, "cancelled"],
    [{ locked: true }, "locked"],
    [{ squad: 11 }, "not-full"],
    [{ hasTeams: true }, "exists"],
    [{ runs: 3 }, "run-limit"],
  ] as const)("refuses %o with %s and logs it", async (state, code) => {
    r.matchInfo.mockResolvedValue(info(state));
    await expect(makeTeams({ data: { id: MATCH } })).rejects.toThrow(code);
    expect(lastLog()).toEqual({
      action: "balance.run",
      ok: false,
      matchdayId: MATCH,
      detail: { refusal: code },
    });
    expect(balanceWithJev).not.toHaveBeenCalled();
  });

  it("makes them, past the run limit for the admin", async () => {
    r.matchInfo.mockResolvedValue(info());
    await makeTeams({ data: { id: MATCH } });
    admin.mockReturnValue(true);
    r.matchInfo.mockResolvedValue(info({ runs: 5 }));
    await makeTeams({ data: { id: MATCH } });
    expect(r.saveRun).toHaveBeenCalledTimes(2);
  });
});

describe("rebalance", () => {
  it("needs the game", async () => {
    r.matchInfo.mockResolvedValue(null);
    await expect(rebalance({ data: { id: MATCH } })).rejects.toThrow(
      "not-found"
    );
  });

  it("is for the admin only", async () => {
    r.matchInfo.mockResolvedValue(info());
    await expect(rebalance({ data: { id: MATCH } })).rejects.toThrow(
      "admin-only"
    );
  });

  it.each([
    [{ cancelled: true }, "cancelled"],
    [{ locked: true }, "locked"],
    [{ squad: 10 }, "not-full"],
  ] as const)("refuses %o with %s", async (state, code) => {
    admin.mockReturnValue(true);
    r.matchInfo.mockResolvedValue(info(state));
    await expect(rebalance({ data: { id: MATCH } })).rejects.toThrow(code);
    expect(lastLog()).toMatchObject({ ok: false, detail: { refusal: code } });
  });

  it("asks Jev again, then drops the votes", async () => {
    admin.mockReturnValue(true);
    r.matchInfo.mockResolvedValue(info({ hasTeams: true, runs: 9 }));
    await rebalance({ data: { id: MATCH } });
    expect(r.saveRun).toHaveBeenCalled();
    expect(r.clearVotes).toHaveBeenCalledWith(MATCH);
    expect(r.saveRun.mock.invocationCallOrder[0]).toBeLessThan(
      r.clearVotes.mock.invocationCallOrder[0] ?? 0
    );
  });
});

describe("vote", () => {
  const data = { matchdayId: MATCH, proposalId: PROPOSAL, playerId: ALICE };

  it("casts a vote", async () => {
    r.castVote.mockResolvedValue(true);
    await vote({ data });
    expect(r.castVote).toHaveBeenCalledWith(MATCH, ALICE, PROPOSAL);
    expect(lastLog()).toEqual({
      action: "vote.cast",
      ok: true,
      actor: `label:${ALICE}`,
      matchdayId: MATCH,
      detail: { proposalId: PROPOSAL },
    });
  });

  it("refuses once locked", async () => {
    r.castVote.mockResolvedValue(false);
    await expect(vote({ data })).rejects.toThrow("locked");
    expect(lastLog()).toMatchObject({ ok: false });
  });
});

describe("lock, unlock and result", () => {
  it("lets only the admin lock", async () => {
    await expect(lock({ data: { id: MATCH } })).rejects.toThrow("admin-only");
    expect(r.lockMatchday).not.toHaveBeenCalled();
    expect(lastLog()).toMatchObject({ action: "matchday.lock", ok: false });
  });

  it("locks, or says it already was", async () => {
    admin.mockReturnValue(true);
    r.lockMatchday.mockResolvedValue(PROPOSAL);
    await lock({ data: { id: MATCH } });
    expect(lastLog()).toEqual({
      action: "matchday.lock",
      ok: true,
      matchdayId: MATCH,
      detail: { proposalId: PROPOSAL },
    });
    r.lockMatchday.mockResolvedValue(null);
    await expect(lock({ data: { id: MATCH } })).rejects.toThrow("locked");
  });

  it("lets only the admin unlock", async () => {
    await expect(unlock({ data: { id: MATCH } })).rejects.toThrow("admin-only");
    expect(r.unlockMatchday).not.toHaveBeenCalled();
    admin.mockReturnValue(true);
    await unlock({ data: { id: MATCH } });
    expect(r.unlockMatchday).toHaveBeenCalledWith(MATCH);
    expect(lastLog()).toEqual({
      action: "matchday.unlock",
      ok: true,
      matchdayId: MATCH,
    });
  });

  it("lets only the admin enter the result, after the lock", async () => {
    const data = {
      id: MATCH,
      winner: "a" as const,
      scoreA: 5 as number | null,
      scoreB: 3 as number | null,
    };
    await expect(setResult({ data })).rejects.toThrow("admin-only");
    expect(r.setResult).not.toHaveBeenCalled();

    admin.mockReturnValue(true);
    r.setResult.mockResolvedValue(false);
    await expect(setResult({ data })).rejects.toThrow("not-locked");

    r.setResult.mockResolvedValue(true);
    await setResult({ data: { ...data, scoreA: null, scoreB: null } });
    expect(r.setResult).toHaveBeenLastCalledWith(MATCH, "a", null, null);
    expect(lastLog()).toEqual({
      action: "matchday.result",
      ok: true,
      matchdayId: MATCH,
      detail: { winner: "a", scoreA: null, scoreB: null },
    });
    expect(() => setResult({ data: { ...data, scoreA: 100 } })).toThrow();
  });
});

describe("weather", () => {
  it("resolves a map link to coordinates", async () => {
    vi.mocked(resolveCoords).mockResolvedValue({ lat: 1, lng: 2 });
    expect(
      await getCoords({ data: { mapUrl: "https://maps.app.goo.gl/x" } })
    ).toEqual({ lat: 1, lng: 2 });
    expect(() => getCoords({ data: { mapUrl: "nope" } })).toThrow();
  });

  describe("nowcast", () => {
    let n = 1000;
    /** A fresh game id each time: answers are cached per game for five minutes. */
    const nextId = () => {
      n += 1;
      return uuid(n);
    };
    const starts = () => Math.floor(Date.now() / 1000) + 3600;
    const fetchMock = vi.fn();

    beforeEach(() => {
      vi.stubEnv("RAINBOW_API_KEY", "secret");
      vi.stubGlobal("fetch", fetchMock);
      fetchMock.mockReset();
      vi.mocked(resolveCoords).mockResolvedValue({ lat: 42, lng: 23 });
    });

    const reply = (status: number, body: unknown = {}) => ({
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    });

    it("is off without a key", async () => {
      vi.stubEnv("RAINBOW_API_KEY", "");
      expect(await getNowcast({ data: { id: nextId() } })).toBeNull();
      expect(r.matchPlace).not.toHaveBeenCalled();
    });

    it("needs a game with a time that is not cancelled", async () => {
      r.matchPlace.mockResolvedValue(null as never);
      expect(await getNowcast({ data: { id: nextId() } })).toBeNull();
      r.matchPlace.mockResolvedValue({
        starts: null,
        cancelled: false,
        mapUrl: null,
      } as never);
      expect(await getNowcast({ data: { id: nextId() } })).toBeNull();
      r.matchPlace.mockResolvedValue({
        starts: starts(),
        cancelled: true,
        mapUrl: null,
      } as never);
      expect(await getNowcast({ data: { id: nextId() } })).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("only covers games within reach of the radar, until they end", async () => {
      const now = Math.floor(Date.now() / 1000);
      r.matchPlace.mockResolvedValue({
        starts: now + 5 * 3600,
        cancelled: false,
        mapUrl: null,
      } as never);
      expect(await getNowcast({ data: { id: nextId() } })).toBeNull();
      r.matchPlace.mockResolvedValue({
        starts: now - 2 * 3600,
        cancelled: false,
        mapUrl: null,
      } as never);
      expect(await getNowcast({ data: { id: nextId() } })).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reads the minutes of the game, falls back to the global product, and caches", async () => {
      const s = starts();
      r.matchPlace.mockResolvedValue({
        starts: s,
        cancelled: false,
        mapUrl: "https://maps.app.goo.gl/x",
      } as never);
      fetchMock.mockResolvedValueOnce(reply(404)).mockResolvedValueOnce(
        reply(200, {
          forecast: [
            { timestampBegin: s + 60, precipRate: 0.5, precipType: "snow" },
            { timestampBegin: s, precipRate: 0.1, precipType: "rain" },
            { timestampBegin: s - 3600, precipRate: 9, precipType: "rain" },
            { timestampBegin: s + 7200, precipRate: 9, precipType: "rain" },
          ],
        })
      );
      const id = nextId();
      const expected = { from: s, rates: [0.1, 0.5], snow: true };
      expect(await getNowcast({ data: { id } })).toEqual(expected);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "https://api.rainbow.ai/nowcast/v1/precip/23/42",
        { headers: { "Ocp-Apim-Subscription-Key": "secret" } }
      );
      expect(fetchMock.mock.calls[1]?.[0]).toBe(
        "https://api.rainbow.ai/nowcast/v1/precip-global/23/42"
      );

      expect(await getNowcast({ data: { id } })).toEqual(expected);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("uses Sofia when the place is unknown, and has nothing without minutes", async () => {
      vi.mocked(resolveCoords).mockResolvedValue(null);
      r.matchPlace.mockResolvedValue({
        starts: starts(),
        cancelled: false,
        mapUrl: null,
      } as never);
      fetchMock.mockResolvedValue(reply(200, {}));
      expect(await getNowcast({ data: { id: nextId() } })).toBeNull();
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `https://api.rainbow.ai/nowcast/v1/precip/${SOFIA.lng}/${SOFIA.lat}`
      );
    });

    it("has no nowcast when the radar refuses or the request fails", async () => {
      r.matchPlace.mockResolvedValue({
        starts: starts(),
        cancelled: false,
        mapUrl: null,
      } as never);
      fetchMock.mockResolvedValue(reply(500));
      expect(await getNowcast({ data: { id: nextId() } })).toBeNull();
      fetchMock.mockRejectedValue(new Error("offline"));
      expect(await getNowcast({ data: { id: nextId() } })).toBeNull();
    });
  });
});

describe("admin", () => {
  it("guards every admin read", async () => {
    r.fullRoster.mockResolvedValue("roster" as never);
    vi.mocked(readLog).mockResolvedValue("log" as never);
    r.listRules.mockResolvedValue("rules" as never);
    expect(await getFullRoster()).toBe("roster");
    expect(await getLog()).toBe("log");
    expect(await getRules()).toBe("rules");
    expect(requireAdmin).toHaveBeenCalledTimes(3);
  });

  it("stops at the guard", () => {
    vi.mocked(requireAdmin).mockImplementationOnce(() => {
      throw new Error("admin-only");
    });
    expect(() => getFullRoster()).toThrow("admin-only");
    expect(r.fullRoster).not.toHaveBeenCalled();
  });

  const player = {
    firstBg: "Иван",
    lastBg: "",
    firstEn: "Ivan",
    lastEn: "",
    rating: 3.5,
    isGuest: false,
    hidden: false,
  };

  it("creates and updates players, logging only what matters", async () => {
    r.savePlayer.mockResolvedValue({ id: ALICE } as never);
    expect(await savePlayer({ data: player })).toEqual({ id: ALICE });
    expect(lastLog()).toEqual({
      action: "admin.player.save",
      actor: "admin",
      detail: { id: ALICE, created: true, hidden: false, rated: true },
    });
    await savePlayer({
      data: { ...player, id: ALICE, rating: null, hidden: true },
    });
    expect(lastLog()).toMatchObject({
      detail: { created: false, hidden: true, rated: false },
    });
  });

  it("accepts ratings in half steps from 1 to 5 only", () => {
    expect(() => savePlayer({ data: { ...player, rating: 3.3 } })).toThrow();
    expect(() => savePlayer({ data: { ...player, rating: 0.5 } })).toThrow();
    expect(() => savePlayer({ data: { ...player, rating: 5.5 } })).toThrow();
  });

  it("saves a venue", async () => {
    const venue = { id: VENUE, name: "Pitch", mapUrl: null, hidden: true };
    await saveVenue({ data: venue });
    expect(r.saveVenue).toHaveBeenCalledWith(venue);
    expect(lastLog()).toEqual({
      action: "admin.venue.save",
      actor: "admin",
      detail: { id: VENUE },
    });
  });
});

describe("rules", () => {
  beforeEach(() => {
    r.listRules.mockResolvedValue([] as never);
    r.toRules.mockReturnValue({ together: [[ALICE, BOB]], apart: [] });
  });

  it("adds a rule that fits the others", async () => {
    r.addRule.mockResolvedValue({ id: PROPOSAL } as never);
    const data = { kind: "apart" as const, players: [ALICE, CAROL] };
    expect(await addRule({ data })).toEqual({ id: PROPOSAL });
    expect(r.addRule).toHaveBeenCalledWith("apart", [ALICE, CAROL]);
    expect(lastLog()).toEqual({
      action: "admin.rule.add",
      actor: "admin",
      detail: { id: PROPOSAL, ...data },
    });
  });

  it("refuses a rule that contradicts another, and logs why", async () => {
    await expect(
      addRule({ data: { kind: "apart", players: [ALICE, BOB] } })
    ).rejects.toThrow("rule-conflict");
    expect(r.addRule).not.toHaveBeenCalled();
    expect(lastLog()).toMatchObject({
      ok: false,
      detail: { problem: "rule-conflict" },
    });
  });

  it("validates the players", () => {
    expect(() =>
      addRule({ data: { kind: "apart", players: [ALICE, ALICE] } })
    ).toThrow();
    expect(() =>
      addRule({ data: { kind: "apart", players: [ALICE, BOB, CAROL] } })
    ).toThrow();
    expect(() =>
      addRule({ data: { kind: "together", players: [ALICE] } })
    ).toThrow();
  });

  it("removes a rule, or says it was not there", async () => {
    r.removeRule.mockResolvedValue(true);
    await removeRule({ data: { id: PROPOSAL } });
    expect(lastLog()).toEqual({
      action: "admin.rule.remove",
      ok: true,
      actor: "admin",
      detail: { id: PROPOSAL },
    });
    r.removeRule.mockResolvedValue(false);
    await expect(removeRule({ data: { id: PROPOSAL } })).rejects.toThrow(
      "not-found"
    );
  });
});
