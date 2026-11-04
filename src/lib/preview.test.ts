import { describe, expect, it } from "vitest";
import type { MatchdayView, ProposalView, SignupView } from "@/server/repo";
import { matchPreview, previewVersion, SITE, shareUrl } from "./preview";

const signups = (n: number): SignupView[] =>
  Array.from({ length: n }, (_, i) => ({
    addedBy: null,
    createdAt: "2026-10-12T09:00:00.000Z",
    playerId: `p${i}`,
  }));

const proposal: ProposalView = {
  gap: 0.5,
  id: "pr1",
  position: 1,
  teamA: [],
  teamB: [],
  verdict: null,
};

const day = (over: Partial<MatchdayView> = {}): MatchdayView => ({
  cancelledAt: null,
  cancelReason: null,
  changedAt: null,
  changes: null,
  createdBy: null,
  id: "m1",
  kind: "announced",
  lockedAt: null,
  lockedProposalId: null,
  note: null,
  playedOn: "2026-10-13",
  players: [],
  proposals: [],
  run: null,
  scoreA: null,
  scoreB: null,
  signups: [],
  squad: [],
  // Tuesday 13 October 2026, 20:00 in Sofia.
  startsAt: "2026-10-13T17:00:00.000Z",
  venue: { id: "v1", name: "Arena", mapUrl: null },
  votes: [],
  winner: null,
  ...over,
});

describe("matchPreview", () => {
  it("invites sign-ups in Bulgarian by default, with kick-off on Sofia's clock", () => {
    expect(matchPreview(day({ signups: signups(7) }))).toEqual({
      badge: "Нов мач",
      count: "7/12 записани",
      description: "Записани 7/12, трябват още 5. Запиши се! · Arena",
      title: "⚽ Нов мач · Вторник, 13 октомври · 20:00",
      tone: "open",
      venue: "Arena",
      when: "Вторник, 13 октомври · 20:00",
    });
  });

  it("names the day alone for a game made on the spot, and no venue", () => {
    const p = matchPreview(
      day({ kind: "quick", startsAt: null, venue: null }),
      "en"
    );
    expect(p.when).toBe("Tuesday 13 October");
    expect(p.venue).toBeNull();
    expect(p.description).toBe("0/12 signed up, 12 more needed. Sign up!");
  });

  it("says a full list still takes reserves, and counts them", () => {
    const full = matchPreview(day({ signups: signups(12) }), "en");
    expect(full).toMatchObject({
      badge: "Full",
      count: "12/12 signed up",
      description: "Full: 12/12. You can sign up as a reserve. · Arena",
      tone: "full",
    });
    expect(matchPreview(day({ signups: signups(13) }), "en").count).toBe(
      "12/12 signed up · 1 reserve"
    );
    expect(matchPreview(day({ signups: signups(15) }), "en").count).toBe(
      "12/12 signed up · 3 reserves"
    );
    const bg = matchPreview(day({ signups: signups(14) }));
    expect(bg.count).toBe("12/12 записани · 2 резерви");
    expect(bg.description).toBe(
      "Пълен: 12/12, 2 резерви. Можеш да се запишеш като резерва. · Arena"
    );
  });

  it("asks the twelve to vote once there are options", () => {
    expect(
      matchPreview(day({ proposals: [proposal], venue: null }), "en")
    ).toMatchObject({
      badge: "Vote for teams",
      count: "3 options · the twelve vote",
      description: "Three options for teams. Vote for the fairest.",
      tone: "full",
    });
  });

  it("shows the teams once locked, then the result", () => {
    const locked = day({ lockedAt: "2026-10-13T16:00:00.000Z" });
    expect(matchPreview(locked, "en")).toMatchObject({
      badge: "Teams are set",
      count: "See who's on which team",
      title: "Teams · Tuesday 13 October · 20:00",
      tone: "locked",
    });
    expect(
      matchPreview({ ...locked, winner: "a", scoreA: 5, scoreB: 3 }, "en")
    ).toMatchObject({
      badge: "Result",
      count: "Team A won · 5:3",
      description: "Team A won · 5:3 · Arena",
    });
    expect(matchPreview({ ...locked, winner: "b" }).count).toBe(
      "Спечели Отбор Б"
    );
    expect(matchPreview({ ...locked, winner: "a" }).count).toBe(
      "Спечели Отбор А"
    );
    expect(matchPreview({ ...locked, winner: "draw" }).count).toBe("Равен");
    expect(
      matchPreview({ ...locked, winner: "draw", scoreA: 2 }, "en").count
    ).toBe("Draw");
  });

  it("says a game is off, with the reason when there is one", () => {
    const off = day({ cancelledAt: "2026-10-12T10:00:00.000Z" });
    expect(matchPreview(off, "en")).toMatchObject({
      badge: "Cancelled",
      count: "The game is off.",
      description: "The game is off.",
      title: "Game cancelled · Tuesday 13 October · 20:00",
      tone: "cancelled",
    });
    expect(matchPreview({ ...off, cancelReason: "rain" }, "en")).toMatchObject({
      count: "rain",
      description: "Cancelled: rain",
    });
    expect(matchPreview({ ...off, cancelReason: "вали" })).toMatchObject({
      badge: "Отменен",
      description: "Отменен: вали",
    });
  });
});

describe("shareUrl", () => {
  it("changes whenever the picture would", () => {
    expect(shareUrl(day({ signups: signups(3) }))).toBe(`${SITE}/match/m1?v=3`);
    expect(previewVersion(day({ proposals: [proposal] }))).toBe("0t");
    expect(previewVersion(day({ lockedAt: "x" }))).toBe("0l");
    expect(previewVersion(day({ lockedAt: "x", winner: "draw" }))).toBe(
      "0rdraw"
    );
    expect(previewVersion(day({ cancelledAt: "x", winner: "a" }))).toBe("0x");
  });
});
