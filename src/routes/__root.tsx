import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { PANE } from "@/components/page";
import { Bone } from "@/components/skeletons";
import { LangToggle, ThemeToggle, THEME_SCRIPT } from "@/components/toggles";
import { useI18n } from "@/lib/i18n";
import { openMatchQuery, sessionQuery, warm } from "@/lib/queries";
import { cn } from "@/lib/utils";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // The session is a cookie read; the open game is a database read the nav can wait for.
  beforeLoad: ({ context }) => {
    warm(context.queryClient, openMatchQuery);
    return context.queryClient.ensureQueryData(sessionQuery);
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Squad Six" },
      { name: "theme-color", content: "#fcfcfc", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#141414", media: "(prefers-color-scheme: dark)" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  return (
    // The theme script sets data-theme before paint; React must not fight it.
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        <Nav />
        <main className="pb-10">{children}</main>
        <Scripts />
      </body>
    </html>
  );
}

function Nav() {
  const { t, isAdmin } = useI18n();
  const link = "whitespace-nowrap text-fg/55 hover:text-fg transition-colors";
  const active = { className: "text-fg" };
  return (
    <nav className="border-b border-fg/[0.07]">
      <div className={cn(PANE, "flex h-14 items-center justify-between gap-4")}>
        <Link to="/" aria-label="Squad Six" className="flex shrink-0 items-center gap-2.5">
          <Mark />
          <span className="hidden text-[14px] font-semibold tracking-[-0.01em] whitespace-nowrap min-[400px]:inline">Squad Six</span>
          <span className="eyebrow hidden md:inline">6 × 6</span>
        </Link>
        <div className="flex items-center gap-3.5 text-[13px] sm:gap-5">
          <Suspense fallback={<Bone className="h-3.5 w-10" />}>
            <GameLink className={link} />
          </Suspense>
          <Link to="/history" activeProps={active} className={link}>
            {t.nav.history}
          </Link>
          <Link to="/balls" activeProps={active} className={link}>
            {t.nav.balls}
          </Link>
          {isAdmin && (
            <Link to="/admin" activeOptions={{ exact: true }} activeProps={active} className={link}>
              {t.nav.players}
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin/venues" activeProps={active} className={cn(link, "hidden sm:inline")}>
              {t.nav.venues}
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin/rules" activeProps={active} className={cn(link, "hidden sm:inline")}>
              {t.nav.rules}
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin/log" activeProps={active} className={cn(link, "hidden sm:inline")}>
              {t.nav.log}
            </Link>
          )}
          <span className="hidden h-4 w-px bg-fg/10 sm:block" aria-hidden />
          <LangToggle />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

/** "Game" while one is open, "New game" otherwise. */
function GameLink({ className }: { className: string }) {
  const { t } = useI18n();
  const { data: open } = useSuspenseQuery(openMatchQuery);
  const active = { className: "text-fg" };
  return open.id ? (
    <Link to="/match/$id" params={{ id: open.id }} activeProps={active} className={className}>
      {t.nav.match}
    </Link>
  ) : (
    <Link to="/" activeOptions={{ exact: true }} activeProps={active} className={className}>
      {t.nav.newMatch}
    </Link>
  );
}

function NotFound() {
  const { lang } = useI18n();
  return (
    <div className={cn(PANE, "py-20 text-fg/60")}>
      {lang === "bg" ? "Няма такава страница." : "No such page."}
    </div>
  );
}

/** Two halves of a pitch. */
function Mark() {
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6" fill="none" stroke="currentColor" aria-hidden>
      <rect x="0.75" y="0.75" width="22.5" height="14.5" rx="1.5" strokeOpacity="0.5" />
      <path d="M12 0.75v14.5" className="text-primary" stroke="currentColor" />
      <circle cx="12" cy="8" r="2.6" className="text-primary" stroke="currentColor" />
    </svg>
  );
}
