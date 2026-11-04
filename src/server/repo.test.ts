import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answer,
  answerOnce,
  queries,
  ran,
  resetSql,
} from "../../test/fake-sql";
import {
  addGuest,
  addRule,
  announce,
  ballTrail,
  cancelMatch,
  castVote,
  checkWhen,
  clearVotes,
  createQuick,
  dueNow,
  editMatch,
  ensureVenue,
  fullRoster,
  getMatchday,
  isGuest,
  listMatchdays,
  listRules,
  listVenues,
  lockMatchday,
  matchInfo,
  matchPlace,
  openMatchdayId,
  passBalls,
  pickList,
  playerLabel,
  reconcile,
  removeRule,
  savePlayer,
  saveRun,
  saveVenue,
  setResult,
  signUp,
  signupOf,
  squadForBalance,
  toRules,
  unlockMatchday,
  withdraw,
} from "./repo";

vi.mock("./db", () => import("../../test/fake-sql"));

const NOW = Date.parse("2026-11-04T12:00:00Z");
const DAY = 86_400_000;
const HOUR = 3_600_000;

const PLAYERS = "from players p";
const SQUAD_IDS = "select player_id from matchday_players where matchday_id";

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function player(
  id: string,
  [firstBg, lastBg, firstEn, lastEn]: [string, string, string, string],
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    first_bg: firstBg,
    last_bg: lastBg,
    first_en: firstEn,
    last_en: lastEn,
    rating: "3.5",
    is_guest: false,
    hidden: false,
    created_at: iso(NOW - 400 * DAY),
    last_played: null,
    ...extra,
  };
}

const ivan = player("ivan", ["Иван", "Петров", "Ivan", "Petrov"]);
const asen = player("asen", ["Асен", "Колев", "Asen", "Kolev"], {
  rating: null,
});
const hidden = player("bobi", ["Боби", "Бонев", "Bobi", "Bonev"], {
  hidden: true,
});
const freshGuest = player("gosho", ["Гошо", "", "Gosho", ""], {
  is_guest: true,
  last_played: iso(NOW - 10 * DAY),
});
const newGuest = player("dido", ["Дидо", "", "Dido", ""], {
  is_guest: true,
  created_at: iso(NOW - DAY),
});
const staleGuest = player("zhoro", ["Жоро", "", "Zhoro", ""], {
  is_guest: true,
  last_played: iso(NOW - 90 * DAY),
});
const roster = [ivan, asen, hidden, freshGuest, newGuest, staleGuest];

/** Twelve regulars, p01..p12, signed up an hour apart. */
const twelve = Array.from({ length: 12 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return player(`p${n}`, [`Играч${n}`, "Б", `Player${n}`, "B"]);
});
const signupsOf = (ids: string[]) =>
  ids.map((id, i) => ({
    player_id: id,
    is_guest: false,
    created_at: iso(NOW - (ids.length - i) * HOUR),
  }));
const ids12 = twelve.map((p) => p.id);

