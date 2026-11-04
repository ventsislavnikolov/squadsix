// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ratedPlayer, rule } from "../../../test/fixtures";
import { answerSession, renderApp } from "../../../test/render-app";
import {
  addRule,
  getFullRoster,
  getRules,
  removeRule,
} from "../../../test/server-functions";

vi.mock("@/server/functions", () => import("../../../test/server-functions"));

const ADD = /^add$/iu;

const ROSTER = [
  ratedPlayer(1, 4),
  ratedPlayer(2, 3),
  ratedPlayer(3, 3),
  ratedPlayer(4, 2, { hidden: true }),
];

function section(title: string) {
  const heading = screen.getByRole("heading", { name: title });
  const node = heading.closest("section");
  if (!node) {
    throw new Error(`no section ${title}`);
  }
  return within(node);
}

describe("admin rules page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answerSession({ isAdmin: true });
    getFullRoster.mockResolvedValue(ROSTER);
  });

  it("says when a kind has no rules", async () => {
    getRules.mockResolvedValue([]);
    renderApp("/admin/rules");
    expect(await screen.findAllByText("No rules.")).toHaveLength(2);
  });

  it("lists rules, marks hidden players, and removes one", async () => {
    getRules.mockResolvedValue([
      rule("r1", "together", ["p1", "p2", "p3"]),
      rule("r2", "apart", ["p1", "p4"]),
    ]);
    removeRule.mockResolvedValue(undefined);
    const { user } = renderApp("/admin/rules");
    await screen.findByRole("heading", { name: "Together" });
    expect(section("Together").getByText("Player 3")).toBeDefined();
    expect(section("Together").getAllByText("+")).toHaveLength(2);
    expect(section("Apart").getByText("↔")).toBeDefined();
    expect(section("Apart").getByText("(hidden)")).toBeDefined();
    await user.click(section("Apart").getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(removeRule).toHaveBeenCalledWith({ data: { id: "r2" } })
    );
  });

  it("shows a refused removal", async () => {
    getRules.mockResolvedValue([rule("r1", "apart", ["p1", "p2"])]);
    removeRule.mockRejectedValue(new Error("admin-only"));
    const { user } = renderApp("/admin/rules");
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Admin only.")).toBeDefined();
  });

  it("adds a Together group of three, offering only unpicked, visible players", async () => {
    getRules.mockResolvedValue([]);
    addRule.mockResolvedValue({ id: "r9" });
    const { user } = renderApp("/admin/rules");
    await screen.findByRole("heading", { name: "Together" });
    const together = section("Together");
    const add = together.getByRole("button", { name: ADD });
    const [first, second, third] = together.getAllByRole("combobox");
    if (!(first && second && third)) {
      throw new Error("three pickers expected");
    }
    expect(third.textContent).toContain("third (optional)");
    await user.click(first);
    // Hidden players can't be given new rules.
    expect(screen.queryByRole("option", { name: "Player 4" })).toBeNull();
    await user.click(await screen.findByRole("option", { name: "Player 1" }));
    expect(add).toHaveProperty("disabled", true);
    await user.click(second);
    // Whoever is picked in another slot isn't offered again.
    expect(screen.queryByRole("option", { name: "Player 1" })).toBeNull();
    await user.click(await screen.findByRole("option", { name: "Player 2" }));
    expect(add).toHaveProperty("disabled", false);
    await user.click(third);
    await user.click(await screen.findByRole("option", { name: "Player 3" }));
    await user.click(add);
    await waitFor(() =>
      expect(addRule).toHaveBeenCalledWith({
        data: { kind: "together", players: ["p1", "p2", "p3"] },
      })
    );
    await waitFor(() => expect(first.textContent).toContain("Pick"));
  });

  it("adds an Apart pair and shows a refusal", async () => {
    getRules.mockResolvedValue([]);
    addRule.mockRejectedValue(new Error("rule-conflict"));
    const { user } = renderApp("/admin/rules");
    await screen.findByRole("heading", { name: "Apart" });
    const apart = section("Apart");
    const [first, second] = apart.getAllByRole("combobox");
    if (!(first && second)) {
      throw new Error("two pickers expected");
    }
    await user.click(first);
    await user.click(await screen.findByRole("option", { name: "Player 2" }));
    await user.click(second);
    await user.click(await screen.findByRole("option", { name: "Player 3" }));
    await user.click(apart.getByRole("button", { name: ADD }));
    expect(
      await screen.findByText(
        "That contradicts another rule: the same people both together and apart."
      )
    ).toBeDefined();
    expect(addRule).toHaveBeenCalledWith({
      data: { kind: "apart", players: ["p2", "p3"] },
    });
  });
});
