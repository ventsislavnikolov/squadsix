// The forecast for kick-off, from Open-Meteo: free, no key, and the browser may call it
// directly — so the page never waits on it and the server never pays for it. In the last
// hours before the game a radar nowcast (Rainbow.AI, through the server) sharpens it.

import { queryOptions } from "@tanstack/react-query";

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export type Weather = {
  kind: WeatherKind;
  /** °C, rounded. */
  temp: number;
  /** Chance of rain or snow in that hour, 0–100. */
  chance: number;
  /** mm in that hour. */
  amount: number;
  /** °C as it feels, rounded. */
  feels: number;
  /** km/h, rounded. */
  wind: number;
  night: boolean;
};

/** A football hour: how long after kick-off the weather still matters. */
export const GAME_SECONDS = 3600;
/** The radar nowcast looks this far ahead. */
export const NOWCAST_SECONDS = 4 * 3600;

/** Radar nowcast for the game itself, minute by minute (see getNowcast). */
export type Nowcast = {
  /** Unix seconds of the first minute covered. */
  from: number;
  /** mm/h for each minute from there; shorter than the game if the nowcast doesn't reach its end yet. */
  rates: number[];
  snow: boolean;
};

export type Coords = { lat: number; lng: number };

/** Every pitch so far is in Sofia; a venue whose map link gives no coordinates gets the city's. */
export const SOFIA: Coords = { lat: 42.6977, lng: 23.3219 };

/** Open-Meteo looks 16 days ahead; once the game is over the forecast is no use. */
const HORIZON_MS = 15 * 24 * 3600_000;
const AFTER_MS = 2 * 3600_000;

/**
 * Coordinates out of a pasted Google Maps link, when it carries them. A short link
 * (maps.app.goo.gl) doesn't: the server follows those (see server/geo.ts).
 */
export function parseCoords(mapUrl: string | null | undefined): Coords | null {
  if (!mapUrl) return null;
  const m =
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(mapUrl) ??
    /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(mapUrl) ??
    /[?&](?:q|ll|query|destination)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/.exec(mapUrl);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

/**
 * Kick-off as an instant, from the form's "2026-10-13" and "20:00" on Sofia's clock.
 * Null while either field is half-typed.
 */
export function sofiaInstant(date: string, time: string): string | null {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) return null;
  // How far Sofia's clock runs ahead of UTC at about that moment.
  const shown = new Date(naive).toLocaleString("sv-SE", { timeZone: "Europe/Sofia" });
  const ahead = Date.parse(`${shown.replace(" ", "T")}Z`) - naive;
  return new Date(naive - ahead).toISOString();
}

/** WMO weather codes, folded into what the page can show. */
export function kindOf(code: number): WeatherKind {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code === 45 || code === 48) return "fog";
  if (code === 3) return "cloudy";
  if (code === 1 || code === 2) return "partly";
  return "clear";
}

/** "2026-10-13T20:00": the hour of kick-off as Sofia's clock shows it. */
function sofiaHour(iso: string): string {
  return `${new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Sofia" }).slice(0, 13).replace(" ", "T")}:00`;
}

export const weatherQuery = (startsAt: string, { lat, lng }: Coords) =>
  queryOptions({
    queryKey: ["weather", startsAt, lat, lng],
    queryFn: async (): Promise<Weather | null> => {
      const away = new Date(startsAt).getTime() - Date.now();
      if (away > HORIZON_MS || away < -AFTER_MS) return null;
      const hour = sofiaHour(startsAt);
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          "&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,is_day" +
          `&timezone=Europe%2FSofia&start_hour=${hour}&end_hour=${hour}`,
      );
      if (!res.ok) return null;
      const h = (await res.json()).hourly;
      if (typeof h?.weather_code?.[0] !== "number") return null;
      return {
        kind: kindOf(h.weather_code[0]),
        temp: Math.round(h.temperature_2m[0]),
        chance: h.precipitation_probability[0] ?? 0,
        amount: h.precipitation[0] ?? 0,
        feels: Math.round(h.apparent_temperature[0]),
        wind: Math.round(h.wind_speed_10m[0]),
        night: h.is_day[0] === 0,
      };
    },
    // The models run every few hours; no need to ask more often than this.
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: false,
  });
