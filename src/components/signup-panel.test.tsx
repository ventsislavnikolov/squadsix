// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchdayView, RosterPlayer } from "@/server/repo";
import { renderComponent } from "../../test/render-component";
import {
  addGuest,
  cancelMatch,
  makeTeams,
  rememberMe,
  signUp,
  withdraw,
} from "../../test/server-functions";
import {
  AnnounceShare,
  EventInfo,
  OwnerActions,
  SignupPanel,
} from "./signup-panel";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const CHANGES = /time 19:00 → 20:00 · note — → Bibs/u;
const HAS_THE_BALLS = /has the balls/u;
const TIMED_HEADER = /^Thursday,? 5 November · 20:00\nPark\n\n/u;
const UNTIMED_HEADER = /^Thursday,? 5 November\n\n1\. \?\n/u;
const REMOVE = /^Remove/u;
const AUTO_TEAMS = /two hours before kick-off/u;
const GUESTS_FROM =
  /Guests can be signed up from .* \(24 hours before the game\)\./u;
const GUESTS_LATER = /Guests can be signed up/u;

const HOUR = 3_600_000;
const NAMES = [
  "Asen",
  "Boris",
  "Dimo",
  "Emil",
  "Filip",
  "Georgi",
  "Hristo",
  "Ivan",
  "Kalin",
  "Lyubo",
  "Mitko",
  "Nikola",
  "Ognyan",
  "Petar",
];
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const PLAYERS: RosterPlayer[] = NAMES.map((en, i) => ({
  hidden: false,
  id: id(i + 1),
  isGuest: false,
  lastPlayed: null,
  name: { bg: en, en },
}));
const GUEST: RosterPlayer = {
  hidden: false,
  id: id(99),
  isGuest: true,
  lastPlayed: null,
  name: { bg: "Гост", en: "Gosho" },
};
const OUTSIDER: RosterPlayer = {
  hidden: false,
  id: id(50),
  isGuest: false,
  lastPlayed: null,
  name: { bg: "Яна", en: "Yana" },
};
const BY_ID = new Map([...PLAYERS, GUEST].map((p) => [p.id, p]));
const ME = id(1);
const WHO = (n: number) => NAMES[n - 1] ?? "";

const at = (hoursAhead: number) =>
  new Date(Date.now() + hoursAhead * HOUR).toISOString();

function day(extra: Partial<MatchdayView> = {}): MatchdayView {
  return {
    cancelReason: null,
    cancelledAt: null,
    changedAt: null,
    changes: null,
    createdBy: null,
    id: "m1",
    kind: "announced",
    lockedAt: null,
    lockedProposalId: null,
    note: null,
    playedOn: "2026-11-05",
    players: [],
    proposals: [],
    run: null,
    scoreA: null,
    scoreB: null,
    signups: [],
    squad: [],
    startsAt: at(72),
    venue: null,
    votes: [],
    winner: null,
    ...extra,
  };
}

const signups = (count: number, addedBy: string | null = null) =>
  Array.from({ length: count }, (_, i) => ({
    addedBy,
    createdAt: "2026-11-01T10:00:00Z",
    playerId: id(i + 1),
  }));

const PICK_LIST: [readonly unknown[], unknown] = [
  ["pick-list"],
  [...PLAYERS, GUEST, OUTSIDER],
];

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  rememberMe.mockResolvedValue(undefined);
});

/* ------------------------------------------------------------------- event info -- */

