import { type QueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { Suspense } from "react";
import { PANE } from "@/components/page";
import { Bone } from "@/components/skeletons";
import { LangToggle, THEME_SCRIPT, ThemeToggle } from "@/components/toggles";
import { useI18n } from "@/lib/i18n";
import { openMatchQuery, sessionQuery, warm } from "@/lib/queries";
import { cn } from "@/lib/utils";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
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
        {
          name: "theme-color",
          content: "#fcfcfc",
          media: "(prefers-color-scheme: light)",
        },
        {
          name: "theme-color",
          content: "#141414",
          media: "(prefers-color-scheme: dark)",
        },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      ],
    }),
    shellComponent: RootDocument,
    notFoundComponent: NotFound,
  }
);

function RootDocument({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  return (
    // The theme script sets data-theme before paint; React must not fight it.
    <html lang={lang} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant inline script (no user input) that must run before first paint to set the theme without a flash. */}
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
        <Link
          aria-label="Squad Six"
          className="flex shrink-0 items-center gap-2.5"
          to="/"
        >
          <Mark />
          <span className="hidden text-[14px] font-semibold tracking-[-0.01em] whitespace-nowrap min-[400px]:inline">
            Squad Six
          </span>
          <span className="hidden eyebrow md:inline">6 × 6</span>
        </Link>
        <div className="flex items-center gap-3.5 text-[13px] sm:gap-5">
          <Suspense fallback={<Bone className="h-3.5 w-10" />}>
            <GameLink className={link} />
          </Suspense>
          <Link activeProps={active} className={link} to="/history">
            {t.nav.history}
          </Link>
          <Link activeProps={active} className={link} to="/balls">
            {t.nav.balls}
          </Link>
          {isAdmin ? (
            <>
              <Link
                activeOptions={{ exact: true }}
                activeProps={active}
                className={link}
                to="/admin"
              >
                {t.nav.players}
              </Link>
              <Link
                activeProps={active}
                className={cn(link, "hidden sm:inline")}
                to="/admin/venues"
              >
                {t.nav.venues}
              </Link>
              <Link
                activeProps={active}
                className={cn(link, "hidden sm:inline")}
                to="/admin/rules"
              >
                {t.nav.rules}
              </Link>
              <Link
                activeProps={active}
                className={cn(link, "hidden sm:inline")}
                to="/admin/log"
              >
                {t.nav.log}
              </Link>
            </>
          ) : null}
          <span aria-hidden className="hidden h-4 w-px bg-fg/10 sm:block" />
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
    <Link
      activeProps={active}
      className={className}
      params={{ id: open.id }}
      to="/match/$id"
    >
      {t.nav.match}
    </Link>
  ) : (
    <Link
      activeOptions={{ exact: true }}
      activeProps={active}
      className={className}
      to="/"
    >
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
    <svg
      aria-hidden
      className="h-4 w-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 16"
    >
      <rect
        height="14.5"
        rx="1.5"
        strokeOpacity="0.5"
        width="22.5"
        x="0.75"
        y="0.75"
      />
      <path className="text-primary" d="M12 0.75v14.5" stroke="currentColor" />
      <circle
        className="text-primary"
        cx="12"
        cy="8"
        r="2.6"
        stroke="currentColor"
      />
    </svg>
  );
}
