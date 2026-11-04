// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchday, player, roster, VENUE } from "../../test/fixtures";
import { answerSession, offline, renderApp } from "../../test/render-app";
import {
  addGuest,
  getBalls,
  getMatchday,
  getOpenMatch,
  getPickList,
  getVenues,
  quickCreate,
} from "../../test/server-functions";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const MAKE_TEAMS = /^make teams$/iu;
const MORE = /more$/iu;
const ADD_GUEST = /add guest/iu;
const CLEAR = /^clear$/iu;
const WHO_IS_PLAYING = /who's playing today/iu;
const NOT_ALLOWED = /only whoever announced it/iu;

const REGULARS = roster(13);
const GUEST = player(20, {
  isGuest: true,
  name: { bg: "Гост", en: "Guest Martin" },
});

/** Click each box in turn, as a person would. */
function tick(user: UserEvent, boxes: HTMLElement[]): Promise<void> {
  return boxes.reduce<Promise<void>>(
    (done, box) => done.then(() => user.click(box)),
    Promise.resolve()
  );
}

function regulars() {
  const heading = screen.getByRole("heading", { name: "From the office" });
  const node = heading.closest("section");
  if (!node) {
    throw new Error("no regulars section");
  }
  return within(node);
}

describe("quick pick page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    offline();
    getVenues.mockResolvedValue([VENUE]);
    getPickList.mockResolvedValue([...REGULARS, GUEST]);
    getBalls.mockResolvedValue([]);
  });

  it("goes to the open game instead", async () => {
    answerSession();
    getOpenMatch.mockResolvedValue({ id: "m1" });
    getMatchday.mockResolvedValue(matchday());
    const { router } = renderApp("/quick");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/match/m1")
    );
  });

  it("picks twelve, blocks a thirteenth, and makes the teams", async () => {
    answerSession({ me: "p1" });
    quickCreate.mockResolvedValue({ id: "m1" });
    getMatchday.mockResolvedValue(matchday({ kind: "quick" }, 12));
    const { user, router } = renderApp("/quick");
    expect(
      await screen.findByRole("heading", { name: WHO_IS_PLAYING })
    ).toBeDefined();
    const make = screen.getByRole("button", { name: MORE });
    expect(make.textContent).toBe("12 more");
    expect(make).toHaveProperty("disabled", true);
    const boxes = regulars().getAllByRole("checkbox");
    await tick(user, boxes.slice(0, 12));
    expect(boxes[0]?.getAttribute("aria-checked")).toBe("true");
    expect(boxes[12]).toHaveProperty("disabled", true);
    // Untick one and tick it again.
    const [firstBox] = boxes;
    if (!firstBox) {
      throw new Error("no rows");
    }
    await user.click(firstBox);
    expect(screen.getByRole("button", { name: MORE }).textContent).toBe(
      "1 more"
    );
    await user.click(firstBox);
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "No place" }));
    const time = screen.getByLabelText("Time (optional)");
    await user.clear(time);
    await user.click(screen.getByRole("button", { name: MAKE_TEAMS }));
    await waitFor(() =>
      expect(quickCreate).toHaveBeenCalledWith({
        data: {
          // Player 1 was unticked and ticked again, so comes last.
          playerIds: [...REGULARS.slice(1, 12).map((p) => p.id), "p1"],
          time: null,
          venue: null,
          actorId: "p1",
        },
      })
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/match/m1")
    );
  });

  it("filters by name, clears, and shows a refusal", async () => {
    answerSession();
    quickCreate.mockRejectedValue(new Error("not-in-squad"));
    const { user } = renderApp("/quick");
    const search = await screen.findByPlaceholderText("Search by name");
    await user.type(search, "zzz");
    expect(screen.getAllByText("Nobody matches that search.")).toHaveLength(2);
    await user.clear(search);
    await user.type(search, "играч 1");
    // Player 1 and Player 10–13.
    expect(regulars().getAllByRole("checkbox")).toHaveLength(5);
    await user.clear(search);
    await user.type(search, "martin");
    expect(screen.getByText("Guest Martin")).toBeDefined();
    await user.clear(search);
    await user.click(regulars().getAllByRole("checkbox")[0] as HTMLElement);
    await user.click(screen.getByRole("button", { name: CLEAR }));
    expect(screen.queryByRole("button", { name: CLEAR })).toBeNull();
    await tick(user, regulars().getAllByRole("checkbox").slice(0, 12));
    await user.click(screen.getByRole("button", { name: MAKE_TEAMS }));
    expect(await screen.findByText("Needs 12 different people.")).toBeDefined();
    expect(quickCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ venue: { id: "v1" }, actorId: null }),
    });
  });

  it("has no place by default without venues, and spins while making teams", async () => {
    answerSession();
    getVenues.mockResolvedValue([]);
    quickCreate.mockImplementation(() => new Promise(() => undefined));
    const { user } = renderApp("/quick");
    await screen.findByRole("heading", { name: WHO_IS_PLAYING });
    expect(screen.getByRole("combobox").textContent).toContain("No place");
    await tick(user, regulars().getAllByRole("checkbox").slice(0, 12));
    await user.click(screen.getByRole("button", { name: MAKE_TEAMS }));
    expect(await screen.findByText("Making teams…")).toBeDefined();
    expect(quickCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ venue: null }),
    });
  });

  it("shows the admin ratings and the total", async () => {
    answerSession({ isAdmin: true });
    getPickList.mockResolvedValue([
      player(1, { rating: 4 }),
      player(2, { rating: null }),
    ]);
    const { user } = renderApp("/quick");
    expect(await screen.findByText("No guests yet.")).toBeDefined();
    const [one, two] = regulars().getAllByRole("checkbox");
    if (!(one && two)) {
      throw new Error("two rows expected");
    }
    await user.click(one);
    await user.click(two);
    // An unrated player counts as 2.5.
    expect(screen.getByText("total 6.5 · 3.3 per team")).toBeDefined();
  });

  it("adds a guest and ticks them", async () => {
    answerSession();
    addGuest.mockResolvedValue({ id: "p20" });
    const { user } = renderApp("/quick");
    const name = await screen.findByPlaceholderText(
      "Guest's name, e.g. “Martin Ivanov”"
    );
    await user.type(name, "M");
    await user.click(screen.getByRole("button", { name: ADD_GUEST }));
    expect(await screen.findByText("At least 2 letters")).toBeDefined();
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(addGuest).not.toHaveBeenCalled();
    await user.type(name, "artin ");
    await user.click(screen.getByRole("button", { name: ADD_GUEST }));
    await waitFor(() =>
      expect(addGuest).toHaveBeenCalledWith({ data: { name: "Martin" } })
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("checkbox", { name: "Guest Martin" })
          .getAttribute("aria-checked")
      ).toBe("true")
    );
    expect(name).toHaveProperty("value", "");
  });

  it("words a refused guest and keeps the typed name", async () => {
    answerSession();
    addGuest.mockRejectedValue(new Error("not-allowed"));
    const { user } = renderApp("/quick");
    const name = await screen.findByPlaceholderText(
      "Guest's name, e.g. “Martin Ivanov”"
    );
    await user.type(name, "Martin");
    await user.click(screen.getByRole("button", { name: ADD_GUEST }));
    expect(await screen.findByText(NOT_ALLOWED)).toBeDefined();
    expect(name).toHaveProperty("value", "Martin");
  });

  it("does not tick a new guest once twelve are in", async () => {
    answerSession();
    addGuest.mockResolvedValue({ id: "p20" });
    const { user } = renderApp("/quick");
    await screen.findByRole("heading", { name: WHO_IS_PLAYING });
    await tick(user, regulars().getAllByRole("checkbox").slice(0, 12));
    const name = screen.getByPlaceholderText(
      "Guest's name, e.g. “Martin Ivanov”"
    );
    await user.type(name, "Martin");
    await user.click(screen.getByRole("button", { name: ADD_GUEST }));
    await waitFor(() => expect(addGuest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(name).toHaveProperty("value", ""));
    expect(
      screen
        .getByRole("checkbox", { name: "Guest Martin" })
        .getAttribute("aria-checked")
    ).toBe("false");
  });
});
