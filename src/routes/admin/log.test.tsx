// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logEntry } from "../../../test/fixtures";
import { answerSession, renderApp } from "../../../test/render-app";
import { getLog } from "../../../test/server-functions";

vi.mock("@/server/functions", () => import("../../../test/server-functions"));

describe("admin log page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says when nothing is logged", async () => {
    answerSession({ isAdmin: true });
    getLog.mockResolvedValue([]);
    renderApp("/admin/log");
    expect(await screen.findByText("Nothing logged yet.")).toBeDefined();
  });

  it("shows each action with who, where from, and refusals", async () => {
    answerSession({ isAdmin: true, lang: "bg" });
    getLog.mockResolvedValue([
      logEntry({
        id: "1",
        action: "matchday.lock",
        ok: false,
        actor: "Player 1",
        matchdayId: "0123456789abcdef",
        detail: { reason: "has-votes" },
        ip: "203.0.113.7",
        userAgent: "Messenger",
      }),
      logEntry({ id: "2", action: "admin.login" }),
    ]);
    renderApp("/admin/log");
    expect(await screen.findByText("matchday.lock")).toBeDefined();
    expect(screen.getByText("отказано")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "01234567" }).getAttribute("href")
    ).toBe("/match/0123456789abcdef");
    expect(screen.getByText("Player 1")).toBeDefined();
    expect(screen.getByText('{"reason":"has-votes"}')).toBeDefined();
    expect(screen.getByText("203.0.113.7")).toBeDefined();
    expect(screen.getByTitle("Messenger")).toBeDefined();
    expect(screen.getByText("admin.login")).toBeDefined();
  });
});
