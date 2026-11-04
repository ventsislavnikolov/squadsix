// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRouter } from "./router";

vi.mock("@/server/functions", () => import("../test/server-functions"));

const RELOADED_AT = "s6-reloaded-at";
const assign = vi.fn<(href: string) => void>();
const reload = vi.fn<() => void>();

function preloadError(): Event {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

/** The router as a page sees it while a page is (or is not) loading. */
function routerWhile(loading: boolean) {
  const router = getRouter();
  vi.spyOn(router, "state", "get").mockReturnValue({
    ...router.state,
    isLoading: loading,
  });
  return router;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("location", { ...window.location, assign, reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  assign.mockReset();
  reload.mockReset();
});

describe("getRouter", () => {
  it("builds the app's router around a fresh query client", () => {
    const router = getRouter();
    expect(router.options.context.queryClient.getDefaultOptions()).toEqual({
      queries: { staleTime: 2000 },
    });
    expect(router.options.defaultPreload).toBe("intent");
    expect(router.options.scrollRestoration).toBe(true);
    expect(getRouter().options.context.queryClient).not.toBe(
      router.options.context.queryClient
    );
  });
});

describe("a tab left open across a deploy", () => {
  it("reloads onto the new build when the page being opened is missing", () => {
    routerWhile(true);
    expect(preloadError().defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(Number(sessionStorage.getItem(RELOADED_AT))).toBeGreaterThan(0);
  });

  it("reloads at most once in ten seconds, so a really missing file cannot loop", () => {
    routerWhile(true);
    sessionStorage.setItem(RELOADED_AT, String(Date.now() - 5000));
    expect(preloadError().defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("only marks the tab stale on a failed preload, then reloads on the next page", async () => {
    const router = routerWhile(false);
    expect(preloadError().defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();

    await router.navigate({ to: "/history" }).catch(() => undefined);
    expect(assign).toHaveBeenCalledWith("/history");
  });

  it("navigates normally while the tab is current", async () => {
    const router = routerWhile(false);
    await router.navigate({ to: "/history" }).catch(() => undefined);
    expect(assign).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
