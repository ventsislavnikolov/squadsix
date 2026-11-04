import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchdayView, SignupView } from "@/server/repo";
import { getMatchday } from "@/server/repo";
import { Route } from "./og.$id";

vi.mock("@/server/repo", () => ({ getMatchday: vi.fn() }));

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

const signups = (n: number): SignupView[] =>
  Array.from({ length: n }, (_, i) => ({
    addedBy: null,
    createdAt: "2026-10-12T09:00:00.000Z",
    playerId: `p${i}`,
  }));

const day = (over: Partial<MatchdayView> = {}): MatchdayView => ({
  cancelledAt: null,
  cancelReason: null,
  changedAt: null,
  changes: null,
  createdBy: null,
  id: ID,
  kind: "announced",
  lockedAt: null,
  lockedProposalId: null,
  note: null,
  playedOn: "2026-10-13",
  players: [],
  proposals: [],
  run: null,
  scoreA: null,
  scoreB: null,
  signups: signups(7),
  squad: [],
  startsAt: "2026-10-13T17:00:00.000Z",
  venue: { id: "v1", name: "Арена", mapUrl: null },
  votes: [],
  winner: null,
  ...over,
});

async function picture(id: string): Promise<Response> {
  const handlers = Route.options.server?.handlers;
  if (!handlers || typeof handlers === "function" || !handlers.GET) {
    throw new Error("the route has no GET handler");
  }
  const get = handlers.GET as (ctx: { params: { id: string } }) => unknown;
  const res = await get({ params: { id } });
  if (!(res instanceof Response)) {
    throw new Error("the handler did not answer with a Response");
  }
  return res;
}

beforeEach(() => {
  vi.mocked(getMatchday).mockReset();
});

describe("GET /og/$id", () => {
  it.each([
    ["an open list", day()],
    ["a full list", day({ signups: signups(13) })],
    ["a locked game with a result", day({ lockedAt: "x", winner: "a" })],
    [
      "a cancelled game without a venue",
      day({ cancelledAt: "x", venue: null }),
    ],
  ])("draws a PNG for %s", async (_, game) => {
    vi.mocked(getMatchday).mockResolvedValue(game);
    const res = await picture(ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=300"
    );
    const png = new Uint8Array(await res.arrayBuffer());
    expect([...png.slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(res.headers.get("Content-Length")).toBe(String(png.length));
    // Crawlers get the picture without anyone's ratings.
    expect(getMatchday).toHaveBeenCalledWith(ID, false);
  });

  it("is not found for an unknown game, and never asks for a bad id", async () => {
    vi.mocked(getMatchday).mockResolvedValue(null);
    expect((await picture(ID)).status).toBe(404);
    expect((await picture("not-a-uuid")).status).toBe(404);
    expect(getMatchday).toHaveBeenCalledTimes(1);
  });
});
