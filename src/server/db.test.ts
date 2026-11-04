import { afterEach, describe, expect, it, vi } from "vitest";

const { client, neon } = vi.hoisted(() => {
  const query = vi.fn(() => Promise.resolve([{ one: 1 }]));
  return { client: query, neon: vi.fn(() => query) };
});

vi.mock("@neondatabase/serverless", () => ({ neon }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireEnv", () => {
  it("returns a set variable and refuses a missing one", async () => {
    const { requireEnv } = await import("./db");
    vi.stubEnv("SQUAD_TEST_VALUE", "on");
    expect(requireEnv("SQUAD_TEST_VALUE")).toBe("on");
    vi.stubEnv("SQUAD_TEST_VALUE", "");
    expect(() => requireEnv("SQUAD_TEST_VALUE")).toThrow(
      "SQUAD_TEST_VALUE is not set"
    );
  });
});

describe("sql", () => {
  it("connects once, on first use, and passes the query through", async () => {
    const { sql } = await import("./db");
    vi.stubEnv("DATABASE_URL", "postgres://neon.example/db");
    const id = "p1";
    expect(await sql`select ${id}`).toEqual([{ one: 1 }]);
    await sql`select 2`;
    expect(neon).toHaveBeenCalledTimes(1);
    expect(neon).toHaveBeenCalledWith("postgres://neon.example/db");
    expect(client).toHaveBeenCalledTimes(2);
    expect(client.mock.calls[0]).toEqual([["select ", ""], "p1"]);
  });
});
