// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { summary } from "../../test/fixtures";
import { answerSession, renderApp } from "../../test/render-app";
import { getMatchdays } from "../../test/server-functions";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const PAST_GAMES = /past games/iu;
const GAME_LINK = /2026|October/u;
const VOTING = /voting · 3 votes/u;

describe("history page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answerSession();
  });

  it("says when there are no games yet", async () => {
    getMatchdays.mockResolvedValue([]);
    renderApp("/history");
    expect(await screen.findByText("No games yet. Start from “New game”."));
  });

  it("lists each game with how it ended", async () => {
    getMatchdays.mockResolvedValue([
      summary({ id: "c", cancelled: true }),
      summary({ id: "s", signupCount: 14 }),
      summary({ id: "v", voteCount: 3 }),
      summary({ id: "l", locked: true }),
      summary({
        id: "d",
        locked: true,
        winner: "draw",
        scoreA: 2,
        scoreB: 2,
        startsAt: "2026-10-30T17:00:00.000Z",
        venueName: "Office pitch",
      }),
      summary({ id: "a", locked: true, winner: "a", scoreA: 5, scoreB: 3 }),
      summary({ id: "b", locked: true, winner: "b" }),
    ]);
    renderApp("/history");
    expect(
      await screen.findByRole("heading", { name: PAST_GAMES })
    ).toBeDefined();
    const links = screen.getAllByRole("link", { name: GAME_LINK });
    expect(links).toHaveLength(7);
    expect(links[0]?.getAttribute("href")).toBe("/match/c");
    expect(screen.getByText("cancelled")).toBeDefined();
    expect(screen.getByText("signing up · 12/12")).toBeDefined();
    expect(screen.getByText(VOTING)).toBeDefined();
    expect(screen.getByText("locked, no result")).toBeDefined();
    expect(screen.getByText("Draw · 2:2")).toBeDefined();
    expect(screen.getByText("Office pitch")).toBeDefined();
    expect(screen.getByText("Team A won · 5:3")).toBeDefined();
    expect(screen.getByText("Team B won")).toBeDefined();
  });
});