beforeEach(() => {
  resetSql();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("players", () => {
  it("lists who can be picked, regulars first, without ratings for players", async () => {
    answer(PLAYERS, roster);
    const list = await pickList(false);
    expect(list.map((p) => p.id)).toEqual(["asen", "ivan", "gosho", "dido"]);
    expect(list[0]).toEqual({
      id: "asen",
      name: { bg: "Асен", en: "Asen" },
      isGuest: false,
      hidden: false,
      lastPlayed: null,
    });
  });

  it("gives the admin ratings and full names", async () => {
    answer(PLAYERS, roster);
    const [first, second] = await pickList(true);
    expect(first?.rating).toBeNull();
    expect(second?.rating).toBe(3.5);
    expect(second?.full).toEqual({
      firstBg: "Иван",
      lastBg: "Петров",
      firstEn: "Ivan",
      lastEn: "Petrov",
    });
  });

  it("shows the admin everyone, hidden included", async () => {
    answer(PLAYERS, roster);
    const all = await fullRoster();
    expect(all).toHaveLength(roster.length);
    expect(all.find((p) => p.id === "bobi")?.hidden).toBe(true);
  });

  it("reuses and un-hides a guest whose name was typed again", async () => {
    answer(PLAYERS, roster);
    expect(await addGuest("gosho")).toEqual({ id: "gosho" });
    expect(ran("update players set hidden = false")[0]?.values).toEqual([
      "gosho",
    ]);
    expect(ran("insert into players")).toHaveLength(0);
  });

  it("adds a new guest in both scripts", async () => {
    answer(PLAYERS, roster);
    answer("insert into players", [{ id: "new" }]);
    expect(await addGuest("  Тошо   Тодоров ")).toEqual({ id: "new" });
    expect(ran("insert into players")[0]?.values).toEqual([
      "Тошо",
      "Тодоров",
      "Tosho",
      "Todorov",
    ]);
  });

  it("fails loudly when an insert returns no id", async () => {
    answer(PLAYERS, []);
    await expect(addGuest("Pesho")).rejects.toThrow("returned no row");
  });

  it("updates a known player and inserts a new one", async () => {
    const input = {
      firstBg: "Иван",
      lastBg: "Петров",
      firstEn: "Ivan",
      lastEn: "Petrov",
      rating: 4,
      isGuest: false,
      hidden: true,
    };
    expect(await savePlayer({ ...input, id: "ivan" })).toEqual({ id: "ivan" });
    expect(ran("update players set first_bg")[0]?.values).toEqual([
      "Иван",
      "Петров",
      "Ivan",
      "Petrov",
      4,
      false,
      true,
      "ivan",
    ]);
    answer("insert into players", [{ id: 7 }]);
    expect(await savePlayer(input)).toEqual({ id: "7" });
  });

  it("tells guests apart and labels players for the log", async () => {
    answerOnce("select is_guest", [{ is_guest: true }]);
    expect(await isGuest("gosho")).toBe(true);
    expect(await isGuest("nobody")).toBe(false);
    answerOnce("select first_bg, last_bg", [{ first_bg: "Гошо", last_bg: "" }]);
    expect(await playerLabel("gosho")).toBe("Гошо");
    expect(await playerLabel("nobody")).toBe("nobody");
  });
});

describe("rules", () => {
  const rules = [
    { id: 1, kind: "together", players: ["a", "b", "c"] },
    { id: 2, kind: "apart", players: ["a", "d"] },
    { id: 3, kind: "apart", players: ["e"] },
  ];

  it("lists the rules and turns them into what the balancer reads", async () => {
    answer("from team_rules", rules);
    const list = await listRules();
    expect(list[0]).toEqual({
      id: "1",
      kind: "together",
      players: ["a", "b", "c"],
    });
    // An Apart row without two players binds nobody.
    expect(toRules(list)).toEqual({
      together: [["a", "b", "c"]],
      apart: [["a", "d"]],
    });
  });

  it("adds and removes a rule", async () => {
    answer("insert into team_rules", [{ id: 9 }]);
    expect(await addRule("apart", ["a", "b"])).toEqual({ id: "9" });
    expect(ran("insert into team_rules")[0]?.values).toEqual([
      "apart",
      ["a", "b"],
    ]);
    answerOnce("delete from team_rules", [{ id: 9 }]);
    expect(await removeRule("9")).toBe(true);
    expect(await removeRule("9")).toBe(false);
  });
});

describe("venues", () => {
  it("lists venues, hidden ones only when asked", async () => {
    answer("from venues v", [
      { id: 1, name: "Arena", map_url: "https://maps", hidden: false },
      { id: 2, name: "Old", map_url: null, hidden: true },
    ]);
    expect(await listVenues(true)).toEqual([
      { id: "1", name: "Arena", mapUrl: "https://maps", hidden: false },
      { id: "2", name: "Old", mapUrl: null, hidden: true },
    ]);
    expect(ran("from venues v")[0]?.values).toEqual([true]);
  });

  it("creates or revives a venue by name, and saves edits", async () => {
    answer("insert into venues", [{ id: 4 }]);
    expect(await ensureVenue("Arena", null)).toBe("4");
    await saveVenue({ id: "4", name: "Arena 2", mapUrl: null, hidden: true });
    expect(ran("update venues set name")[0]?.values).toEqual([
      "Arena 2",
      null,
      true,
      "4",
    ]);
  });
});

describe("creating games", () => {
  it("finds the open game, if any", async () => {
    answerOnce("select id from matchdays", [{ id: 5 }]);
    expect(await openMatchdayId()).toBe("5");
    expect(await openMatchdayId()).toBeNull();
  });

  it("announces a game unless one is open or the day is taken", async () => {
    const game = {
      date: "2026-11-10",
      time: "19:00",
      venueId: "v",
      note: null,
      createdBy: "ivan",
    };
    answerOnce("insert into matchdays", [{ id: 6 }]);
    expect(await announce(game)).toBe("6");
    expect(await announce(game)).toBeNull();
  });

  it("refuses a quick game while another is open", async () => {
    const quick = {
      playerIds: ids12,
      time: null,
      venueId: null,
      createdBy: null,
    };
    expect(await createQuick(quick)).toBeNull();
    expect(queries).toHaveLength(1);
  });

  it("creates a quick game with the ticked twelve in order", async () => {
    answer("insert into matchdays", [{ id: 8 }]);
    const id = await createQuick({
      playerIds: ids12,
      time: "18:30",
      venueId: "v",
      createdBy: "ivan",
    });
    expect(id).toBe("8");
    expect(ran("insert into signups")[0]?.values).toEqual(["8", ids12]);
    expect(ran("delete from matchday_players")[0]?.values).toEqual([
      "8",
      ids12,
    ]);
    expect(ran("insert into matchday_players")[0]?.values).toEqual([
      "8",
      ids12,
    ]);
  });

  it("checks whether a date and time lie ahead", async () => {
    answer("as future", [{ future: true, days: "3" }]);
    expect(await checkWhen("2026-11-07", "19:00")).toEqual({
      future: true,
      days: 3,
    });
  });
});

describe("match facts", () => {
  it("reads what the guards need", async () => {
    expect(await matchInfo("x")).toBeNull();
    answer("from matchdays m where id", [
      {
        kind: "announced",
        starts_at: null,
        created_by: null,
        locked: false,
        cancelled: true,
        votes: "2",
        runs: "1",
        squad: "12",
        has_teams: true,
      },
    ]);
    expect(await matchInfo("x")).toEqual({
      kind: "announced",
      startsAt: null,
      createdBy: null,
      locked: false,
      cancelled: true,
      votes: 2,
      runs: 1,
      squad: 12,
      hasTeams: true,
    });
  });

  it("reads when and where, for the weather", async () => {
    expect(await matchPlace("x")).toBeNull();
    answerOnce("extract(epoch", [
      { starts: "1700000000", cancelled: false, map_url: "https://maps" },
    ]);
    expect(await matchPlace("x")).toEqual({
      starts: 1_700_000_000,
      cancelled: false,
      mapUrl: "https://maps",
    });
    answerOnce("extract(epoch", [
      { starts: null, cancelled: true, map_url: null },
    ]);
    expect(await matchPlace("x")).toEqual({
      starts: null,
      cancelled: true,
      mapUrl: null,
    });
  });
});

describe("editMatch", () => {
  const current = {
    date: "2026-11-10",
    time: "19:00",
    venue_id: "v1",
    venue: "Arena",
    note: "",
    new_venue: "Park",
  };
  const same = {
    date: "2026-11-10",
    time: "19:00",
    venueId: "v1",
    note: null,
  };

  it("does nothing for a missing game", async () => {
    expect(await editMatch("x", same)).toEqual([]);
    expect(ran("update matchdays")).toHaveLength(0);
  });

  it("does nothing when nothing changed", async () => {
    answer("to_char(", [current]);
    expect(await editMatch("x", same)).toEqual([]);
    expect(ran("update matchdays")).toHaveLength(0);
  });

  it("records every change and resets the automatic teams", async () => {
    answer("to_char(", [{ ...current, venue_id: null, venue: null }]);
    const changes = await editMatch("x", {
      date: "2026-11-11",
      time: "20:00",
      venueId: "v2",
      note: "Bring water",
    });
    expect(changes).toEqual([
      { field: "date", from: "2026-11-10", to: "2026-11-11" },
      { field: "time", from: "19:00", to: "20:00" },
      { field: "venue", from: "", to: "Park" },
      { field: "note", from: "", to: "Bring water" },
    ]);
    const [update] = ran("update matchdays");
    expect(update?.values).toContain(JSON.stringify(changes));
    expect(update?.values).toContain(true);
  });

  it("keeps the automatic teams when only the note changed", async () => {
    answer("to_char(", [{ ...current, new_venue: null, note: "old" }]);
    const changes = await editMatch("x", same);
    expect(changes).toEqual([{ field: "note", from: "old", to: "" }]);
    expect(ran("update matchdays")[0]?.values).toContain(false);
  });

  it("names an unknown new venue as empty", async () => {
    answer("to_char(", [{ ...current, new_venue: null }]);
    const changes = await editMatch("x", { ...same, venueId: "gone" });
    expect(changes).toEqual([{ field: "venue", from: "Arena", to: "" }]);
  });

  it("cancels a game", async () => {
    await cancelMatch("x", "rain");
    expect(ran("set cancelled_at = now()")[0]?.values).toEqual(["rain", "x"]);
  });
});

describe("sign-ups", () => {
  it("records who added whom, and only once", async () => {
    answerOnce("insert into signups", [{ player_id: "asen" }]);
    expect(await signUp("m", "asen", "ivan")).toBe(true);
    expect(await signUp("m", "asen", "asen")).toBe(false);
    const [first, second] = ran("insert into signups");
    expect(first?.values).toEqual(["m", "asen", "ivan"]);
    expect(second?.values).toEqual(["m", "asen", null]);
  });

  it("reads one sign-up", async () => {
    answerOnce("select added_by from signups", [{ added_by: null }]);
    expect(await signupOf("m", "asen")).toEqual({ addedBy: null });
    expect(await signupOf("m", "asen")).toBeNull();
  });

  it("drops the name and its vote on withdrawal", async () => {
    await withdraw("m", "asen");
    expect(ran("delete from signups")[0]?.values).toEqual(["m", "asen"]);
    expect(ran("delete from votes")[0]?.values).toEqual(["m", "asen"]);
  });
});

describe("reconcile", () => {
  const open = {
    kind: "quick",
    starts_at: null,
    locked: false,
    locked_proposal_id: null,
    cancelled: false,
  };

  it("leaves a missing or cancelled game alone", async () => {
    expect(await reconcile("m")).toBe("none");
    answer("locked_proposal_id, cancelled_at", [{ ...open, cancelled: true }]);
    expect(await reconcile("m")).toBe("none");
    expect(ran("from signups s")).toHaveLength(0);
  });

  it("does nothing while the twelve are unchanged", async () => {
    answer("locked_proposal_id, cancelled_at", [open]);
    answer("from signups s", signupsOf(ids12));
    answer(
      SQUAD_IDS,
      ids12.map((id) => ({ player_id: id }))
    );
    expect(await reconcile("m")).toBe("none");
    expect(ran("delete from matchday_players")).toHaveLength(0);
  });

  it("lets the twelve follow the list before there are teams", async () => {
    answer("locked_proposal_id, cancelled_at", [open]);
    answer("from signups s", signupsOf(ids12.slice(0, 11)));
    answer(
      SQUAD_IDS,
      ids12.map((id) => ({ player_id: id }))
    );
    expect(await reconcile("m")).toBe("none");
    expect(ran("insert into matchday_players")[0]?.values).toEqual([
      "m",
      ids12.slice(0, 11),
    ]);
    expect(ran("delete from votes")).toHaveLength(0);
  });

  it("asks for new teams when a reserve comes in before the lock", async () => {
    const list = [...ids12.slice(1), "p13"];
    answer("locked_proposal_id, cancelled_at", [
      { ...open, kind: "announced", starts_at: iso(NOW + DAY) },
    ]);
    answer("from signups s", signupsOf(list));
    answer(
      SQUAD_IDS,
      ids12.map((id) => ({ player_id: id }))
    );
    answer("select exists (select 1 from proposals", [{ has: true }]);
    expect(await reconcile("m")).toBe("balance");
    expect(ran("delete from votes where matchday_id")).toHaveLength(1);
    expect(ran("delete from proposals")).toHaveLength(0);
  });

  it("clears the teams when the twelve fall short", async () => {
    answer("locked_proposal_id, cancelled_at", [open]);
    answer("from signups s", signupsOf(ids12.slice(1)));
    answer(
      SQUAD_IDS,
      ids12.map((id) => ({ player_id: id }))
    );
    answer("select exists (select 1 from proposals", [{ has: true }]);
    expect(await reconcile("m")).toBe("cleared");
    expect(ran("delete from proposals")[0]?.values).toEqual(["m"]);
    expect(ran("set auto_teams_at = null")).toHaveLength(1);
  });

  describe("after the lock", () => {
    const locked = { ...open, locked: true, locked_proposal_id: "prop" };

    it("does nothing without the locked proposal", async () => {
      answer("locked_proposal_id, cancelled_at", [locked]);
      answer("from signups s", signupsOf(ids12));
      expect(await reconcile("m")).toBe("none");
    });

    it("does nothing when the teams still hold", async () => {
      answer("locked_proposal_id, cancelled_at", [locked]);
      answer("from signups s", signupsOf(ids12));
      answer("from proposals where id", [
        { team_a: ids12.slice(0, 6), team_b: ids12.slice(6) },
      ]);
      expect(await reconcile("m")).toBe("none");
    });

    it("puts the reserve in the leaver's place", async () => {
      answer("locked_proposal_id, cancelled_at", [locked]);
      answer("from signups s", signupsOf([...ids12.slice(1), "p13"]));
      answer("from proposals where id", [
        { team_a: ids12.slice(0, 6), team_b: ids12.slice(6) },
      ]);
      expect(await reconcile("m")).toBe("patched");
      const [update] = ran("update proposals set team_a");
      expect(update?.values).toEqual([
        ["p13", ...ids12.slice(1, 6)],
        ids12.slice(6),
        "prop",
      ]);
    });
  });
});

describe("dueNow", () => {
  const info = (extra: Record<string, unknown>) => [
    {
      kind: "announced",
      starts_at: iso(NOW + HOUR),
      created_by: null,
      locked: false,
      cancelled: false,
      votes: 0,
      runs: 0,
      squad: 12,
      has_teams: false,
      ...extra,
    },
  ];

  it("asks nothing of a missing game", async () => {
    expect(await dueNow("m")).toBeNull();
  });

  it.each([
    { kind: "quick" },
    { cancelled: true },
    { locked: true },
    { starts_at: null },
  ])("asks nothing of a game with %o", async (extra) => {
    answerOnce("from matchdays m where id", info(extra));
    expect(await dueNow("m")).toBeNull();
  });

  it("locks a game with teams once it has started", async () => {
    answer(
      "from matchdays m where id",
      info({ has_teams: true, starts_at: iso(NOW - 1) })
    );
    expect(await dueNow("m")).toBe("lock");
  });

  it("makes teams two hours before kick-off, once", async () => {
    answer("from matchdays m where id", info({}));
    answerOnce("set auto_teams_at = now()", [{ id: "m" }]);
    expect(await dueNow("m")).toBe("teams");
    expect(await dueNow("m")).toBeNull();
  });

  it("waits while it is too early or the twelve are not in", async () => {
    answerOnce(
      "from matchdays m where id",
      info({ starts_at: iso(NOW + DAY) })
    );
    expect(await dueNow("m")).toBeNull();
    answerOnce("from matchdays m where id", info({ squad: 11 }));
    expect(await dueNow("m")).toBeNull();
    answerOnce("from matchdays m where id", info({ has_teams: true }));
    expect(await dueNow("m")).toBeNull();
    expect(ran("set auto_teams_at = now()")).toHaveLength(0);
  });
});

describe("balancing", () => {
  it("hands the harness the squad, English names and rules", async () => {
    answer(PLAYERS, roster);
    answer(SQUAD_IDS, [{ player_id: "ivan" }, { player_id: "gosho" }]);
    answer("from team_rules", [
      { id: 1, kind: "apart", players: ["ivan", "gosho"] },
    ]);
    const { squad, namesEn, rules } = await squadForBalance("m");
    expect(squad).toEqual([
      { id: "ivan", rating: 3.5, isGuest: false },
      { id: "gosho", rating: 3.5, isGuest: true },
    ]);
    expect(namesEn.get("gosho")).toBe("Gosho");
    expect(rules).toEqual({ together: [], apart: [["ivan", "gosho"]] });
  });

  it("clears votes and saves a run with its proposals in order", async () => {
    await clearVotes("m");
    expect(ran("delete from votes")[0]?.values).toEqual(["m"]);
    answer("insert into balance_runs", [{ id: 11 }]);
    const verdict = {
      candidate: "c1",
      fairness: 1,
      fairnessConfidence: 0.9,
      fairnessLabel: "dead even" as const,
      preferred: 0.5,
      rank: 1,
      stacked: 0.1,
    };
    await saveRun(
      "m",
      {
        model: "jev",
        source: "jev",
        error: null,
        durationMs: 1200,
        trace: [],
        trigger: "manual",
      },
      [
        { teamA: ["a"], teamB: ["b"], totalA: 3, totalB: 3, verdict },
        { teamA: ["b"], teamB: ["a"], totalA: 3, totalB: 3, verdict: null },
      ]
    );
    expect(ran("insert into balance_runs")[0]?.values).toEqual([
      "m",
      "jev",
      "jev",
      "[]",
      null,
      1200,
      "manual",
    ]);
    const inserts = ran("insert into proposals");
    expect(inserts.map((q) => q.values.slice(0, 3))).toEqual([
      ["11", "m", 1],
      ["11", "m", 2],
    ]);
    expect(inserts[0]?.values.at(-1)).toBe(JSON.stringify(verdict));
    expect(inserts[1]?.values.at(-1)).toBeNull();
  });
});

describe("getMatchday", () => {
  const day = {
    id: "m",
    kind: "announced",
    played_on: "2026-11-10",
    starts_at: iso(NOW + DAY),
    note: "Bring water",
    created_by: "ivan",
    changes: null,
    changed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    locked_at: null,
    locked_proposal_id: null,
    winner: null,
    score_a: null,
    score_b: null,
    venue_id: "v",
    venue_name: "Arena",
    venue_map: null,
  };

  it("is null for a missing game", async () => {
    expect(await getMatchday("m", false)).toBeNull();
  });

  it("puts the page together, without ratings or totals for players", async () => {
    answer(
      "from matchdays m left join venues v on v.id = m.venue_id where m.id",
      [day]
    );
    answer(PLAYERS, roster);
    answer(SQUAD_IDS, [{ player_id: "asen" }]);
    answer("from signups where matchday_id", [
      { player_id: "gosho", added_by: "asen", created_at: iso(NOW - HOUR) },
      { player_id: "asen", added_by: null, created_at: iso(NOW - 2 * HOUR) },
      { player_id: "unknown", added_by: null, created_at: iso(NOW) },
    ]);
    answer("from balance_runs", [
      {
        id: "r",
        model: "jev",
        source: "jev",
        trace: [{ kind: "x" }],
        error: null,
        duration_ms: "900",
      },
    ]);
    answer("from proposals where run_id", [
      {
        id: "p1",
        position: "1",
        team_a: ["asen"],
        team_b: ["gosho"],
        total_a: "10.25",
        total_b: "9",
        verdict: null,
      },
    ]);
    answer("from votes where matchday_id", [
      { player_id: "asen", proposal_id: "p1" },
    ]);

    const view = await getMatchday("m", false);
    expect(view?.venue).toEqual({ id: "v", name: "Arena", mapUrl: null });
    expect(view?.signups.map((s) => s.playerId)).toEqual([
      "asen",
      "gosho",
      "unknown",
    ]);
    expect(view?.players.map((p) => p.id).sort()).toEqual([
      "asen",
      "gosho",
      "ivan",
    ]);
    expect(view?.players.every((p) => p.rating === undefined)).toBe(true);
    expect(view?.run).toEqual({
      model: "jev",
      source: "jev",
      error: null,
      durationMs: 900,
      trace: [],
    });
    expect(view?.proposals).toEqual([
      {
        id: "p1",
        position: 1,
        teamA: ["asen"],
        teamB: ["gosho"],
        gap: 1.3,
        verdict: null,
      },
    ]);
    expect(view?.votes).toEqual([{ playerId: "asen", proposalId: "p1" }]);
    expect(view?.scoreA).toBeNull();
  });

  it("shows the admin totals and the trace, and reads a played game", async () => {
    answer(
      "from matchdays m left join venues v on v.id = m.venue_id where m.id",
      [
        {
          ...day,
          kind: "quick",
          created_by: null,
          venue_id: null,
          winner: "a",
          score_a: "5",
          score_b: "3",
          locked_at: iso(NOW),
          locked_proposal_id: "p1",
        },
      ]
    );
    answer(PLAYERS, roster);
    answer("from balance_runs", [
      {
        id: "r",
        model: "arithmetic",
        source: "fallback",
        trace: null,
        error: "no key",
        duration_ms: 3,
      },
    ]);
    answer("from proposals where run_id", [
      {
        id: "p1",
        position: 1,
        team_a: [],
        team_b: [],
        total_a: 3,
        total_b: 3,
        verdict: null,
      },
    ]);
    const view = await getMatchday("m", true);
    expect(view?.venue).toBeNull();
    expect(view?.players).toEqual([]);
    expect(view?.run?.trace).toEqual([]);
    expect(view?.run?.error).toBe("no key");
    expect(view?.proposals[0]?.totals).toEqual({ a: 3, b: 3 });
    expect([view?.winner, view?.scoreA, view?.scoreB]).toEqual(["a", 5, 3]);
  });

  it("has no run or proposals before teams are made", async () => {
    answer(
      "from matchdays m left join venues v on v.id = m.venue_id where m.id",
      [day]
    );
    answer(PLAYERS, roster);
    const view = await getMatchday("m", true);
    expect(view?.run).toBeNull();
    expect(view?.proposals).toEqual([]);
    expect(ran("from proposals where run_id")).toHaveLength(0);
  });
});

describe("voting and results", () => {
  it("records a vote only when the server accepts it", async () => {
    answerOnce("insert into votes", [{ proposal_id: "p" }]);
    expect(await castVote("m", "asen", "p")).toBe(true);
    expect(await castVote("m", "asen", "p")).toBe(false);
  });

  it("locks on the winning proposal, or refuses", async () => {
    answerOnce("with latest as", [{ locked_proposal_id: "p2" }]);
    expect(await lockMatchday("m")).toBe("p2");
    expect(await lockMatchday("m")).toBeNull();
  });

  it("unlocks and clears the result", async () => {
    await unlockMatchday("m");
    expect(ran("set locked_at = null")[0]?.values).toEqual(["m"]);
  });

  it("saves a result only after the lock", async () => {
    answerOnce("set winner", [{ id: "m" }]);
    expect(await setResult("m", "draw", 2, 2)).toBe(true);
    expect(await setResult("m", "a", null, null)).toBe(false);
    expect(ran("set winner")[1]?.values).toEqual(["a", null, null, "m"]);
  });

  it("lists past games", async () => {
    answer("limit 30", [
      {
        id: 1,
        kind: "quick",
        played_on: "2026-11-01",
        starts_at: null,
        venue_name: null,
        locked: true,
        cancelled: false,
        winner: null,
        score_a: null,
        score_b: "2",
        vote_count: "4",
        signup_count: "12",
      },
    ]);
    expect(await listMatchdays()).toEqual([
      {
        id: "1",
        kind: "quick",
        playedOn: "2026-11-01",
        startsAt: null,
        venueName: null,
        locked: true,
        cancelled: false,
        winner: null,
        scoreA: null,
        scoreB: 2,
        voteCount: 4,
        signupCount: 12,
      },
    ]);
  });
});

describe("balls", () => {
  it("reads the trail, newest first", async () => {
    answer("from ball_holders order by", [
      { player_id: "ivan", since: "2026-11-01", set_by: null },
    ]);
    expect(await ballTrail(5)).toEqual([
      { playerId: "ivan", since: "2026-11-01", setBy: null },
    ]);
    expect(ran("from ball_holders order by")[0]?.values).toEqual([5]);
  });

  it("passes the balls unless that player already has them", async () => {
    answerOnce("insert into ball_holders", [{ id: 1 }]);
    expect(await passBalls("ivan", "asen")).toBe(true);
    expect(await passBalls("ivan", "asen")).toBe(false);
  });
});
