// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Verdict } from "@/server/jev-harness";
import type { ProposalView, RosterPlayer } from "@/server/repo";
import { renderComponent } from "../../test/render-component";
import { ProposalCard } from "./proposal-card";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const RATED_LOPSIDED = /Rated “lopsided”/u;

function player(
  id: string,
  en: string,
  extra: Partial<RosterPlayer> = {}
): RosterPlayer {
  return {
    hidden: false,
    id,
    isGuest: false,
    lastPlayed: null,
    name: { bg: en, en },
    ...extra,
  };
}

const PLAYERS = [
  player("a1", "Zoran"),
  player("a2", "Asen", { isGuest: true }),
  player("b1", "Boris"),
  player("b2", "Yana"),
];
const RATED = [
  player("a1", "Zoran", { rating: 3 }),
  player("a2", "Asen", { isGuest: true, rating: null }),
  player("b1", "Boris", { rating: 4.5 }),
  player("b2", "Yana", { rating: 2 }),
];

const VERDICT: Verdict = {
  candidate: "c1",
  fairness: 0.9,
  fairnessConfidence: 0.81,
  fairnessLabel: "dead even",
  preferred: 0.42,
  rank: 1,
  stacked: 0.1,
};

const PROPOSAL: ProposalView = {
  gap: 0.5,
  id: "p1",
  position: 1,
  teamA: ["a1", "a2", "ghost"],
  teamB: ["b1", "b2"],
  verdict: VERDICT,
};

interface CardProps {
  byId?: Map<string, RosterPlayer>;
  canVote?: boolean;
  chosen?: boolean;
  leading?: boolean;
  mine?: boolean;
  onVote?: () => void;
  proposal?: ProposalView;
  voters?: string[];
  voting?: boolean;
}

function renderCard({
  proposal = PROPOSAL,
  byId = new Map(PLAYERS.map((p) => [p.id, p])),
  voters = [],
  leading = false,
  mine = false,
  chosen = false,
  canVote = false,
  voting = false,
  onVote = vi.fn(),
}: CardProps = {}) {
  return renderComponent(
    <ProposalCard
      byId={byId}
      canVote={canVote}
      chosen={chosen}
      leading={leading}
      mine={mine}
      onVote={onVote}
      proposal={proposal}
      voters={voters}
      voting={voting}
    />
  );
}

const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole("listitem")
    .map((li) => li.firstElementChild?.firstChild?.textContent);

describe("ProposalCard", () => {
  it("lists each team alphabetically for players, without totals or ratings", async () => {
    renderCard();
    const [teamA, teamB] = await screen.findAllByRole("list");
    if (!(teamA && teamB)) {
      throw new Error("two teams expected");
    }
    expect(names(teamA)).toEqual(["Asen", "Zoran"]);
    expect(names(teamB)).toEqual(["Boris", "Yana"]);
    expect(within(teamA).getByText("guest")).toBeTruthy();
    expect(screen.getByText("Option 1")).toBeTruthy();
    expect(screen.queryByText("3.0")).toBeNull();
  });

  it("shows the admin totals and ratings, strongest first", async () => {
    renderCard({
      byId: new Map(RATED.map((p) => [p.id, p])),
      proposal: { ...PROPOSAL, totals: { a: 5.5, b: 6.5 } },
    });
    const [teamA, teamB] = await screen.findAllByRole("list");
    if (!(teamA && teamB)) {
      throw new Error("two teams expected");
    }
    expect(names(teamA)).toEqual(["Zoran", "Asen"]);
    expect(names(teamB)).toEqual(["Boris", "Yana"]);
    expect(screen.getByText("5.5")).toBeTruthy();
    expect(screen.getByText("6.5")).toBeTruthy();
    expect(within(teamA).getByText("?")).toBeTruthy();
  });

  it("words Jev's verdict and places it on the scale", async () => {
    const { container } = renderCard();
    expect(
      await screen.findByText(
        "Rated “dead even” (81% confident). Chance it looks stacked: 10%. Chance it's the best game: 42%."
      )
    ).toBeTruthy();
    expect(
      (container.querySelector(".absolute") as HTMLElement).style.left
    ).toBe("90%");
  });

  it("falls back to the arithmetic when Jev gave no verdict", async () => {
    renderCard({ proposal: { ...PROPOSAL, gap: 2, verdict: null } });
    expect(
      await screen.findByText("Smallest gap in total rating (2.0).")
    ).toBeTruthy();
    expect(screen.getByText("2.0").className).toContain("text-destructive");
  });

  it("shows an unknown fairness label as it came", async () => {
    renderCard({
      proposal: {
        ...PROPOSAL,
        gap: 1,
        verdict: {
          ...VERDICT,
          fairness: 1.4,
          // A label this version doesn't know (an older or newer run): shown as it came.
          fairnessLabel: "lopsided" as "close",
        },
      },
    });
    expect(await screen.findByText(RATED_LOPSIDED)).toBeTruthy();
    expect(screen.getByText("1.0").className).toContain("text-warning");
  });

  it("names the voters and says which option leads", async () => {
    renderCard({ leading: true, voters: ["Asen", "Boris"] });
    expect(await screen.findByText("2 votes")).toBeTruthy();
    expect(screen.getByText("leading")).toBeTruthy();
    expect(screen.getByTitle("Asen, Boris")).toBeTruthy();
  });

  it("marks the chosen option instead of the leader once locked", async () => {
    const { container } = renderCard({
      chosen: true,
      leading: true,
      voters: ["Asen"],
    });
    expect(await screen.findByText("chosen")).toBeTruthy();
    expect(screen.queryByText("leading")).toBeNull();
    expect(container.querySelector("article")?.className).toContain(
      "border-confirmed"
    );
  });

  it("lets one of the twelve vote", async () => {
    const onVote = vi.fn();
    const { user } = renderCard({ canVote: true, onVote });
    await user.click(await screen.findByRole("button", { name: "Vote" }));
    expect(onVote).toHaveBeenCalledOnce();
  });

  it("shows the viewer's own vote", async () => {
    const { container } = renderCard({ canVote: true, mine: true });
    expect(
      await screen.findByRole("button", { name: "Your vote" })
    ).toBeTruthy();
    expect(container.querySelector("article")?.className).toContain(
      "border-primary"
    );
  });

  it("disables voting while a vote is on its way", async () => {
    renderCard({ canVote: true, voting: true });
    expect(
      (await screen.findByRole("button", { name: "Vote" })).hasAttribute(
        "disabled"
      )
    ).toBe(true);
  });
});