describe("EventInfo", () => {
  it("shows the place with its map, the note, the changes and who announced it", async () => {
    renderComponent(
      <EventInfo
        byId={BY_ID}
        day={day({
          changes: [
            { field: "time", from: "19:00", to: "20:00" },
            { field: "note", from: "", to: "Bibs" },
          ],
          createdBy: id(2),
          note: "Bring bibs",
          venue: { id: "v", mapUrl: "https://maps.example/x", name: "Park" },
        })}
      />,
      { data: [[["balls"], []], PICK_LIST] }
    );
    expect(await screen.findByText("Park")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Map" }).getAttribute("href")).toBe(
      "https://maps.example/x"
    );
    expect(screen.getByText("Bring bibs")).toBeTruthy();
    expect(screen.getByText(CHANGES)).toBeTruthy();
    expect(screen.getByText("Announced by Boris")).toBeTruthy();
    expect(screen.queryByText(HAS_THE_BALLS)).toBeNull();
  });

  it("says who has to bring the balls, even if they are not playing", async () => {
    renderComponent(<EventInfo byId={BY_ID} day={day()} />, {
      data: [[["balls"], [{ at: "", playerId: OUTSIDER.id }]], PICK_LIST],
    });
    const link = await screen.findByRole("link", {
      name: "Yana has the balls.",
    });
    expect(link.getAttribute("href")).toBe("/balls");
  });

  it("names a holder who is on the game's list", async () => {
    renderComponent(<EventInfo byId={BY_ID} day={day()} />, {
      data: [[["balls"], [{ at: "", playerId: id(3) }]], PICK_LIST],
    });
    expect(await screen.findByText("Dimo has the balls.")).toBeTruthy();
  });

  it("leaves out the balls for a cancelled game, and the announcer for a quick one", async () => {
    const { container } = renderComponent(
      <EventInfo
        byId={BY_ID}
        day={day({
          cancelledAt: at(-1),
          changes: [],
          createdBy: id(2),
          kind: "quick",
          venue: { id: "v", mapUrl: null, name: "Park" },
        })}
      />,
      { data: [[["balls"], [{ at: "", playerId: id(3) }]], PICK_LIST] }
    );
    expect(await screen.findByText("Park")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent).not.toContain("balls");
    expect(container.textContent).not.toContain("Announced");
  });
});

/* ---------------------------------------------------------------- owner actions -- */

describe("OwnerActions", () => {
  it("shows nothing to players", async () => {
    const { container } = renderComponent(
      <>
        <span>ready</span>
        <OwnerActions day={day()} />
      </>
    );
    await screen.findByText("ready");
    expect(container.textContent).toBe("ready");
  });

  it("shows nothing for a cancelled game", async () => {
    const { container } = renderComponent(
      <>
        <span>ready</span>
        <OwnerActions day={day({ cancelledAt: at(-1) })} />
      </>,
      { session: { isAdmin: true } }
    );
    await screen.findByText("ready");
    expect(container.textContent).toBe("ready");
  });

  it("lets the admin edit, or cancel with a reason", async () => {
    localStorage.setItem("s6-me", ME);
    cancelMatch.mockResolvedValue(undefined);
    const { user, queryClient } = renderComponent(
      <OwnerActions day={day()} />,
      { session: { isAdmin: true } }
    );
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    expect(
      (await screen.findByRole("link", { name: "Edit" })).getAttribute("href")
    ).toBe("/edit/m1");

    await user.click(screen.getByRole("button", { name: "Cancel game" }));
    await user.type(
      await screen.findByPlaceholderText("Reason (optional), e.g. “rain”"),
      " rain "
    );
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Cancel game" })
    );
    await waitFor(() =>
      expect(cancelMatch).toHaveBeenCalledWith({
        data: { actorId: ME, id: "m1", reason: "rain" },
      })
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["matchday", "m1"] })
    );
  });

  it("cannot edit a locked or quick game, and words a refusal", async () => {
    cancelMatch.mockRejectedValue(new Error("started"));
    const { user } = renderComponent(
      <OwnerActions day={day({ kind: "quick", lockedAt: at(-1) })} />,
      { session: { isAdmin: true } }
    );
    await user.click(
      await screen.findByRole("button", { name: "Cancel game" })
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancel game",
      })
    );
    expect(
      await screen.findByText("The game has already started.")
    ).toBeTruthy();
    expect(cancelMatch).toHaveBeenCalledWith({
      data: { actorId: null, id: "m1", reason: null },
    });
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });
});

