import { describe, expect, it, vi } from "vitest";
import { getRouter } from "./router";

vi.mock("@/server/functions", () => import("../test/server-functions"));

describe("getRouter on the server", () => {
  it("builds the router without reaching for the browser", () => {
    expect(typeof window).toBe("undefined");
    expect(getRouter().options.defaultPreload).toBe("intent");
  });
});
