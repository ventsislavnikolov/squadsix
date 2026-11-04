// What a link to a game says when pasted into Messenger: the page title, the line under
// it and the picture. Link crawlers carry no cookie, so they always get Bulgarian —
// the group's language. Someone browsing in English gets the title in English.

import type { Lang } from "@/domain/names";
import type { MatchdayView } from "@/server/repo";

// Our own domain: Facebook refuses to fetch *.vercel.app links, so previews and shared
// links must live here. squadsix.vercel.app still serves the same app.
export const SITE = "https://squadsix.ventsislavnikolov.com";

export interface Preview {
  /** Big word on the picture: what state the game is in. */
  badge: string;
  /** "7/12 записани", or the result once there is one. */
  count: string;
  /** og:description. */
  description: string;
  /** Page title and og:title. */
  title: string;
  tone: "open" | "full" | "locked" | "cancelled";
  venue: string | null;
  /** Kick-off, or the day for a game made on the spot. */
  when: string;
}

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
    fullBody: (reserves: string) =>
      `Пълен: 12/12${reserves}. Можеш да се запишеш като резерва.`,
    openBody: (n: number) =>
      `Записани ${n}/12, трябват още ${12 - n}. Запиши се!`,
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
    fullBody: (reserves: string) =>
      `Full: 12/12${reserves}. You can sign up as a reserve.`,
    openBody: (n: number) =>
      `${n}/12 signed up, ${12 - n} more needed. Sign up!`,
  },
} satisfies Record<Lang, unknown>;

const cap = (s: string, lang: Lang) =>
  s.charAt(0).toLocaleUpperCase(lang) + s.slice(1);

function whenOf(day: MatchdayView, lang: Lang): string {
  const locale = LOCALE[lang];
  if (day.startsAt) {
    const d = new Date(day.startsAt);
    const date = d.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Sofia",
    });
    const time = d.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Sofia",
    });
    return `${cap(date, lang)} · ${time}`;
  }
  return cap(
    new Date(day.playedOn).toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
    lang
  );
}

type Words = (typeof WORDS)[Lang];

export function matchPreview(day: MatchdayView, lang: Lang = "bg"): Preview {
  const w = WORDS[lang];
  const when = whenOf(day, lang);
  const venue = day.venue?.name ?? null;
  const place = venue ? ` · ${venue}` : "";

  if (day.cancelledAt) {
    return {
      badge: w.cancelled,
      when,
      venue,
      count: day.cancelReason ?? w.cancelledBody,
      title: `${w.cancelledTitle} · ${when}`,
      description: day.cancelReason
        ? w.cancelledWhy(day.cancelReason)
        : w.cancelledBody,
      tone: "cancelled",
    };
  }
  if (day.lockedAt) {
    const result = resultLine(day, w);
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
  return { ...signUpPreview(day, w, when, place), when, venue };
}

/** "Team A won · 5:3", or null before the admin enters a result. */
function resultLine(day: MatchdayView, w: Words): string | null {
  if (day.winner === null) {
    return null;
  }
  const winner = day.winner === "draw" ? w.draw : w.won(day.winner);
  const score =
    day.scoreA !== null && day.scoreB !== null
      ? ` · ${day.scoreA}:${day.scoreB}`
      : "";
  return winner + score;
}

/** A game still taking names: how many are in, and whether it is full. */
function signUpPreview(
  day: MatchdayView,
  w: Words,
  when: string,
  place: string
): Omit<Preview, "when" | "venue"> {
  const n = Math.min(day.signups.length, 12);
  const title = `⚽ ${w.newGame} · ${when}`;
  if (n < 12) {
    return {
      badge: w.newGame,
      count: w.signed(n),
      title,
      description: `${w.openBody(n)}${place}`,
      tone: "open",
    };
  }
  const reserves = day.signups.length - 12;
  return {
    badge: w.full,
    count: `${w.signed(12)}${reserves ? ` · ${w.reserves(reserves)}` : ""}`,
    title,
    description: `${w.fullBody(reserves ? `, ${w.reserves(reserves)}` : "")}${place}`,
    tone: "full",
  };
}

/** Changes whenever the preview would: list size, teams, lock, result, cancel. */
export function previewVersion(day: MatchdayView): string {
  return `${day.signups.length}${stateMark(day)}`;
}

function stateMark(day: MatchdayView): string {
  if (day.cancelledAt) {
    return "x";
  }
  if (day.winner) {
    return `r${day.winner}`;
  }
  if (day.lockedAt) {
    return "l";
  }
  return day.proposals.length ? "t" : "";
}

/**
 * The link to paste into Messenger. Messenger remembers a preview per exact URL, so a
 * link shared before the list moved would keep showing the old picture; the version in
 * the query makes each new state a new URL.
 */
export function shareUrl(day: MatchdayView): string {
  return `${SITE}/match/${day.id}?v=${previewVersion(day)}`;
}