/* ---------------------------------------------------------------------- sharing -- */

describe("AnnounceShare", () => {
  it("copies the announcement with the list, reserves and link", async () => {
    const startsAt = "2026-11-05T18:00:00.000Z";
    const { user } = renderComponent(
      <AnnounceShare
        byId={BY_ID}
        day={day({
          signups: signups(13),
          startsAt,
          venue: { id: "v", mapUrl: null, name: "Park" },
        })}
      />
    );
    await user.click(await screen.findByRole("button", { name: "Share" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    const text = await navigator.clipboard.readText();
    expect(text).toMatch(TIMED_HEADER);
    expect(text).toContain("1. Asen\n2. Boris");
    expect(text).toContain("12. Nikola\n\nReserves:\n13. Ognyan");
    expect(text).toContain(
      "Sign up: https://squadsix.ventsislavnikolov.com/match/m1?v="
    );
    // "Copied" goes back to "Share" after a moment.
    expect(
      await screen.findByRole("button", { name: "Share" }, { timeout: 3000 })
    ).toBeTruthy();
  });

  it("uses the day for a game without a time or place", async () => {
    const { user } = renderComponent(
      <AnnounceShare
        byId={BY_ID}
        day={day({
          signups: [{ addedBy: null, createdAt: "", playerId: "x" }],
          startsAt: null,
        })}
      />
    );
    await user.click(await screen.findByRole("button", { name: "Share" }));
    await screen.findByRole("button", { name: "Copied" });
    const text = await navigator.clipboard.readText();
    expect(text).toMatch(UNTIMED_HEADER);
    expect(text).not.toContain("Reserves");
  });

  it("stays put when the share sheet is closed", async () => {
    const share = vi.fn(() =>
      Promise.reject(Object.assign(new Error("closed"), { name: "AbortError" }))
    );
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    try {
      const { user } = renderComponent(
        <AnnounceShare byId={BY_ID} day={day()} />
      );
      await user.click(await screen.findByRole("button", { name: "Share" }));
      await waitFor(() => expect(share).toHaveBeenCalled());
      expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    } finally {
      Reflect.deleteProperty(navigator, "share");
    }
  });
});

/* --------------------------------------------------------------------- the list -- */

function renderPanel(
  game: MatchdayView,
  { admin = false, me = "" }: { admin?: boolean; me?: string } = {}
) {
  if (me) {
    localStorage.setItem("s6-me", me);
  }
  return renderComponent(<SignupPanel byId={BY_ID} day={game} />, {
    data: [PICK_LIST],
    session: { isAdmin: admin },
  });
}

describe("SignupPanel", () => {
  it("invites the first sign-up and counts what's missing", async () => {
    renderPanel(day());
    expect(await screen.findByText("Nobody yet. Be the first.")).toBeTruthy();
    expect(screen.getByText("0/12")).toBeTruthy();
    expect(screen.getByText("12 more needed.")).toBeTruthy();
    // Nobody picked on this phone: nothing to press.
    expect(screen.queryByRole("button", { name: "I'm in" })).toBeNull();
  });

  it("signs the viewer up", async () => {
    signUp.mockResolvedValue(undefined);
    const { user } = renderPanel(day({ signups: signups(3).slice(1) }), {
      me: ME,
    });
    await user.click(await screen.findByRole("button", { name: "I'm in" }));
    expect(signUp).toHaveBeenCalledWith({
      data: { actorId: ME, matchdayId: "m1", playerId: ME },
    });
  });

  it("lets the viewer drop out", async () => {
    withdraw.mockResolvedValue(undefined);
    const { user } = renderPanel(day({ signups: signups(2) }), { me: ME });
    const list = await screen.findByRole("list");
    expect(within(list).getByText("you")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "I'm out" }));
    expect(withdraw).toHaveBeenCalledWith({
      data: { actorId: ME, matchdayId: "m1", playerId: ME },
    });
  });

  it("lets whoever added someone take them off, and nobody else", async () => {
    withdraw.mockResolvedValue(undefined);
    const game = day({
      signups: [
        { addedBy: ME, createdAt: "", playerId: id(2) },
        { addedBy: null, createdAt: "", playerId: id(3) },
        { addedBy: null, createdAt: "", playerId: GUEST.id },
      ],
    });
    const { user } = renderPanel(game, { me: ME });
    expect(await screen.findByText("added by Asen")).toBeTruthy();
    expect(screen.getByText("guest")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Dimo" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Remove Boris" }));
    expect(withdraw).toHaveBeenCalledWith({
      data: { actorId: ME, matchdayId: "m1", playerId: id(2) },
    });
  });

  it("lets the admin take anyone off", async () => {
    renderPanel(day({ signups: signups(3) }), { admin: true });
    expect(
      await screen.findByRole("button", { name: "Remove Dimo" })
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: REMOVE })).toHaveLength(3);
  });

  it("puts everyone past twelve on the reserves and offers to make teams", async () => {
    makeTeams.mockResolvedValue(undefined);
    const { user } = renderPanel(day({ signups: signups(14) }), { me: ME });
    expect(await screen.findByText("12/12")).toBeTruthy();
    expect(screen.getByText("Reserves")).toBeTruthy();
    const [squad, reserves] = screen.getAllByRole("list");
    expect(within(squad as HTMLElement).getAllByRole("listitem")).toHaveLength(
      12
    );
    expect(
      within(reserves as HTMLElement)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
    ).toEqual(["13.Ognyan", "14.Petar"]);
    expect(screen.getByText("Twelve in. Teams can be made.")).toBeTruthy();
    expect(screen.getByText(AUTO_TEAMS)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Make teams" }));
    expect(makeTeams).toHaveBeenCalledWith({ data: { id: "m1" } });
  });

  it("says when Jev is making the teams, without promising it for a quick game", async () => {
    makeTeams.mockReturnValue(new Promise(() => undefined));
    const { user } = renderPanel(day({ kind: "quick", signups: signups(12) }));
    await user.click(await screen.findByRole("button", { name: "Make teams" }));
    expect(
      await screen.findByRole("button", { name: "Making teams…" })
    ).toBeTruthy();
    expect(screen.queryByText(AUTO_TEAMS)).toBeNull();
  });

  it("spins while signing up and words a refusal", async () => {
    let refuse: (err: Error) => void = () => undefined;
    signUp.mockReturnValue(
      new Promise((_, reject) => {
        refuse = reject;
      })
    );
    const { user } = renderPanel(day(), { me: ME });
    await user.click(await screen.findByRole("button", { name: "I'm in" }));
    expect(
      screen.getByRole("button", { name: "I'm in" }).hasAttribute("disabled")
    ).toBe(true);
    refuse(new Error("locked"));
    expect(
      await screen.findByText("The game is locked or the vote isn't valid.")
    ).toBeTruthy();
  });

  it("closes the list once the game has started", async () => {
    renderPanel(day({ signups: signups(12), startsAt: at(-1) }), { me: ME });
    expect(
      await screen.findByText("Sign-up is closed — the game has started.")
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "I'm out" })).toBeNull();
    expect(screen.queryByRole("button", { name: REMOVE })).toBeNull();
  });

  it("says nothing about closing for a cancelled game", async () => {
    const { container } = renderPanel(
      day({ cancelledAt: at(-2), signups: signups(1) }),
      { me: ME }
    );
    await screen.findByText("1/12");
    expect(container.textContent).not.toContain("closed");
    expect(container.textContent).not.toContain("more needed");
  });

  it("asks for more players when someone drops out after the lock", async () => {
    renderPanel(
      day({
        lockedAt: at(-1),
        proposals: [
          { gap: 0, id: "p", position: 1, teamA: [], teamB: [], verdict: null },
        ],
        signups: signups(11),
        squad: signups(11).map((s) => s.playerId),
      })
    );
    const warning = await screen.findByText("1 more needed.");
    expect(warning.className).toContain("text-warning");
    expect(screen.queryByRole("button", { name: "Make teams" })).toBeNull();
  });
});

