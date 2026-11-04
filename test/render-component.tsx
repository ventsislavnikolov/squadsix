// Renders one component the way a page would: inside TanStack Query (with the session and
// any other reads already answered) and a memory router, so `useI18n`, `Link` and
// `useRouter` work. Server functions stay the `vi.fn`s of ./server-functions.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { Session } from "@/server/functions";

export const SESSION: Session = {
  crawler: false,
  isAdmin: false,
  lang: "en",
  me: "",
};

export interface RenderOptions {
  /** Query data the component reads, by query key. */
  data?: [readonly unknown[], unknown][];
  session?: Partial<Session>;
}

export function renderComponent(
  ui: ReactNode,
  { data = [], session = {} }: RenderOptions = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  queryClient.setQueryData(["session"], { ...SESSION, ...session });
  for (const [key, value] of data) {
    queryClient.setQueryData(key, value);
  }
  const rootRoute = createRootRoute({ component: () => ui });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { ...view, queryClient, router, user };
}
