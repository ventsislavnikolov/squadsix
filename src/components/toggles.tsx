import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { setLang } from "@/server/functions";

/* ------------------------------------------------------------------------ theme -- */

type Theme = "system" | "light" | "dark";
const THEME_KEY = "s6-theme";

/** Runs in <head> before first paint, so a chosen theme never flashes the other one. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();`;

const NEXT_THEME: Record<Theme, Theme> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const THEME_ICON = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
} as const;

function applyTheme(value: Theme) {
  try {
    if (value === "system") {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, value);
    }
  } catch {
    /* storage blocked — the choice lasts for this page only */
  }
  if (value === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = value;
  }
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(readTheme()), []);

  const cycle = useCallback(() => {
    const value = NEXT_THEME[theme];
    setTheme(value);
    applyTheme(value);
  }, [theme]);
  const Icon = THEME_ICON[theme];
  const label = `${t.theme.label}: ${t.theme[theme]}`;

  return (
    <button
      aria-label={label}
      className="grid size-7 place-items-center rounded-md text-fg/55 transition-colors hover:bg-fg/[0.06] hover:text-fg"
      onClick={cycle}
      title={label}
      type="button"
    >
      <Icon className="size-4" />
    </button>
  );
}

/* --------------------------------------------------------------------- language -- */

export function LangToggle() {
  const { lang, t } = useI18n();
  const qc = useQueryClient();
  const router = useRouter();
  const other = lang === "bg" ? "en" : "bg";
  const switchLang = useCallback(async () => {
    await setLang({ data: { lang: other } });
    qc.setQueryData(
      ["session"],
      (s: { lang: string; isAdmin: boolean } | undefined) =>
        s ? { ...s, lang: other } : s
    );
    await router.invalidate();
  }, [other, qc, router]);
  return (
    <button
      className="rounded-md px-1.5 py-1 font-mono text-[11.5px] tracking-[0.08em] text-fg/55 transition-colors hover:bg-fg/[0.06] hover:text-fg"
      onClick={switchLang}
      title={t.lang.label}
      type="button"
    >
      {t.lang.other}
    </button>
  );
}
