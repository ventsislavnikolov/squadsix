import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBalls,
  getFullRoster,
  getLog,
  getMatchday,
  getMatchdays,
  getOpenMatch,
  getPickList,
  getRules,
  getSession,
  getVenues,
} from "../../test/server-functions";
import {
  ballsQuery,
  fullRosterQuery,
  logQuery,
  matchdayQuery,
  matchdaysQuery,
  openMatchQuery,
  pickListQuery,
  rulesQuery,
  sessionQuery,
  venuesQuery,
  warm,
} from "./queries";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queries", () => {
  it("reads each thing from its server function", async () => {
    const qc = new QueryClient();
    const fns = [
      getSession,
      getOpenMatch,
      getPickList,
      getMatchdays,
      getRules,
      getFullRoster,
      getLog,
      getBalls,
      getVenues,
    ];
    for (const [i, fn] of fns.entries()) {
      fn.mockResolvedValue(`answer ${i}`);
    }
    const answers = await Promise.all([
      qc.fetchQuery(sessionQuery),
      qc.fetchQuery(openMatchQuery),
      qc.fetchQuery(pickListQuery),
      qc.fetchQuery(matchdaysQuery),
      qc.fetchQuery(rulesQuery),
      qc.fetchQuery(fullRosterQuery),
      qc.fetchQuery(logQuery),
      qc.fetchQuery(ballsQuery),
      qc.fetchQuery(venuesQuery),
    ]);
    expect(answers).toEqual(fns.map((_, i) => `answer ${i}`));
    for (const fn of fns) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it("asks for one game by its id, and keeps it fresh", async () => {
    getMatchday.mockResolvedValue({ id: "m1" });
    const query = matchdayQuery("m1");
    expect(query.queryKey).toEqual(["matchday", "m1"]);
    expect(query.refetchInterval).toBe(5000);
    expect(await new QueryClient().fetchQuery(query)).toEqual({ id: "m1" });
    expect(getMatchday).toHaveBeenCalledWith({ data: { id: "m1" } });
  });
});

describe("warm", () => {
  it("starts every read without waiting, and swallows a failure", async () => {
    const qc = new QueryClient();
    getVenues.mockResolvedValue(["Arena"]);
    getBalls.mockRejectedValue(new Error("down"));
    warm(qc, venuesQuery, ballsQuery);
    expect(getVenues).toHaveBeenCalledTimes(1);
    expect(getBalls).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(qc.getQueryData(venuesQuery.queryKey)).toEqual(["Arena"])
    );
    await vi.waitFor(() =>
      expect(qc.getQueryState(ballsQuery.queryKey)?.status).toBe("error")
    );
  });
});
