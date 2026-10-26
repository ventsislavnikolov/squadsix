import { QueryClient } from "@tanstack/react-query";
import { createRouter, type AnyRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { ListSkeleton } from "./components/skeletons";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 2_000 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: ListSkeleton,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });
  if (typeof window !== "undefined") reloadOnStaleBuild(router);
  return router;
}

const RELOADED_AT = "s6-reloaded-at";

/**
 * A tab opened before a deploy asks for page files that no longer exist. Going to a page
 * then reloads the browser onto the new build instead of showing an error. A failed
 * preload (a hovered link) only marks the tab stale, so nobody loses a half-filled form.
 */
function reloadOnStaleBuild(router: AnyRouter) {
  let stale = false;
  const go = (href?: string) => {
    // Once in 10 seconds at most, so a file that's really missing can't loop.
    const last = Number(sessionStorage.getItem(RELOADED_AT)) || 0;
    if (Date.now() - last < 10_000) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    if (href) window.location.assign(href);
    else window.location.reload();
    return true;
  };
  window.addEventListener("vite:preloadError", (event) => {
    stale = true;
    // The address already shows the page being opened, so a reload lands on it.
    if (router.state.isLoading && go()) event.preventDefault();
  });
  router.subscribe("onBeforeNavigate", ({ toLocation }) => {
    if (stale) go(toLocation.href);
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
