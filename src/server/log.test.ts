import { beforeEach, describe, expect, it, vi } from "vitest";
import { answer, ran, resetSql } from "../../test/fake-sql";
import { logAction, readLog } from "./log";

const { request } = vi.hoisted(() => ({
  request: { ip: "203.0.113.5" as string | undefined, agent: "" },
}));

vi.mock("./db", () => import("../../test/fake-sql"));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestIP: () => request.ip,
  getRequestHeader: (name: string) =>
    name === "user-agent" && request.agent ? request.agent : undefined,
}));

beforeEach(() => {
  resetSql();
  request.ip = "203.0.113.5";
  request.agent = "";
});

describe("logAction", () => {
  it("writes the action with who, where from and the detail", async () => {
    request.agent = "x".repeat(400);
    await logAction({
      action: "vote.cast",
      ok: false,
      actor: "ivan",
      matchdayId: "m",
      detail: { proposal: "p1" },
    });
    expect(ran("insert into activity_log")[0]?.values).toEqual([
      "vote.cast",
      false,
      "ivan",
      "m",
      JSON.stringify({ proposal: "p1" }),
      "203.0.113.5",
      "x".repeat(300),
    ]);
  });

  it("fills the blanks with defaults", async () => {
    request.ip = undefined;
    await logAction({ action: "admin.logout" });
    expect(ran("insert into activity_log")[0]?.values).toEqual([
      "admin.logout",
      true,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("never lets a failed write break the action", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {
      // Silenced: the failure is the point of this test.
    });
    answer("insert into activity_log", () => {
      throw new Error("db down");
    });
    await expect(logAction({ action: "admin.login" })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      "activity_log write failed",
      expect.any(Error)
    );
    error.mockRestore();
  });
});

describe("readLog", () => {
  it("drops entries past 90 days, then reads the newest first", async () => {
    answer("from activity_log order by at desc", [
      {
        id: 1,
        at: "2026-11-04 12:00",
        action: "vote.cast",
        ok: true,
        actor: "ivan",
        matchday_id: "m",
        detail: { proposal: "p1" },
        ip: "203.0.113.5",
        user_agent: "Safari",
      },
      {
        id: 2,
        at: "2026-11-03 12:00",
        action: "admin.logout",
        ok: false,
        actor: null,
        matchday_id: null,
        detail: null,
        ip: null,
        user_agent: null,
      },
    ]);
    const entries = await readLog(50);
    expect(ran("delete from activity_log")[0]?.values).toEqual([90]);
    expect(ran("from activity_log order by at desc")[0]?.values).toEqual([50]);
    expect(entries).toEqual([
      {
        id: "1",
        at: "2026-11-04 12:00",
        action: "vote.cast",
        ok: true,
        actor: "ivan",
        matchdayId: "m",
        detail: { proposal: "p1" },
        ip: "203.0.113.5",
        userAgent: "Safari",
      },
      {
        id: "2",
        at: "2026-11-03 12:00",
        action: "admin.logout",
        ok: false,
        actor: null,
        matchdayId: null,
        detail: null,
        ip: null,
        userAgent: null,
      },
    ]);
  });

  it("reads 300 entries by default", async () => {
    await readLog();
    expect(ran("from activity_log order by at desc")[0]?.values).toEqual([300]);
  });
});
