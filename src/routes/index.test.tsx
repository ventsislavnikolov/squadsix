// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchday, roster, summary } from "../../test/fixtures";
import { answerSession, offline, renderApp } from "../../test/render-app";
import {
  getBalls,
  getMatchday,
  getMatchdays,
  getOpenMatch,
  getPickList,
} from "../../test/server-functions";

const ANNOUNCE = /announce/iu;
const QUICK = /quick/iu;
const LAST_GAME_DATE = /^Last game: Friday,? 30 October$/u;
const LAST_GAME_WHEN = /^Last game: Thursday,? 29 October · 19:00$/u;

vi.mock("@/server/functions", () => import("../../test/server-functions"));

describe("start page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    offline();
    answerSession();
    getPickList.mockResolvedValue(roster(5));
    getBalls.mockResolvedValue([]);
    getMatchday.mockResolvedValue(matchday());
  });

  it("offers to announce a game or pick one on the spot", async () => {
    getMatchdays.mockResolvedValue([]);
    renderApp("/");
    expect(await screen.findByRole("link", { name: ANNOUNCE })).toHaveProperty(
      "pathname",
      "/new"
    );
    expect(screen.getByRole("link", { name: QUICK })).toHaveProperty(
      "pathname",
      "/quick"
    );
  });

  it("names the last game that was not cancelled", async () => {
    getMatchdays.mockResolvedValue([
      summary({ id: "c", cancelled: true }),
      summary({ id: "d", playedOn: "2026-10-30" }),
    ]);
    renderApp("/");
    expect(await screen.findByText(LAST_GAME_DATE)).toBeDefined();
  });

  it("gives the kick-off time when the last game had one", async () => {
    getMatchdays.mockResolvedValue([
      summary({ startsAt: "2026-10-29T17:00:00.000Z" }),
    ]);
    renderApp("/");
    expect(await screen.findByText(LAST_GAME_WHEN)).toBeDefined();
  });

  it("goes to the open game once it knows of one", async () => {
    getMatchdays.mockResolvedValue([]);
    getOpenMatch.mockResolvedValue({ id: "m1" });
    const { router } = renderApp("/");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/match/m1")
    );
  });

  it("finds the open game after painting and goes there", async () => {
    getMatchdays.mockResolvedValue([]);
    // The answer lands after the page has started to render.
    getOpenMatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ id: "m1" }), 50);
        })
    );
    const { router } = renderApp("/");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/match/m1")
    );
  });

  it("redirects at once when the open game is already known", async () => {
    getMatchdays.mockResolvedValue([]);
    getOpenMatch.mockResolvedValue({ id: "m1" });
    const { router } = renderApp("/history");
    await screen.findByRole("heading", { name: "Past games" });
    await waitFor(() => expect(screen.getByText("Game")).toBeDefined());
    await router.navigate({ to: "/" });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/match/m1")
    );
  });
});
