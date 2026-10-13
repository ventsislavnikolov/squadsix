// The forecast for kick-off, from Open-Meteo: free, no key, and the browser may call it
// directly — so the page never waits on it and the server never pays for it. We ask
// several national models at once and blend them (see `blend`). In the last
// hours before the game a radar nowcast (Rainbow.AI, through the server) sharpens it.

import { queryOptions } from "@tanstack/react-query";

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export type Weather = {
  kind: WeatherKind;
  /** °C, rounded. */
  temp: number;
  /** mm in that hour: the middle of what the models say. */
  amount: number;
  /** How many of the models expect rain or snow in that hour… */
  wetModels: number;
  /** …out of how many had an answer. */
  models: number;
  /** What each model said on its own, for whoever wants to look. */
  runs: ModelRun[];
  before: Before;
  /** °C as it feels, rounded. */
  feels: number;
  /** km/h, rounded. */
  wind: number;
  night: boolean;
};

export type Model = (typeof MODELS)[number];
export type ModelRun = { model: Model; kind: WeatherKind; temp: number; amount: number };

export type Pitch = "dry" | "damp" | "wet" | "soaked";
/** The day leading up to kick-off: how much fell, and what that leaves underfoot. */
export type Before = { mm: number; pitch: Pitch };

export type Strength = "faint" | "light" | "moderate" | "heavy";

/** How hard it comes down, in the words forecasters use for mm an hour. */
export function strengthOf(mmPerHour: number): Strength {
  if (mmPerHour < 0.5) return "faint";
  if (mmPerHour < 2.5) return "light";
  if (mmPerHour < 7.5) return "moderate";
  return "heavy";
}

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

/**
 * The forecast models we ask, each run by a different weather service. They disagree a
 * little, and their average is usually nearer the truth than any one of them.
 * (Open-Meteo also offers the Danish and Dutch models, but those stop short of Bulgaria
 * and would only echo ECMWF.)
 */
export const MODELS = [
  "ecmwf_ifs025", // Europe
  "icon_seamless", // Germany
  "gfs_seamless", // USA
  "meteofrance_seamless", // France
  "ukmo_seamless", // UK
  "gem_seamless", // Canada
] as const;

const BEFORE_HOURS = 24;

const WET: ReadonlySet<WeatherKind> = new Set(["drizzle", "rain", "snow", "storm"]);
/** Less than this in an hour doesn't wet the pitch. */
const WET_MM = 0.1;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
/** The value most models agree on; the earliest listed wins a tie. */
function commonest<T>(xs: T[]): T {
  const seen = new Map<T, number>();
  for (const x of xs) seen.set(x, (seen.get(x) ?? 0) + 1);
  return [...seen].sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * One forecast out of several models' answers for the same hour. Numbers are averaged
 * (rain by its median, which one wild model can't drag). Whether it rains is a vote, and
 * the sky shown is the commonest among the side that won — a tie goes to rain, since
 * that's the answer worth being warned about.
 */
export function blend(hourly: Record<string, (number | null)[] | undefined>): Weather | null {
  // The last hour asked for is kick-off; the ones before it are the day leading up to it.
  const last = Math.max(0, ...MODELS.map((m) => (hourly[`weather_code_${m}`]?.length ?? 1) - 1));
  const at = (name: string, model: string, hour = last) => hourly[`${name}_${model}`]?.[hour];
  const runs = MODELS.flatMap((m) => {
    const code = at("weather_code", m);
    const temp = at("temperature_2m", m);
    // A model that doesn't reach this far ahead answers with nulls.
    if (typeof code !== "number" || typeof temp !== "number") return [];
    const amount = at("precipitation", m) ?? 0;
    const kind = kindOf(code);
    return [
      {
        model: m,
        kind,
        temp,
        amount,
        feels: at("apparent_temperature", m) ?? temp,
        wind: at("wind_speed_10m", m) ?? 0,
        night: at("is_day", m) === 0,
        wet: WET.has(kind) || amount >= WET_MM,
      },
    ];
  });
  if (runs.length === 0) return null;

  const wet = runs.filter((r) => r.wet);
  const rains = wet.length * 2 >= runs.length;
  const side = rains ? wet : runs.filter((r) => !r.wet);
  const kinds = side.map((r) => r.kind);
  return {
    // Rain that a model measured but filed under "cloudy" still counts as rain.
    kind: rains ? commonest(kinds.map((k) => (WET.has(k) ? k : "rain"))) : commonest(kinds),
    temp: Math.round(mean(runs.map((r) => r.temp))),
    feels: Math.round(mean(runs.map((r) => r.feels))),
    wind: Math.round(mean(runs.map((r) => r.wind))),
    amount: median(runs.map((r) => r.amount)),
    wetModels: wet.length,
    models: runs.length,
    runs: runs.map(({ model, kind, temp, amount }) => ({ model, kind, temp, amount })),
    before: beforeOf((hour) => MODELS.map((m) => at("precipitation", m, hour)), last),
    night: runs[0]!.night,
  };
}

/** Rain this recent is still lying on the pitch; older rain has partly drained. */
const FRESH_HOURS = 6;
const DRAINED = 0.4;

function beforeOf(rainAt: (hour: number) => (number | null | undefined)[], kickoff: number): Before {
  let fresh = 0;
  let older = 0;
  for (let hour = 0; hour < kickoff; hour++) {
    const said = rainAt(hour).filter((mm): mm is number => typeof mm === "number");
    if (said.length === 0) continue;
    if (hour >= kickoff - FRESH_HOURS) fresh += median(said);
    else older += median(said);
  }
  const lying = fresh + older * DRAINED;
  return {
    mm: fresh + older,
    pitch: lying < 0.3 ? "dry" : lying < 2 ? "damp" : lying < 6 ? "wet" : "soaked",
  };
}

export const weatherQuery = (startsAt: string, { lat, lng }: Coords) =>
  queryOptions({
    queryKey: ["weather", startsAt, lat, lng],
    queryFn: async (): Promise<Weather | null> => {
      const away = new Date(startsAt).getTime() - Date.now();
      if (away > HORIZON_MS || away < -AFTER_MS) return null;
      const hour = sofiaHour(startsAt);
      // The day before as well: a pitch that has been rained on all day plays differently.
      const dayBefore = sofiaHour(new Date(new Date(startsAt).getTime() - BEFORE_HOURS * 3600_000).toISOString());
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          "&hourly=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day" +
          `&models=${MODELS.join(",")}` +
          `&timezone=Europe%2FSofia&start_hour=${dayBefore}&end_hour=${hour}`,
      );
      if (!res.ok) return null;
      return blend((await res.json()).hourly ?? {});
    },
    // The models run every few hours; no need to ask more often than this.
    staleTime: 15 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: false,
  });