/* ------------------------------------------------------------------ add someone -- */

describe("adding someone else", () => {
  it("signs up someone from the list who isn't on it yet", async () => {
    signUp.mockResolvedValue(undefined);
    const { user } = renderPanel(day({ kind: "quick", signups: signups(10) }), {
      me: ME,
    });
    await user.click(
      await screen.findByRole("button", { name: "Add someone" })
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: WHO(2) })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Gosho" })).toBeTruthy();
    await user.type(
      within(dialog).getByPlaceholderText("Search by name"),
      "pet"
    );
    expect(within(dialog).queryByRole("button", { name: "Mitko" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Petar" }));
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        data: { actorId: ME, matchdayId: "m1", playerId: id(14) },
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("adds a typed guest, matching names in either script", async () => {
    addGuest.mockResolvedValue({ id: "new-guest" });
    signUp.mockResolvedValue(undefined);
    const { user } = renderPanel(day({ kind: "quick" }), { me: ME });
    await user.click(
      await screen.findByRole("button", { name: "Add someone" })
    );
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByPlaceholderText(
      "Guest's name, e.g. “Martin Ivanov”"
    );
    const add = within(dialog).getByRole("button", { name: "Add guest" });
    await user.type(name, "M");
    expect(add.hasAttribute("disabled")).toBe(true);
    await user.clear(name);
    await user.type(name, "гос");
    // The typed name filters the list too, so a known guest is found, not added twice.
    expect(within(dialog).getByRole("button", { name: "Gosho" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Asen" })).toBeNull();
    await user.clear(name);
    await user.type(name, " Martin Ivanov ");
    await user.click(add);
    await waitFor(() =>
      expect(addGuest).toHaveBeenCalledWith({ data: { name: "Martin Ivanov" } })
    );
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        data: { actorId: ME, matchdayId: "m1", playerId: "new-guest" },
      })
    );
  });

  it("ignores a guest name too short to submit", async () => {
    const { user } = renderPanel(day({ kind: "quick" }), { me: ME });
    await user.click(
      await screen.findByRole("button", { name: "Add someone" })
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("Guest's name, e.g. “Martin Ivanov”"),
      "M{Enter}"
    );
    expect(addGuest).not.toHaveBeenCalled();
  });

  it("holds guests back until the last 24 hours of an announced game", async () => {
    const { user } = renderPanel(day({ startsAt: at(48) }), { me: ME });
    await user.click(
      await screen.findByRole("button", { name: "Add someone" })
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Gosho" })).toBeNull();
    expect(within(dialog).getByText(GUESTS_FROM)).toBeTruthy();
    expect(dialog.querySelector("form")?.className).toContain("hidden");
  });

  it("lets the admin add guests early", async () => {
    const { user } = renderPanel(day({ startsAt: at(48) }), {
      admin: true,
      me: ME,
    });
    await user.click(
      await screen.findByRole("button", { name: "Add someone" })
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Gosho" })).toBeTruthy();
    expect(within(dialog).queryByText(GUESTS_LATER)).toBeNull();
  });

  it("opens guests within the last day before kick-off", async () => {
    const { user } = renderPanel(day({ startsAt: at(5) }), { me: ME });
    await user.click(
      await screen.findByRole("button", { name: "Add someone" })
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Gosho" })).toBeTruthy();
  });

  it("words a refusal and keeps the dialog open", async () => {
    signUp.mockRejectedValue(new Error("guest-early"));
    const { user } = renderPanel(day({ kind: "quick" }), { me: ME });
    await user.click(
      await screen.findByRole("button", { name: "Add someone" })
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Asen" }));
    expect(
      await within(dialog).findByText(
        "Guests can only be signed up in the last 24 hours before the game."
      )
    ).toBeTruthy();
  });
});
