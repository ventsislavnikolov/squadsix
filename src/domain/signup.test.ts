import { describe, expect, it } from "vitest";
import {
  guestsOpen,
  hasStarted,
  orderSignups,
  patchLockedTeams,
  splitSquad,
  teamsDue,
} from "./signup";

const kickoff = "2026-09-29T17:00:00.000Z"; // Tuesday 20:00 in Sofia
const hoursBefore = (h: number) =>
  new Date(Date.parse(kickoff) - h * 3_600_000).toISOString();

describe("orderSignups", () => {
  it("puts regulars ahead of guests until 24 hours before kick-off", () => {
    const list = orderSignups(
      [
        { playerId: "guest", isGuest: true, createdAt: hoursBefore(72) },
        {
          playerId: "late-regular",
          isGuest: false,
          createdAt: hoursBefore(48),
        },
        { playerId: "regular", isGuest: false, createdAt: hoursBefore(70) },
      ],
      kickoff
    );
    expect(list.map((s) => s.playerId)).toEqual([
      "regular",
      "late-regular",
      "guest",
    ]);
  });

  it("stops pushing guests back inside the last 24 hours", () => {
    const list = orderSignups(
      [
        {
          playerId: "very-late-regular",
          isGuest: false,
          createdAt: hoursBefore(3),
        },
        { playerId: "guest", isGuest: true, createdAt: hoursBefore(30) },
        { playerId: "late-guest", isGuest: true, createdAt: hoursBefore(5) },
      ],
      kickoff
    );
    expect(list.map((s) => s.playerId)).toEqual([
      "guest",
      "late-guest",
      "very-late-regular",
    ]);
  });

  it("is first come, first served without a kick-off time", () => {
    const list = orderSignups(
      [
        { playerId: "b", isGuest: false, createdAt: hoursBefore(1) },
        { playerId: "a", isGuest: true, createdAt: hoursBefore(2) },
      ],
      null
    );
    expect(list.map((s) => s.playerId)).toEqual(["a", "b"]);
  });
});

describe("splitSquad", () => {
  it("keeps twelve and queues the rest", () => {
    const { squad, reserves } = splitSquad(
      Array.from({ length: 14 }, (_, i) => i)
    );
    expect(squad).toHaveLength(12);
    expect(reserves).toEqual([12, 13]);
  });
});

describe("patchLockedTeams", () => {
  const teams = { teamA: ["a1", "a2", "a3"], teamB: ["b1", "b2", "b3"] };

  it("puts the reserve exactly where the leaver was", () => {
    const r = patchLockedTeams(teams, ["a1", "a2", "a3", "b1", "r1", "b3"]);
    expect(r.teamB).toEqual(["b1", "r1", "b3"]);
    expect(r.teamA).toEqual(teams.teamA);
    expect(r.changed).toBe(true);
  });

  it("leaves a hole when nobody can come in, and fills the short team later", () => {
    const short = patchLockedTeams(teams, ["a1", "a2", "a3", "b1", "b3"]);
    expect(short.teamB).toEqual(["b1", "b3"]);
    const filled = patchLockedTeams(short, [
      "a1",
      "a2",
      "a3",
      "b1",
      "b3",
      "g1",
    ]);
    expect(filled.teamB).toEqual(["b1", "b3", "g1"]);
  });

  it("reports no change when the squad is the same", () => {
    expect(
      patchLockedTeams(teams, [...teams.teamA, ...teams.teamB]).changed
    ).toBe(false);
  });
});

describe("timing", () => {
  it("makes teams two hours before and closes at kick-off", () => {
    expect(teamsDue(kickoff, Date.parse(hoursBefore(3)))).toBe(false);
    expect(teamsDue(kickoff, Date.parse(hoursBefore(2)))).toBe(true);
    expect(hasStarted(kickoff, Date.parse(hoursBefore(0.1)))).toBe(false);
    expect(hasStarted(kickoff, Date.parse(kickoff))).toBe(true);
    expect(hasStarted(null)).toBe(false);
  });

  it("lets guests sign up only in the last 24 hours before kick-off", () => {
    expect(guestsOpen(kickoff, Date.parse(hoursBefore(25)))).toBe(false);
    expect(guestsOpen(kickoff, Date.parse(hoursBefore(24)))).toBe(true);
    expect(guestsOpen(kickoff, Date.parse(hoursBefore(1)))).toBe(true);
    // A quick game has no kick-off time, so no waiting.
    expect(guestsOpen(null)).toBe(true);
  });
});
