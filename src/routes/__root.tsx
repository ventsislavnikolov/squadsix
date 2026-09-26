import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Scripts,
} from "@tanstack/react-router";
import { PANE } from "@/components/page";
import { LangToggle, ThemeToggle, THEME_SCRIPT } from "@/components/toggles";
import { useI18n } from "@/lib/i18n";
import { sessionQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: ({ context }) => context.queryClient.ensureQueryData(sessionQuery),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Squad Six" },
      { name: "theme-color", content: "#f9fafb", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#111216", media: "(prefers-color-scheme: dark)" },
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
        <main>{children}</main>
        <Footer />
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
          <Link to="/" activeOptions={{ exact: true }} activeProps={active} className={link}>
            {t.nav.newMatch}
          </Link>
          <Link to="/history" activeProps={active} className={link}>
            {t.nav.history}
          </Link>
          {isAdmin && (
            <Link to="/admin" activeOptions={{ exact: true }} activeProps={active} className={link}>
              {t.nav.players}
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

function Footer() {
  const { t, isAdmin } = useI18n();
  return (
    <footer className={cn(PANE, "flex justify-end py-8 text-[12px] text-fg/35")}>
      {!isAdmin && (
        <Link to="/login" className="hover:text-fg/70">
          {t.nav.signIn}
        </Link>
      )}
    </footer>
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
