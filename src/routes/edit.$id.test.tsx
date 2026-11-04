// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchday, roster, VENUE } from "../../test/fixtures";
import { answerSession, offline, renderApp } from "../../test/render-app";
import {
  editMatch,
  getBalls,
  getMatchday,
  getPickList,
  getVenues,
} from "../../test/server-functions";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const SAVE_CHANGES = /save changes/iu;
const NO_SUCH_PAGE = /no such page/iu;

describe("edit game page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    offline();
    getVenues.mockResolvedValue([VENUE]);
    getPickList.mockResolvedValue(roster(5));
    getBalls.mockResolvedValue([]);
  });

  it("starts from the game as it is and saves the changes", async () => {
    answerSession({ isAdmin: true, me: "p2" });
    const day = matchday({
      playedOn: "2026-11-06",
      startsAt: "2026-11-06T17:30:00.000Z",
      note: "Bring water",
    });
    getMatchday.mockResolvedValue(day);
    editMatch.mockResolvedValue(undefined);
    const { user, router } = renderApp("/edit/m1");
    const note = await screen.findByLabelText("Note (optional)");
    expect(note).toHaveProperty("value", "Bring water");
    expect(screen.getByLabelText("Day")).toHaveProperty("value", "2026-11-06");
    expect(screen.getByLabelText("Time")).toHaveProperty("value", "19:30");
    await user.clear(note);
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }));
    await waitFor(() =>
      expect(editMatch).toHaveBeenCalledWith({
        data: {
          id: "m1",
          actorId: "p2",
          date: "2026-11-06",
          time: "19:30",
          venue: { id: "v1" },
          note: null,
        },
      })
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/match/m1")
    );
  });

  it("defaults the time for a game without one and shows a refusal", async () => {
    answerSession({ isAdmin: true });
    getMatchday.mockResolvedValue(
      matchday({ kind: "quick", startsAt: null, venue: null, note: null })
    );
    editMatch.mockRejectedValue(new Error("not-allowed"));
    const { user } = renderApp("/edit/m1");
    expect(await screen.findByLabelText("Time")).toHaveProperty(
      "value",
      "20:00"
    );
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }));
    expect(
      await screen.findByText(
        "Only whoever announced it, or the admin, can do that."
      )
    ).toBeDefined();
    expect(editMatch).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: null, venue: { id: "v1" } }),
    });
  });

  it("shows not found for a game that doesn't exist", async () => {
    answerSession({ isAdmin: true });
    getMatchday.mockResolvedValue(null);
    renderApp("/edit/missing");
    expect(await screen.findByText(NO_SUCH_PAGE)).toBeDefined();
  });
});
