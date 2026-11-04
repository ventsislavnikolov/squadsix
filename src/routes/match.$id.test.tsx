// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunView } from "@/server/repo";
import {
  hoursFromNow,
  lockedDay,
  matchday,
  proposal,
  roster,
  votingDay,
} from "../../test/fixtures";
import { answerSession, offline, renderApp } from "../../test/render-app";
import {
  getBalls,
  getMatchday,
  getPickList,
  lock,
  rebalance,
  setResult,
  unlock,
  vote,
} from "../../test/server-functions";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const VOTE = /^vote$/iu;
const NEW_OPTIONS = /new options/iu;
const LOCK_TEAMS = /lock teams/iu;
const UNLOCK = /unlock/iu;
const SHARE = /^share$/iu;
const COPIED = /copied/iu;
const SAVE = /^save$/iu;
const NOT_VOTED = /Not voted yet: /u;
const TAB_TITLE = /New game · Friday,? 6 November · 19:30/u;
const OPTION_2 = /^Option 2/u;
const TEAMS_FOR_DATE = /^Teams for Friday,? 30 October\n/u;
const THREE_OPTIONS = /three options/iu;
const LOCKED = /teams are locked/iu;
const OG_IMAGE = /\/og\/m1\?v=/u;
const OG_URL = /\/match\/m1\?v=/u;
const NO_KEY = /The Jev key isn't set yet\./u;
const JEV_TIMEOUT = /Jev didn't answer: timeout/u;
const JEV_SILENT = /Jev didn't answer: Showing/u;
const OPTION_LABEL = /^Option \d$/u;

const FALLBACK_RUN: RunView = {
  source: "fallback",
  error: "missing-key",
  model: "~typesafe/jev-latest",
  durationMs: 12,
  trace: [
    { kind: "measure", combinations: 462, candidates: 10, ms: 3 },
    { kind: "decide", mode: "fallback", picked: ["c1", "c2", "c3"], ms: 1 },
  ],
};

function card(position: number) {
  const label = screen.getByText(`Option ${position}`);
  const node = label.closest("article");
  if (!node) {
    throw new Error(`no card ${position}`);
  }
  return within(node);
}

function dialog() {
  return within(screen.getByRole("dialog"));
}

