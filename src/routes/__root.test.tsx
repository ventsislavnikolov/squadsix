// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchday, roster } from "../../test/fixtures";
import { answerSession, offline, renderApp } from "../../test/render-app";
import {
  getBalls,
  getMatchday,
  getMatchdays,
  getOpenMatch,
  getPickList,
} from "../../test/server-functions";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const NAV_LINKS = ["Players", "Venues", "Rules", "Log"];

function nav() {
  return within(screen.getByRole("navigation"));
}

describe("root layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    offline();
    getMatchdays.mockResolvedValue([]);
    getPickList.mockResolvedValue(roster(5));
    getBalls.mockResolvedValue([]);
  });

  it("gives players the game, history and balls", async () => {
    answerSession();
    renderApp("/history");
    await screen.findByRole("heading", { name: "Past games" });
    expect(nav().getByRole("link", { name: "Squad Six" })).toBeDefined();
    expect(
      (await nav().findByRole("link", { name: "New game" })).getAttribute(
        "href"
      )
    ).toBe("/");
    expect(nav().getByRole("link", { name: "History" }).className).toContain(
      "text-fg"
    );
    expect(nav().getByRole("link", { name: "Balls" })).toBeDefined();
    for (const name of NAV_LINKS) {
      expect(nav().queryByRole("link", { name })).toBeNull();
    }
    expect(document.title).toBe("Squad Six");
    expect(
      document.querySelector('meta[name="viewport"]')?.getAttribute("content")
    ).toBe("width=device-width, initial-scale=1");
  });

  it("gives the admin their pages too, and links the open game", async () => {
    answerSession({ isAdmin: true });
    getOpenMatch.mockResolvedValue({ id: "m1" });
    getMatchday.mockResolvedValue(matchday());
    renderApp("/balls");
    await screen.findByRole("navigation");
    expect(
      (await nav().findByRole("link", { name: "Game" })).getAttribute("href")
    ).toBe("/match/m1");
    for (const name of NAV_LINKS) {
      expect(nav().getByRole("link", { name })).toBeDefined();
    }
  });

  it("says when a page does not exist, in the reader's language", async () => {
    answerSession({ lang: "bg" });
    renderApp("/nowhere");
    expect(await screen.findByText("Няма такава страница.")).toBeDefined();
    await waitFor(() =>
      expect(
        document.querySelector("[data-document=html]")?.getAttribute("lang")
      ).toBe("bg")
    );
  });

  it("says it in English too", async () => {
    answerSession();
    renderApp("/nowhere");
    expect(await screen.findByText("No such page.")).toBeDefined();
  });
});
