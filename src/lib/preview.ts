// What a link to a game says when pasted into Messenger: the page title, the line under
// it and the picture. Link crawlers carry no cookie, so they always get Bulgarian —
// the group's language. Someone browsing in English gets the title in English.

import type { Lang } from "@/domain/names";
import type { MatchdayView } from "@/server/repo";

// Our own domain: Facebook refuses to fetch *.vercel.app links, so previews and shared
// links must live here. squadsix.vercel.app still serves the same app.
export const SITE = "https://squadsix.ventsislavnikolov.com";

export type Preview = {
  /** Big word on the picture: what state the game is in. */
  badge: string;
  /** Kick-off, or the day for a game made on the spot. */
  when: string;
  venue: string | null;
  /** "7/12 записани", or the result once there is one. */
  count: string;
  /** Page title and og:title. */
  title: string;
  /** og:description. */
  description: string;
  tone: "open" | "full" | "locked" | "cancelled";
};

const LOCALE: Record<Lang, string> = { bg: "bg-BG", en: "en-GB" };

const WORDS = {
  bg: {
    cancelled: "Отменен",
    cancelledTitle: "Отменен мач",
    cancelledBody: "Мачът няма да се играе.",
    cancelledWhy: (reason: string) => `Отменен: ${reason}`,
    draw: "Равен",
    won: (team: "a" | "b") => `Спечели Отбор ${team === "a" ? "А" : "Б"}`,
    result: "Резултат",
    teams: "Отбори",
    teamsReady: "Отборите са готови",
    seeTeams: "Виж кой в кой отбор е",
    lockedBody: "Отборите са заключени. Виж кой в кой отбор е.",
    vote: "Гласувай за отбори",
    voteCount: "3 варианта · гласуват дванайсетимата",
    voteBody: "Три варианта за отбори. Гласувай за най-честния.",
    full: "Пълен",
    newGame: "Нов мач",
    signed: (n: number) => `${n}/12 записани`,
    reserves: (n: number) => `${n} резерви`,
    fullBody: (reserves: string) => `Пълен: 12/12${reserves}. Можеш да се запишеш като резерва.`,
    openBody: (n: number) => `Записани ${n}/12, трябват още ${12 - n}. Запиши се!`,
  },
  en: {
    cancelled: "Cancelled",
    cancelledTitle: "Game cancelled",
    cancelledBody: "The game is off.",
    cancelledWhy: (reason: string) => `Cancelled: ${reason}`,
    draw: "Draw",
    won: (team: "a" | "b") => `Team ${team === "a" ? "A" : "B"} won`,
    result: "Result",
    teams: "Teams",
    teamsReady: "Teams are set",
    seeTeams: "See who's on which team",
    lockedBody: "Teams are locked. See who's on which team.",
    vote: "Vote for teams",
    voteCount: "3 options · the twelve vote",
    voteBody: "Three options for teams. Vote for the fairest.",
    full: "Full",
    newGame: "New game",
    signed: (n: number) => `${n}/12 signed up`,
    reserves: (n: number) => `${n} ${n === 1 ? "reserve" : "reserves"}`,
    fullBody: (reserves: string) => `Full: 12/12${reserves}. You can sign up as a reserve.`,
    openBody: (n: number) => `${n}/12 signed up, ${12 - n} more needed. Sign up!`,
  },
} satisfies Record<Lang, unknown>;

const cap = (s: string, lang: Lang) => s.charAt(0).toLocaleUpperCase(lang) + s.slice(1);

function whenOf(day: MatchdayView, lang: Lang): string {
  const locale = LOCALE[lang];
  if (day.startsAt) {
    const d = new Date(day.startsAt);
    const date = d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Sofia" });
    const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });
    return `${cap(date, lang)} · ${time}`;
  }
  return cap(new Date(day.playedOn).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" }), lang);
}

export function matchPreview(day: MatchdayView, lang: Lang = "bg"): Preview {
  const w = WORDS[lang];
  const when = whenOf(day, lang);
  const venue = day.venue?.name ?? null;
  const n = Math.min(day.signups.length, 12);
  const reserves = Math.max(0, day.signups.length - 12);
  const place = venue ? ` · ${venue}` : "";

  if (day.cancelledAt) {
    return {
      badge: w.cancelled,
      when,
      venue,
      count: day.cancelReason ?? w.cancelledBody,
      title: `${w.cancelledTitle} · ${when}`,
      description: day.cancelReason ? w.cancelledWhy(day.cancelReason) : w.cancelledBody,
      tone: "cancelled",
    };
  }
  if (day.lockedAt) {
    const result =
      day.winner === null
        ? null
        : (day.winner === "draw" ? w.draw : w.won(day.winner)) +
          (day.scoreA !== null && day.scoreB !== null ? ` · ${day.scoreA}:${day.scoreB}` : "");
    return {
      badge: result ? w.result : w.teamsReady,
      when,
      venue,
      count: result ?? w.seeTeams,
      title: `${result ? w.result : w.teams} · ${when}`,
      description: `${result ?? w.lockedBody}${place}`,
      tone: "locked",
    };
  }
  if (day.proposals.length > 0) {
    return {
      badge: w.vote,
      when,
      venue,
      count: w.voteCount,
      title: `${w.vote} · ${when}`,
      description: `${w.voteBody}${place}`,
      tone: "full",
    };
  }
  const full = n >= 12;
  return {
    badge: full ? w.full : w.newGame,
    when,
    venue,
    count: full ? `${w.signed(12)}${reserves ? ` · ${w.reserves(reserves)}` : ""}` : w.signed(n),
    title: `⚽ ${w.newGame} · ${when}`,
    description: full
      ? `${w.fullBody(reserves ? `, ${w.reserves(reserves)}` : "")}${place}`
      : `${w.openBody(n)}${place}`,
    tone: full ? "full" : "open",
  };
}

/** Changes whenever the preview would: list size, teams, lock, result, cancel. */
export function previewVersion(day: MatchdayView): string {
  const state = day.cancelledAt ? "x" : day.winner ? `r${day.winner}` : day.lockedAt ? "l" : day.proposals.length ? "t" : "";
  return `${day.signups.length}${state}`;
}

/**
 * The link to paste into Messenger. Messenger remembers a preview per exact URL, so a
 * link shared before the list moved would keep showing the old picture; the version in
 * the query makes each new state a new URL.
 */
export function shareUrl(day: MatchdayView): string {
  return `${SITE}/match/${day.id}?v=${previewVersion(day)}`;
}
