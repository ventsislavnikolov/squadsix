// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/functions";
import { useMe } from "./use-voter";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const KEY = "s6-me";
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

// The hook syncs the two copies once per page load, so every test loads it afresh.
async function load(cookie: string) {
  vi.resetModules();
  const fresh = await import("./use-voter");
  const server = await import("@/server/functions");
  const rememberMe = vi.mocked(server.rememberMe);
  const getSession = vi.mocked(server.getSession);
  rememberMe.mockResolvedValue(undefined);
  const qc = new QueryClient();
  const session: Session = {
    crawler: false,
    isAdmin: false,
    lang: "en",
    me: cookie,
  };
  qc.setQueryData(["session"], session);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  getSession.mockResolvedValue(session);
  return { qc, rememberMe, ...renderHook(() => fresh.useMe(), { wrapper }) };
}

function Me() {
  return <span>{useMe()[0]}</span>;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMe", () => {
  it("is nobody on a fresh phone, and tells the server nothing", async () => {
    const { result, rememberMe } = await load("");
    expect(result.current[0]).toBe("");
    expect(rememberMe).not.toHaveBeenCalled();
  });

  it("restores the browser's copy from the cookie", async () => {
    const { result, rememberMe } = await load(ME);
    expect(result.current[0]).toBe(ME);
    expect(localStorage.getItem(KEY)).toBe(ME);
    expect(rememberMe).not.toHaveBeenCalled();
  });

  it("restores the cookie from the browser's copy, which wins", async () => {
    localStorage.setItem(KEY, ME);
    const { result, rememberMe } = await load(OTHER);
    expect(result.current[0]).toBe(ME);
    expect(rememberMe).toHaveBeenCalledWith({ data: { playerId: ME } });
  });

  it("syncs only once per page load", async () => {
    localStorage.setItem(KEY, ME);
    const { rememberMe, unmount } = await load("");
    unmount();
    const again = await import("./use-voter");
    renderHook(() => again.useMe(), {
      wrapper: ({ children }: { children: ReactNode }) => {
        const qc = new QueryClient();
        qc.setQueryData(["session"], { me: OTHER });
        return (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        );
      },
    });
    expect(rememberMe).toHaveBeenCalledTimes(1);
  });

  it("remembers a pick in both places and in the session", async () => {
    const { result, qc, rememberMe } = await load("");
    act(() => result.current[1](ME));
    expect(result.current[0]).toBe(ME);
    expect(localStorage.getItem(KEY)).toBe(ME);
    expect(qc.getQueryData<Session>(["session"])?.me).toBe(ME);
    expect(rememberMe).toHaveBeenCalledWith({ data: { playerId: ME } });

    // The session update reaches React on the query cache's next tick.
    await act(async () => {
      result.current[1]("");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current[0]).toBe("");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the pick on screen when the server cannot save it", async () => {
    const { result, rememberMe } = await load("");
    rememberMe.mockRejectedValue(new Error("offline"));
    act(() => result.current[1](ME));
    await act(() => Promise.resolve());
    expect(result.current[0]).toBe(ME);
  });

  it("leaves the session alone when it was never loaded", async () => {
    const { result, qc } = await load("");
    qc.removeQueries({ queryKey: ["session"] });
    act(() => result.current[1](ME));
    expect(qc.getQueryData(["session"])).toBeUndefined();
  });

  it("falls back to the cookie where storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = await load(ME);
    expect(result.current[0]).toBe(ME);
    act(() => result.current[1](OTHER));
    expect(result.current[0]).toBe(ME);
  });

  it("renders the cookie's choice on the server, where there is no storage", () => {
    localStorage.setItem(KEY, OTHER);
    const qc = new QueryClient();
    qc.setQueryData(["session"], { me: ME });
    expect(
      renderToString(
        <QueryClientProvider client={qc}>
          <Me />
        </QueryClientProvider>
      )
    ).toBe(`<span>${ME}</span>`);
  });
});
