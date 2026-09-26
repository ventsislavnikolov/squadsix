import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { PANE } from "@/components/page";
import { cn } from "@/lib/utils";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Squad Six — отбори за ритане" },
      { name: "theme-color", content: "#111216" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <div className={cn(PANE, "py-20 text-white/60")}>Няма такава страница.</div>
  ),
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        <nav className="border-b border-white/[0.06]">
          <div className={cn(PANE, "flex h-14 items-center justify-between")}>
            <Link to="/" className="flex items-center gap-2.5">
              <Mark />
              <span className="text-[14px] font-semibold tracking-[-0.01em]">Squad Six</span>
              <span className="eyebrow hidden sm:inline">6 × 6</span>
            </Link>
            <div className="flex gap-5 text-[13px] text-white/55">
              <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "text-white" }}>
                Нов мач
              </Link>
              <Link to="/history" activeProps={{ className: "text-white" }}>
                История
              </Link>
            </div>
          </div>
        </nav>
        <main>{children}</main>
        <Scripts />
      </body>
    </html>
  );
}

/** Two halves of a pitch, drawn in the page's colours. */
function Mark() {
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6" fill="none" stroke="currentColor" aria-hidden>
      <rect x="0.75" y="0.75" width="22.5" height="14.5" rx="1.5" strokeOpacity="0.5" />
      <path d="M12 0.75v14.5" className="text-primary" stroke="currentColor" />
      <circle cx="12" cy="8" r="2.6" className="text-primary" stroke="currentColor" />
    </svg>
  );
}
