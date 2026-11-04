// Renders the real app (route tree, root layout, TanStack Query) at a path, in jsdom,
// against the `vi.fn` server functions of ./server-functions. A page test mocks
// `@/server/functions` with that module, says what the server answers, and drives the
// page as a user would.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { vi } from "vitest";
import type { Session } from "@/server/functions";
import { Route as rootRoute } from "../src/routes/__root";
import { routeTree } from "../src/routeTree.gen";
import { getOpenMatch, getSession } from "./server-functions";

export const PLAYER_SESSION: Session = {
  crawler: false,
  isAdmin: false,
  lang: "en",
  me: "",
};

export const ADMIN_SESSION: Session = { ...PLAYER_SESSION, isAdmin: true };

/** The answers every page needs: who is looking, and whether a game is open. */
export function answerSession(session: Partial<Session> = {}) {
  getSession.mockResolvedValue({ ...PLAYER_SESSION, ...session });
  getOpenMatch.mockResolvedValue({ id: null });
}

/** No network: the weather and radar fetches fail, and the cards stay hidden. */
export function offline() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline in tests")))
  );
}

// The root layout renders the whole document (<html>, <head>, <body>). Mounted inside a
// test container, those would be React's document singletons, and Radix portals into
// document.body then never settle. The layout still renders in full (nav, theme script,
// head tags), with those three elements as plain <div data-document="…">.
const DOCUMENT_TAGS = new Set(["html", "head", "body"]);

interface DocumentProps {
  children?: ReactNode;
  lang?: string;
  suppressHydrationWarning?: boolean;
}

function withoutDocument(node: ReactNode): ReactNode {
  if (
    !isValidElement<DocumentProps>(node) ||
    typeof node.type !== "string" ||
    !DOCUMENT_TAGS.has(node.type)
  ) {
    return node;
  }
  const { children, lang } = node.props;
  return createElement(
    "div",
    { "data-document": node.type, lang },
    Children.map(children, withoutDocument)
  );
}

type ShellComponent = (props: { children: ReactNode }) => ReactElement;

// `shellComponent` is a root-only option, so the shared route types leave it out.
const rootOptions = rootRoute.options as { shellComponent?: ShellComponent };
const Shell = rootOptions.shellComponent;

function TestShell({ children }: { children: ReactNode }) {
  return Shell ? withoutDocument(Shell({ children })) : children;
}

rootRoute.update({ shellComponent: TestShell } as Parameters<
  typeof rootRoute.update
>[0]);

export function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 2000 } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { ...view, queryClient, router, user };
}
