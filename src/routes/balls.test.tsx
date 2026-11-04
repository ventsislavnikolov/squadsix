// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handover, roster } from "../../test/fixtures";
import { answerSession, renderApp } from "../../test/render-app";
import { getBalls, getPickList, passBalls } from "../../test/server-functions";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const TOOK_THEM = /i took them/iu;
const GAVE_THEM = /i gave them to/iu;
// ICU versions differ on the comma after the weekday.
const SINCE = /^since Friday,? 30 October$/u;

describe("balls page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getPickList.mockResolvedValue(roster(3));
    passBalls.mockResolvedValue(undefined);
  });

  it("says nobody has them yet", async () => {
    answerSession();
    getBalls.mockResolvedValue([]);
    renderApp("/balls");
    expect(
      await screen.findByRole("heading", { name: "nobody has the balls." })
    ).toBeDefined();
    expect(screen.getByText("Nobody has taken them yet.")).toBeDefined();
    expect(screen.queryByRole("button", { name: TOOK_THEM })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("lets a player say they took them", async () => {
    answerSession({ me: "p2" });
    getBalls.mockResolvedValue([
      handover("p1", "2026-10-30T18:00:00.000Z"),
      handover("p3", "2026-10-23T18:00:00.000Z"),
    ]);
    const { user } = renderApp("/balls");
    expect(
      await screen.findByRole("heading", { name: "Player 1 has the balls." })
    ).toBeDefined();
    expect(screen.getByText(SINCE)).toBeDefined();
    expect(screen.getByText("Player 3")).toBeDefined();
    await user.click(screen.getByRole("button", { name: TOOK_THEM }));
    await waitFor(() =>
      expect(passBalls).toHaveBeenCalledWith({
        data: { playerId: "p2", actorId: "p2" },
      })
    );
  });

  it("lets the holder hand them to someone else", async () => {
    answerSession({ me: "p1" });
    getBalls.mockResolvedValue([handover("p1", "2026-10-30T18:00:00.000Z")]);
    const { user } = renderApp("/balls");
    expect(await screen.findByText("You have them.")).toBeDefined();
    await user.click(screen.getByRole("combobox"));
    // The holder isn't offered to themselves.
    expect(screen.queryByRole("option", { name: "Player 1" })).toBeNull();
    await user.click(await screen.findByRole("option", { name: "Player 3" }));
    await waitFor(() =>
      expect(passBalls).toHaveBeenCalledWith({
        data: { playerId: "p3", actorId: "p1" },
      })
    );
  });

  it("lets the admin put them with anyone, and shows a refusal", async () => {
    answerSession({ isAdmin: true });
    passBalls.mockRejectedValue(new Error("not-allowed"));
    getBalls.mockResolvedValue([handover("p1", "2026-10-30T18:00:00.000Z")]);
    const { user } = renderApp("/balls");
    await user.click(await screen.findByRole("combobox"));
    expect(screen.getByText(GAVE_THEM)).toBeDefined();
    await user.click(await screen.findByRole("option", { name: "Player 2" }));
    expect(
      await screen.findByText(
        "Only whoever announced it, or the admin, can do that."
      )
    ).toBeDefined();
    expect(passBalls).toHaveBeenCalledWith({
      data: { playerId: "p2", actorId: null },
    });
  });
});
