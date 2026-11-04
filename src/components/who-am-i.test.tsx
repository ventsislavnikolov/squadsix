// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterPlayer } from "@/server/repo";
import { renderComponent } from "../../test/render-component";
import { getPickList, rememberMe } from "../../test/server-functions";
import { WhoAmI } from "./who-am-i";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const player = (id: string, bg: string, en: string): RosterPlayer => ({
  hidden: false,
  id,
  isGuest: false,
  lastPlayed: null,
  name: { bg, en },
});

const ROSTER = [player(ME, "Иван", "Ivan"), player(OTHER, "Петър", "Petar")];
const PICK_LIST: [readonly unknown[], unknown] = [["pick-list"], ROSTER];

describe("WhoAmI", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    rememberMe.mockResolvedValue(undefined);
  });

  it("asks who you are, and asks again before remembering", async () => {
    const { user } = renderComponent(<WhoAmI />, { data: [PICK_LIST] });
    expect(await screen.findByText("Who are you?")).toBeTruthy();
    expect(
      screen.getByText("Pick your name. This phone will remember it.")
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Petar" }));
    expect(screen.getByText("Are you Petar?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByText("Who are you?")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ivan" }));
    await user.click(screen.getByRole("button", { name: "Yes, that's me" }));
    expect(await screen.findByText("You're Ivan.")).toBeTruthy();
    expect(localStorage.getItem("s6-me")).toBe(ME);
    expect(rememberMe).toHaveBeenCalledWith({ data: { playerId: ME } });
  });

  it("filters the names in either script", async () => {
    const { user } = renderComponent(<WhoAmI compact />, {
      data: [PICK_LIST],
    });
    const search = await screen.findByPlaceholderText("Find your name");
    expect(
      screen.queryByText("Pick your name. This phone will remember it.")
    ).toBeNull();
    await user.type(search, "пет");
    expect(screen.queryByRole("button", { name: "Ivan" })).toBeNull();
    expect(screen.getByRole("button", { name: "Petar" })).toBeTruthy();
    await user.clear(search);
    await user.type(search, "IVA");
    expect(screen.getByRole("button", { name: "Ivan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Petar" })).toBeNull();
  });

  it("greets a remembered player and lets them change or keep it", async () => {
    localStorage.setItem("s6-me", ME);
    const { user } = renderComponent(<WhoAmI />, { data: [PICK_LIST] });
    expect(await screen.findByText("You're Ivan.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Not you?" }));
    expect(screen.getByText("Who are you?")).toBeTruthy();
    // The current choice is highlighted, and cancel goes back to the greeting.
    expect(
      screen.getByRole("button", { name: "Ivan" }).getAttribute("data-variant")
    ).toBe("default");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("You're Ivan.")).toBeTruthy();
  });

  it("restores the choice from the cookie when this browser forgot it", async () => {
    renderComponent(<WhoAmI />, {
      data: [PICK_LIST],
      session: { me: OTHER },
    });
    expect(await screen.findByText("You're Petar.")).toBeTruthy();
  });

  it("renders nothing until the list has loaded", async () => {
    getPickList.mockReturnValue(new Promise(() => undefined));
    const { container } = renderComponent(<WhoAmI />);
    await waitFor(() => expect(getPickList).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
