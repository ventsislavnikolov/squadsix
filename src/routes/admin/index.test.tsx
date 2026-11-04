// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ratedPlayer } from "../../../test/fixtures";
import {
  ADMIN_SESSION,
  answerSession,
  renderApp,
} from "../../../test/render-app";
import {
  getFullRoster,
  getMatchdays,
  getSession,
  logout,
  savePlayer,
} from "../../../test/server-functions";

vi.mock("@/server/functions", () => import("../../../test/server-functions"));

const TITLE = /players and ratings/iu;
const ADD_PLAYER = /add player/iu;
const SIGN_OUT = /sign out/iu;
const SAVE = /^save$/iu;
const CANCEL = /^cancel$/iu;
const ADMIN_SIGN_IN = /admin sign-in/iu;
const NO_GAME = /no game planned/iu;
const LAST_GAME = /Last game: Fri,? 30 October 2026/u;
const NEVER = /never/u;

const ROSTER = [
  ratedPlayer(1, 4.5, { lastPlayed: "2026-10-30" }),
  ratedPlayer(2, null),
  ratedPlayer(3, null, { hidden: true }),
  ratedPlayer(4, 3, { isGuest: true }),
  // A row without full names (never sent to the admin) is left out.
  { ...ratedPlayer(5, 2), full: undefined },
];

/** Every row has a Save button; only the edited row's can be pressed. */
function enabledSave(): HTMLElement {
  const button = screen
    .getAllByRole("button", { name: SAVE })
    .find((b) => !(b as HTMLButtonElement).disabled);
  if (!button) {
    throw new Error("no enabled Save button");
  }
  return button;
}

describe("admin players page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answerSession({ isAdmin: true });
    getFullRoster.mockResolvedValue(ROSTER);
  });

  it("sends anyone else to the sign-in page", async () => {
    answerSession();
    const { router } = renderApp("/admin");
    expect(
      await screen.findByRole("heading", { name: ADMIN_SIGN_IN })
    ).toBeDefined();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("lists regulars and guests with the unrated count", async () => {
    renderApp("/admin");
    expect(await screen.findByRole("heading", { name: TITLE })).toBeDefined();
    expect(
      screen.getByText("1 person is unrated and counted as 2.5.")
    ).toBeDefined();
    expect(screen.getByRole("heading", { name: "Guests" })).toBeDefined();
    expect(screen.getAllByLabelText("First (BG)")).toHaveLength(4);
    expect(screen.getByText(LAST_GAME)).toBeDefined();
    expect(screen.getAllByText(NEVER).length).toBeGreaterThan(0);
  });

  it("adds a player, filling the other script on blur", async () => {
    savePlayer.mockResolvedValue({ id: "p9" });
    const { user } = renderApp("/admin");
    await user.click(await screen.findByRole("button", { name: ADD_PLAYER }));
    const section = screen
      .getByRole("heading", { name: "New player" })
      .closest("section");
    if (!section) {
      throw new Error("no section");
    }
    const form = within(section);
    await user.type(form.getByLabelText("First (BG)"), "Иван");
    await user.type(form.getByLabelText("Last (BG)"), "Петров");
    await user.tab();
    expect(form.getByLabelText("First (EN)")).toHaveProperty("value", "Ivan");
    expect(form.getByLabelText("Last (EN)")).toHaveProperty("value", "Petrov");
    await user.click(form.getByRole("button", { name: SAVE }));
    await waitFor(() =>
      expect(savePlayer).toHaveBeenCalledWith({
        data: {
          firstBg: "Иван",
          lastBg: "Петров",
          firstEn: "Ivan",
          lastEn: "Petrov",
          rating: null,
          isGuest: false,
          hidden: false,
          id: undefined,
        },
      })
    );
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "New player" })).toBeNull()
    );
  });

  it("fills the Bulgarian names from the English ones, and can cancel", async () => {
    const { user } = renderApp("/admin");
    await user.click(await screen.findByRole("button", { name: ADD_PLAYER }));
    const section = screen
      .getByRole("heading", { name: "New player" })
      .closest("section");
    if (!section) {
      throw new Error("no section");
    }
    const form = within(section);
    await user.type(form.getByLabelText("First (EN)"), "Maria");
    await user.type(form.getByLabelText("Last (EN)"), "Ivanova");
    await user.tab();
    expect(form.getByLabelText("First (BG)")).toHaveProperty("value", "Мариа");
    expect(form.getByLabelText("Last (BG)")).toHaveProperty("value", "Иванова");
    await user.click(form.getByRole("button", { name: CANCEL }));
    expect(screen.queryByRole("heading", { name: "New player" })).toBeNull();
  });

  it("saves a rating, guest and hidden change on one row", async () => {
    savePlayer.mockResolvedValue({ id: "p2" });
    const { user } = renderApp("/admin");
    const [, row2] = await screen.findAllByLabelText("Rating");
    if (!row2) {
      throw new Error("no row");
    }
    await user.click(row2);
    await user.click(await screen.findByRole("option", { name: "3.5" }));
    const switches = screen.getAllByRole("switch");
    // Row 2's guest and hidden switches.
    const [, , guest2, hidden2] = switches;
    if (!(guest2 && hidden2)) {
      throw new Error("no switches");
    }
    await user.click(guest2);
    await user.click(hidden2);
    await user.click(enabledSave());
    await waitFor(() =>
      expect(savePlayer).toHaveBeenCalledWith({
        data: {
          firstBg: "Играч",
          lastBg: "2",
          firstEn: "Player",
          lastEn: "2",
          rating: 3.5,
          isGuest: true,
          hidden: true,
          id: "p2",
        },
      })
    );
  });

  it("can clear a rating and shows a refused save", async () => {
    savePlayer.mockRejectedValue(new Error("admin-only"));
    const { user } = renderApp("/admin");
    const [row1] = await screen.findAllByLabelText("Rating");
    if (!row1) {
      throw new Error("no row");
    }
    await user.click(row1);
    await user.click(await screen.findByRole("option", { name: "?" }));
    await user.click(enabledSave());
    expect(await screen.findByText("Admin only.")).toBeDefined();
    expect(savePlayer).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: "p1", rating: null }),
    });
  });

  it("signs out and goes back to the start page", async () => {
    getMatchdays.mockResolvedValue([]);
    logout.mockImplementation(() => {
      getSession.mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
      return Promise.resolve();
    });
    const { user, router } = renderApp("/admin");
    await user.click(await screen.findByRole("button", { name: SIGN_OUT }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(logout).toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: NO_GAME })).toBeDefined();
  });
});
