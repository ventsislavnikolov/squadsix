// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sofiaToday } from "@/components/event-form";
import { matchday, roster, VENUE } from "../../test/fixtures";
import { answerSession, offline, renderApp } from "../../test/render-app";
import {
  announce,
  getBalls,
  getMatchday,
  getOpenMatch,
  getPickList,
  getVenues,
} from "../../test/server-functions";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const ANNOUNCE = /^announce$/iu;
const WHEN_AND_WHERE = /when and where/iu;

describe("new game page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    offline();
    getVenues.mockResolvedValue([VENUE]);
    getPickList.mockResolvedValue(roster(3));
    getBalls.mockResolvedValue([]);
  });

  it("goes to the open game instead", async () => {
    answerSession();
    getOpenMatch.mockResolvedValue({ id: "m1" });
    getMatchday.mockResolvedValue(matchday());
    const { router } = renderApp("/new");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/match/m1")
    );
  });

  it("asks who you are before showing the form", async () => {
    answerSession();
    renderApp("/new");
    expect(
      await screen.findByRole("heading", { name: WHEN_AND_WHERE })
    ).toBeDefined();
    expect(await screen.findByText("Who are you?")).toBeDefined();
    expect(screen.queryByRole("button", { name: ANNOUNCE })).toBeNull();
  });

  it("announces a game at a known venue and opens it", async () => {
    answerSession({ me: "p1" });
    announce.mockResolvedValue({ id: "m1" });
    getMatchday.mockResolvedValue(matchday());
    const { user, router } = renderApp("/new");
    await user.type(
      await screen.findByLabelText("Note (optional)"),
      "  White shirts  "
    );
    await user.click(screen.getByRole("button", { name: ANNOUNCE }));
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith({
        data: {
          date: sofiaToday(),
          time: "20:00",
          venue: { id: "v1" },
          note: "White shirts",
          actorId: "p1",
        },
      })
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/match/m1")
    );
  });

  it("announces at a new venue and shows a refusal", async () => {
    answerSession({ me: "p1" });
    announce.mockRejectedValue(new Error("bad-date"));
    const { user } = renderApp("/new");
    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "New place…" }));
    await user.type(screen.getByLabelText("Place name"), " Park ");
    await user.type(
      screen.getByLabelText("Google Maps link (optional)"),
      "https://maps.example.com/p"
    );
    await user.click(screen.getByRole("button", { name: ANNOUNCE }));
    expect(
      await screen.findByText(
        "Pick a day from today to 14 days ahead, at a time that hasn't passed."
      )
    ).toBeDefined();
    expect(announce).toHaveBeenCalledWith({
      data: expect.objectContaining({
        venue: { name: "Park", mapUrl: "https://maps.example.com/p" },
        note: null,
      }),
    });
  });
});
