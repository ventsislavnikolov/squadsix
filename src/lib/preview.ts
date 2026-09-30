// What a link to a game says when pasted into Messenger: the page title, the line under
// it and the picture. Link crawlers carry no cookie, so this is always in Bulgarian —
// the group's language.

import type { MatchdayView } from "@/server/repo";

export const SITE = "https://squadsix.vercel.app";

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

const cap = (s: string) => s.charAt(0).toLocaleUpperCase("bg") + s.slice(1);

function whenOf(day: MatchdayView): string {
  if (day.startsAt) {
    const d = new Date(day.startsAt);
    const date = d.toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Sofia" });
    const time = d.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" });
    return `${cap(date)} · ${time}`;
  }
  return cap(new Date(day.playedOn).toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long" }));
}

export function matchPreview(day: MatchdayView): Preview {
  const when = whenOf(day);
  const venue = day.venue?.name ?? null;
  const n = Math.min(day.signups.length, 12);
  const reserves = Math.max(0, day.signups.length - 12);
  const place = venue ? ` · ${venue}` : "";

  if (day.cancelledAt) {
    return {
      badge: "Отменен",
      when,
      venue,
      count: day.cancelReason ?? "Мачът няма да се играе.",
      title: `Отменен мач · ${when}`,
      description: day.cancelReason ? `Отменен: ${day.cancelReason}` : "Мачът няма да се играе.",
      tone: "cancelled",
    };
  }
  if (day.lockedAt) {
    const result =
      day.winner === null
        ? null
        : (day.winner === "draw" ? "Равен" : `Спечели Отбор ${day.winner === "a" ? "А" : "Б"}`) +
          (day.scoreA !== null && day.scoreB !== null ? ` · ${day.scoreA}:${day.scoreB}` : "");
    return {
      badge: result ? "Резултат" : "Отборите са готови",
      when,
      venue,
      count: result ?? "Виж кой в кой отбор е",
      title: `${result ? "Резултат" : "Отбори"} · ${when}`,
      description: `${result ?? "Отборите са заключени. Виж кой в кой отбор е."}${place}`,
      tone: "locked",
    };
  }
  if (day.proposals.length > 0) {
    return {
      badge: "Гласувай за отбори",
      when,
      venue,
      count: "3 варианта · гласуват дванайсетимата",
      title: `Гласувай за отбори · ${when}`,
      description: `Три варианта за отбори. Гласувай за най-честния.${place}`,
      tone: "full",
    };
  }
  const full = n >= 12;
  return {
    badge: full ? "Пълен" : "Нов мач",
    when,
    venue,
    count: full ? `12/12 записани${reserves ? ` · ${reserves} резерви` : ""}` : `${n}/12 записани`,
    title: `⚽ Нов мач · ${when}`,
    description: full
      ? `Пълен: 12/12${reserves ? `, ${reserves} резерви` : ""}. Можеш да се запишеш като резерва.${place}`
      : `Записани ${n}/12, трябват още ${12 - n}. Запиши се!${place}`,
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
  const origin = typeof window === "undefined" ? SITE : window.location.origin;
  return `${origin}/match/${day.id}?v=${previewVersion(day)}`;
}