describe("match page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    offline();
    getPickList.mockResolvedValue(roster(14));
    getBalls.mockResolvedValue([]);
    for (const fn of [vote, rebalance, lock, unlock, setResult]) {
      fn.mockResolvedValue(undefined);
    }
  });

  describe("before the teams", () => {
    it("shows the game day as the title, then restores the tab title", async () => {
      answerSession();
      const day = matchday({
        startsAt: "2026-11-06T17:30:00.000Z",
        playedOn: "2026-11-06",
        note: "Bring water",
      });
      getMatchday.mockResolvedValue(day);
      const { unmount } = renderApp("/match/m1");
      expect(await screen.findByText("Bring water")).toBeDefined();
      expect(screen.getByText("Office pitch")).toBeDefined();
      await waitFor(() => expect(document.title).toMatch(TAB_TITLE));
      unmount();
      expect(document.title).toBe("Squad Six");
    });

    it("shows not found when there is no such game", async () => {
      answerSession();
      getMatchday.mockResolvedValue(null);
      renderApp("/match/nope");
      expect(await screen.findByText("No such page.")).toBeDefined();
    });
  });

  describe("for a link preview crawler", () => {
    it("waits for the game and fills the preview tags", async () => {
      answerSession({ crawler: true });
      getMatchday.mockResolvedValue(matchday());
      renderApp("/match/m1");
      await waitFor(() =>
        expect(
          document
            .querySelector('meta[property="og:image"]')
            ?.getAttribute("content")
        ).toMatch(OG_IMAGE)
      );
      expect(
        document
          .querySelector('meta[property="og:url"]')
          ?.getAttribute("content")
      ).toMatch(OG_URL);
      expect(
        document
          .querySelector('meta[name="twitter:card"]')
          ?.getAttribute("content")
      ).toBe("summary_large_image");
    });

    it("gets not found for a missing game", async () => {
      answerSession({ crawler: true });
      getMatchday.mockResolvedValue(null);
      renderApp("/match/nope");
      expect(await screen.findByText("No such page.")).toBeDefined();
    });
  });

  describe("voting", () => {
    it("lets one of the twelve vote and says who hasn't", async () => {
      answerSession({ me: "p1" });
      getMatchday.mockResolvedValue(
        votingDay({ votes: [{ playerId: "p2", proposalId: "prop2" }] })
      );
      const { user } = renderApp("/match/m1");
      expect(
        await screen.findByRole("heading", { name: THREE_OPTIONS })
      ).toBeDefined();
      expect(screen.getByText(NOT_VOTED).textContent).not.toContain("Player 2");
      expect(card(2).getByText("leading")).toBeDefined();
      await user.click(card(1).getByRole("button", { name: VOTE }));
      await waitFor(() =>
        expect(vote).toHaveBeenCalledWith({
          data: { matchdayId: "m1", proposalId: "prop1", playerId: "p1" },
        })
      );
    });

    it("tells someone outside the twelve that they only watch", async () => {
      answerSession({ me: "p14" });
      getMatchday.mockResolvedValue(votingDay());
      renderApp("/match/m1");
      expect(
        await screen.findByText(
          "You're not in today's 12, so you don't vote. Watching is fine."
        )
      ).toBeDefined();
      expect(screen.queryByRole("button", { name: VOTE })).toBeNull();
    });

    it("shows a refused vote", async () => {
      answerSession({ me: "p1" });
      vote.mockRejectedValue(new Error("locked"));
      getMatchday.mockResolvedValue(votingDay());
      const { user } = renderApp("/match/m1");
      await screen.findByRole("heading", { name: THREE_OPTIONS });
      await user.click(card(3).getByRole("button", { name: VOTE }));
      expect(
        await screen.findByText("The game is locked or the vote isn't valid.")
      ).toBeDefined();
    });
  });

  describe("the admin, while voting is open", () => {
    it("asks for new options straight away when nobody has voted", async () => {
      answerSession({ isAdmin: true });
      getMatchday.mockResolvedValue(votingDay({ run: FALLBACK_RUN }));
      const { user } = renderApp("/match/m1");
      expect(
        await screen.findByText("Jev did not pick these teams.")
      ).toBeDefined();
      expect(screen.getByText(NO_KEY)).toBeDefined();
      expect(screen.getByText("How Jev decided")).toBeDefined();
      await user.click(screen.getByRole("button", { name: NEW_OPTIONS }));
      await waitFor(() =>
        expect(rebalance).toHaveBeenCalledWith({ data: { id: "m1" } })
      );
    });

    it("confirms new options once people have voted, and locks", async () => {
      answerSession({ isAdmin: true });
      getMatchday.mockResolvedValue(
        votingDay({
          run: { ...FALLBACK_RUN, error: "timeout" },
          votes: [
            { playerId: "p1", proposalId: "prop2" },
            { playerId: "p2", proposalId: "prop2" },
            { playerId: "p3", proposalId: "prop1" },
          ],
        })
      );
      const { user } = renderApp("/match/m1");
      expect(await screen.findByText(JEV_TIMEOUT));
      await user.click(screen.getByRole("button", { name: NEW_OPTIONS }));
      expect(
        dialog().getByText(
          "There are already 3 votes. They are cleared and everyone votes again."
        )
      ).toBeDefined();
      await user.click(dialog().getByRole("button", { name: NEW_OPTIONS }));
      await waitFor(() => expect(rebalance).toHaveBeenCalled());

      await user.click(screen.getByRole("button", { name: LOCK_TEAMS }));
      expect(
        dialog().getByText("Voting stops. Option 2 wins with 2 votes.")
      ).toBeDefined();
      await user.click(dialog().getByRole("button", { name: LOCK_TEAMS }));
      await waitFor(() =>
        expect(lock).toHaveBeenCalledWith({ data: { id: "m1" } })
      );
    });

    it("spins while new options are made, and words a Jev failure without a message", async () => {
      answerSession({ isAdmin: true });
      let finish = (): void => undefined;
      rebalance.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
      getMatchday.mockResolvedValue(
        votingDay({ run: { ...FALLBACK_RUN, error: null, trace: [] } })
      );
      const { user } = renderApp("/match/m1");
      expect(await screen.findByText(JEV_SILENT)).toBeDefined();
      expect(screen.queryByText("How Jev decided")).toBeNull();
      const again = screen.getByRole("button", { name: NEW_OPTIONS });
      await user.click(again);
      await waitFor(() => expect(again).toHaveProperty("disabled", true));
      expect(again.querySelector(".animate-spin")).not.toBeNull();
      finish();
      await waitFor(() => expect(again).toHaveProperty("disabled", false));
    });

    it("shows a refused request for new options", async () => {
      answerSession({ isAdmin: true });
      rebalance.mockRejectedValue(new Error("run-limit"));
      getMatchday.mockResolvedValue(votingDay());
      const { user } = renderApp("/match/m1");
      await user.click(
        await screen.findByRole("button", { name: NEW_OPTIONS })
      );
      expect(
        await screen.findByText("No more new options for this game (3 of 3).")
      ).toBeDefined();
    });

    it("cannot ask for new options or lock with fewer than twelve", async () => {
      answerSession({ isAdmin: true });
      getMatchday.mockResolvedValue(
        votingDay({ squad: roster(11).map((p) => p.id) })
      );
      renderApp("/match/m1");
      expect(
        await screen.findByRole("button", { name: NEW_OPTIONS })
      ).toHaveProperty("disabled", true);
      expect(screen.queryByRole("button", { name: LOCK_TEAMS })).toBeNull();
    });
  });

  describe("once locked", () => {
    it("puts the chosen option first, shares the teams and unlocks", async () => {
      answerSession({ isAdmin: true });
      getMatchday.mockResolvedValue(
        lockedDay({ lockedProposalId: "prop2", venue: null })
      );
      const { user } = renderApp("/match/m1");
      expect(
        await screen.findByRole("heading", { name: LOCKED })
      ).toBeDefined();
      const [first] = screen.getAllByText(OPTION_LABEL);
      expect(first?.textContent).toMatch(OPTION_2);
      expect(card(2).getByText("chosen")).toBeDefined();
      expect(screen.queryByRole("button", { name: VOTE })).toBeNull();

      const writeText = vi.spyOn(navigator.clipboard, "writeText");
      await user.click(screen.getByRole("button", { name: SHARE }));
      await waitFor(() => expect(writeText).toHaveBeenCalled());
      const [text] = writeText.mock.calls[0] ?? [];
      expect(text).toContain("Team A: Player 1, Player 3, Player 4");
      expect(text).toContain("/match/m1");
      expect(await screen.findByRole("button", { name: COPIED })).toBeDefined();
      // "Copied" turns back into "Share" after two seconds.
      await waitFor(
        () => expect(screen.getByRole("button", { name: SHARE })).toBeDefined(),
        { timeout: 4000 }
      );

      await user.click(screen.getByRole("button", { name: UNLOCK }));
      await user.click(dialog().getByRole("button", { name: UNLOCK }));
      await waitFor(() =>
        expect(unlock).toHaveBeenCalledWith({ data: { id: "m1" } })
      );
    });

    it("shares through the phone's share sheet for a game without a kick-off time", async () => {
      answerSession();
      const share = vi.fn(() => Promise.resolve());
      vi.stubGlobal("navigator", { ...navigator, share });
      getMatchday.mockResolvedValue(
        lockedDay({ kind: "quick", startsAt: null, playedOn: "2026-10-30" })
      );
      const { user } = renderApp("/match/m1");
      await user.click(await screen.findByRole("button", { name: SHARE }));
      await waitFor(() => expect(share).toHaveBeenCalled());
      expect(share.mock.calls[0]).toEqual([
        { text: expect.stringMatching(TEAMS_FOR_DATE) },
      ]);
      expect(screen.queryByRole("button", { name: COPIED })).toBeNull();
      vi.unstubAllGlobals();
    });

    it("has no teams to share when the locked option is missing", async () => {
      answerSession();
      getMatchday.mockResolvedValue(lockedDay({ lockedProposalId: "gone" }));
      renderApp("/match/m1");
      await screen.findByRole("heading", { name: LOCKED });
      expect(screen.queryByRole("button", { name: SHARE })).toBeNull();
    });

    it("lets the admin type a score, which names the winner", async () => {
      answerSession({ isAdmin: true });
      getMatchday.mockResolvedValue(lockedDay({ kind: "quick" }));
      const { user } = renderApp("/match/m1");
      expect(
        await screen.findByText("Type the score, or just pick who won.")
      ).toBeDefined();
      const [a, b] = screen.getAllByPlaceholderText("0");
      if (!(a && b)) {
        throw new Error("two score fields expected");
      }
      expect(screen.getByRole("button", { name: SAVE })).toHaveProperty(
        "disabled",
        true
      );
      await user.type(a, "5x");
      await user.type(b, "3");
      expect(a).toHaveProperty("value", "5");
      await user.click(screen.getByRole("button", { name: SAVE }));
      await waitFor(() =>
        expect(setResult).toHaveBeenCalledWith({
          data: { id: "m1", winner: "a", scoreA: 5, scoreB: 3 },
        })
      );
      expect(await screen.findByText("Saved.")).toBeDefined();
      await user.clear(a);
      await user.type(a, "3");
      await user.click(screen.getByRole("button", { name: SAVE }));
      await waitFor(() =>
        expect(setResult).toHaveBeenLastCalledWith({
          data: { id: "m1", winner: "draw", scoreA: 3, scoreB: 3 },
        })
      );
      await user.clear(a);
      await user.type(a, "1");
      await user.click(screen.getByRole("button", { name: SAVE }));
      await waitFor(() =>
        expect(setResult).toHaveBeenLastCalledWith({
          data: { id: "m1", winner: "b", scoreA: 1, scoreB: 3 },
        })
      );
    });

    it("drops a score that contradicts the picked winner, and shows a refusal", async () => {
      answerSession({ isAdmin: true });
      setResult.mockRejectedValue(new Error("not-locked"));
      getMatchday.mockResolvedValue(
        lockedDay({
          startsAt: hoursFromNow(-1),
          winner: "a",
          scoreA: 4,
          scoreB: 2,
        })
      );
      const { user } = renderApp("/match/m1");
      const [a] = await screen.findAllByPlaceholderText("0");
      expect(a).toHaveProperty("value", "4");
      // Picking the side the score already names keeps the score.
      await user.click(screen.getByRole("button", { name: "Team A" }));
      expect(a).toHaveProperty("value", "4");
      await user.click(screen.getByRole("button", { name: "Team B" }));
      expect(a).toHaveProperty("value", "");
      await user.click(screen.getByRole("button", { name: SAVE }));
      await waitFor(() =>
        expect(setResult).toHaveBeenCalledWith({
          data: { id: "m1", winner: "b", scoreA: null, scoreB: null },
        })
      );
      expect(await screen.findByText("Lock the teams first.")).toBeDefined();
    });

    it("shows players the result once there is one", async () => {
      answerSession();
      getMatchday.mockResolvedValue(
        lockedDay({ kind: "quick", winner: "b", scoreA: 2, scoreB: 6 })
      );
      renderApp("/match/m1");
      expect(await screen.findByText("Team B won · 2:6")).toBeDefined();
    });

    it("shows a draw without a score", async () => {
      answerSession();
      getMatchday.mockResolvedValue(
        lockedDay({ kind: "quick", winner: "draw" })
      );
      renderApp("/match/m1");
      expect(await screen.findByText("Draw")).toBeDefined();
    });

    it("shows a win for team A", async () => {
      answerSession();
      getMatchday.mockResolvedValue(lockedDay({ kind: "quick", winner: "a" }));
      renderApp("/match/m1");
      expect(await screen.findByText("Team A won")).toBeDefined();
    });

    it("shows nothing until the result is in", async () => {
      answerSession();
      getMatchday.mockResolvedValue(lockedDay({ kind: "quick" }));
      renderApp("/match/m1");
      await screen.findByRole("heading", { name: LOCKED });
      expect(screen.queryByText("Result")).toBeNull();
    });
  });

  describe("cancelled", () => {
    it("says so, with the reason, and offers no voting", async () => {
      answerSession({ isAdmin: true });
      getMatchday.mockResolvedValue(
        votingDay({
          cancelledAt: hoursFromNow(-1),
          cancelReason: "Rain",
          proposals: [proposal(1)],
        })
      );
      renderApp("/match/m1");
      expect(await screen.findByText("Rain")).toBeDefined();
      expect(
        screen.getAllByText("This game is cancelled.").length
      ).toBeGreaterThan(0);
      expect(screen.queryByText("Option 1")).toBeNull();
      expect(screen.queryByRole("button", { name: NEW_OPTIONS })).toBeNull();
      expect(screen.queryByRole("button", { name: SHARE })).toBeNull();
    });
  });
});
