import { useQuery } from "@tanstack/react-query";
import {
  CloudDrizzleIcon,
  CloudFogIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudMoonIcon,
  CloudRainIcon,
  CloudSnowIcon,
  CloudSunIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type Coords,
  GAME_SECONDS,
  type Nowcast,
  NOWCAST_SECONDS,
  parseCoords,
  SOFIA,
  type Weather,
  weatherQuery,
} from "@/lib/weather";
import { getCoords, getNowcast } from "@/server/functions";
import type { MatchdayView } from "@/server/repo";

/** Where the venue is: read off its map link, or — for a short link — asked of the server. */
function useCoords(mapUrl: string | null | undefined): { coords: Coords; ready: boolean } {
  const direct = parseCoords(mapUrl);
  const { data, isPending } = useQuery({
    queryKey: ["coords", mapUrl],
    queryFn: () => getCoords({ data: { mapUrl: mapUrl! } }),
    enabled: !!mapUrl && !direct && URL.canParse(mapUrl),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const asking = !!mapUrl && !direct && URL.canParse(mapUrl) && isPending;
  return { coords: direct ?? data ?? SOFIA, ready: !asking };
}

/** The forecast for a kick-off at a venue, once the browser has fetched it. */
export function useWeatherAt(startsAt: string | null, mapUrl: string | null | undefined): Weather | null {
  const { coords, ready } = useCoords(mapUrl);
  const { data } = useQuery({ ...weatherQuery(startsAt ?? "", coords), enabled: !!startsAt && ready });
  return data ?? null;
}

/** The forecast for this game's kick-off. */
export function useWeather(day: MatchdayView): Weather | null {
  return useWeatherAt(day.cancelledAt ? null : day.startsAt, day.venue?.mapUrl);
}

/** The radar's minute-by-minute view of the game, once kick-off is within its reach. */
export function useNowcast(day: MatchdayView): Nowcast | null {
  const starts = day.startsAt ? Date.parse(day.startsAt) / 1000 : null;
  const now = Date.now() / 1000;
  const { data } = useQuery({
    queryKey: ["nowcast", day.id],
    queryFn: () => getNowcast({ data: { id: day.id } }),
    enabled: starts !== null && !day.cancelledAt && starts - now < NOWCAST_SECONDS && now < starts + GAME_SECONDS,
    staleTime: 4 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  return data ?? null;
}

function iconOf(w: Weather) {
  switch (w.kind) {
    case "storm":
      return CloudLightningIcon;
    case "snow":
      return CloudSnowIcon;
    case "rain":
      return CloudRainIcon;
    case "drizzle":
      return CloudDrizzleIcon;
    case "fog":
      return CloudFogIcon;
    case "cloudy":
      return CloudIcon;
    case "partly":
      return w.night ? CloudMoonIcon : CloudSunIcon;
    default:
      return w.night ? MoonIcon : SunIcon;
  }
}

// One tile of streaks or flakes, repeated and slid down by its own height — a seamless loop.
const tile = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`,
  )}")`;

const streaks = (points: [number, number][], len: number) =>
  points
    .map(([x, y]) => `<line x1='${x}' y1='${y}' x2='${x}' y2='${y + len}' stroke='#fff' stroke-width='1' stroke-linecap='round'/>`)
    .join("");

const flakes = (points: [number, number, number][]) =>
  points.map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='#fff'/>`).join("");

type Layer = { image: string; w: number; h: number; seconds: number; opacity: number };

const RAIN: Layer[] = [
  { image: tile(90, 130, streaks([[12, 8], [41, 62], [67, 24], [80, 98], [28, 104]], 13)), w: 90, h: 130, seconds: 0.75, opacity: 0.42 },
  { image: tile(150, 210, streaks([[20, 30], [72, 140], [118, 66], [140, 180], [48, 96]], 18)), w: 150, h: 210, seconds: 1.05, opacity: 0.3 },
];
const DRIZZLE: Layer[] = [
  { image: tile(110, 160, streaks([[14, 12], [52, 90], [88, 40], [34, 132]], 8)), w: 110, h: 160, seconds: 1.5, opacity: 0.32 },
];
const SNOW: Layer[] = [
  { image: tile(110, 110, flakes([[14, 18, 1.6], [58, 70, 1.3], [92, 34, 1.8], [36, 96, 1.2]])), w: 110, h: 110, seconds: 8, opacity: 0.75 },
  { image: tile(180, 180, flakes([[30, 40, 2.2], [120, 150, 1.8], [150, 60, 2.4], [70, 110, 1.6]])), w: 180, h: 180, seconds: 12, opacity: 0.55 },
];

/**
 * A band of cloud: fractal noise turned into soft patches of one colour. It tiles
 * sideways, so sliding it by its own width loops without a seam.
 */
const CLOUD_SPAN = 1400;
function cloudTile(rgb: [number, number, number], seed: number, cover: number): string {
  const [r, g, b] = rgb.map((c) => (c / 255).toFixed(3));
  // Alpha comes from the noise: `cover` moves the cut-off, so higher means more sky hidden.
  const matrix = `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${2.6} 0 0 0 ${(cover - 1.55).toFixed(2)}`;
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${CLOUD_SPAN}' height='420' preserveAspectRatio='none'>` +
      `<filter id='c' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>` +
      `<feTurbulence type='fractalNoise' baseFrequency='0.0032 0.0105' numOctaves='5' seed='${seed}' stitchTiles='stitch'/>` +
      `<feColorMatrix values='${matrix}'/><feGaussianBlur stdDeviation='3'/></filter>` +
      `<rect width='100%' height='100%' filter='url(#c)'/></svg>`,
  )}")`;
}

const STARS = tile(
  260,
  190,
  [
    [18, 22, 1.2, 1], [74, 96, 0.8, 0.7], [121, 30, 1.5, 1], [163, 142, 0.9, 0.8], [209, 61, 1.1, 0.95],
    [241, 121, 0.8, 0.65], [47, 158, 1.2, 0.9], [98, 171, 0.7, 0.6], [188, 12, 0.8, 0.75], [139, 88, 0.7, 0.6],
  ]
    .map(([x, y, r, o]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='#fff' opacity='${o}'/>`)
    .join(""),
);

type Cloud = { image: string; seconds: number; opacity: number };
type Sky = {
  /** Top of the sky to the horizon, with whatever glows in it. */
  sky: string;
  clouds: Cloud[];
  stars?: boolean;
  flash?: boolean;
};

const cloud = (rgb: [number, number, number], seed: number, cover: number, seconds: number, opacity = 1): Cloud => ({
  image: cloudTile(rgb, seed, cover),
  seconds,
  opacity,
});

// Built once: the tiles are long strings.
const SKIES = {
  storm: {
    sky: "linear-gradient(180deg, #23223a 0%, #3d3a58 48%, #5d5876 100%)",
    clouds: [cloud([24, 23, 42], 7, 0.62, 150), cloud([150, 144, 178], 19, 0.3, 95, 0.55)],
    flash: true,
  },
  rain: {
    sky: "linear-gradient(180deg, #45425f 0%, #68637f 46%, #8d869f 100%)",
    clouds: [cloud([46, 43, 70], 4, 0.55, 160), cloud([196, 188, 214], 11, 0.34, 100, 0.6)],
  },
  drizzle: {
    sky: "linear-gradient(180deg, #56566f 0%, #7a7790 46%, #a09bb0 100%)",
    clouds: [cloud([66, 64, 90], 5, 0.45, 170, 0.9), cloud([214, 208, 226], 13, 0.36, 110, 0.6)],
  },
  snow: {
    sky: "linear-gradient(180deg, #5e6c84 0%, #8794aa 48%, #c3ccd9 100%)",
    clouds: [cloud([70, 82, 104], 9, 0.4, 180, 0.8), cloud([236, 240, 246], 21, 0.42, 120, 0.7)],
  },
  cloudy: {
    sky: "linear-gradient(180deg, #55606f 0%, #7c8795 48%, #a9b2bd 100%)",
    clouds: [cloud([56, 64, 78], 3, 0.5, 170, 0.85), cloud([226, 231, 238], 15, 0.44, 115, 0.75)],
  },
  fog: {
    sky: "linear-gradient(180deg, #7d8690 0%, #a0a8b0 50%, #c4c9cf 100%)",
    clouds: [cloud([235, 238, 241], 6, 0.6, 200, 0.75), cloud([235, 238, 241], 17, 0.5, 140, 0.6)],
  },
  clearDay: {
    sky:
      "radial-gradient(60% 120% at 86% 8%, rgb(255 246 208 / 0.95) 0%, rgb(255 226 150 / 0.45) 18%, transparent 55%), " +
      "linear-gradient(180deg, #1f67c4 0%, #4b96e2 50%, #9fcdf4 100%)",
    clouds: [cloud([255, 255, 255], 23, 0.12, 190, 0.7)],
  },
  partlyDay: {
    sky:
      "radial-gradient(55% 110% at 86% 8%, rgb(255 246 208 / 0.9) 0%, rgb(255 226 150 / 0.4) 18%, transparent 55%), " +
      "linear-gradient(180deg, #2a6fc6 0%, #5a9de2 50%, #a8d0f3 100%)",
    clouds: [cloud([255, 255, 255], 8, 0.4, 150, 0.9), cloud([232, 240, 250], 27, 0.26, 105, 0.6)],
  },
  clearNight: {
    sky:
      "radial-gradient(34% 70% at 85% 16%, rgb(214 222 255 / 0.5) 0%, rgb(150 165 235 / 0.16) 35%, transparent 70%), " +
      "linear-gradient(180deg, #070b24 0%, #141c48 50%, #2e3a74 100%)",
    clouds: [],
    stars: true,
  },
  partlyNight: {
    sky:
      "radial-gradient(34% 70% at 85% 16%, rgb(214 222 255 / 0.42) 0%, rgb(150 165 235 / 0.14) 35%, transparent 70%), " +
      "linear-gradient(180deg, #090d28 0%, #18204c 50%, #323d74 100%)",
    clouds: [cloud([118, 128, 184], 12, 0.34, 170, 0.55), cloud([58, 66, 116], 29, 0.3, 120, 0.6)],
    stars: true,
  },
} satisfies Record<string, Sky>;

function skyOf(w: Weather): Sky {
  if (w.kind === "clear") return w.night ? SKIES.clearNight : SKIES.clearDay;
  if (w.kind === "partly") return w.night ? SKIES.partlyNight : SKIES.partlyDay;
  return SKIES[w.kind];
}

/**
 * The weather at kick-off, as a piece of sky: how warm, how wet, and — in the last hours —
 * what the radar says about the game itself.
 */
export function WeatherCard({ weather: w, nowcast }: { weather: Weather; nowcast: Nowcast | null }) {
  const { t } = useI18n();
  const Icon = iconOf(w);
  const { sky, clouds, stars, flash }: Sky = skyOf(w);
  // The radar knows better than the model once it can see the game.
  const radarWet = nowcast?.rates.some((r) => r >= 0.1) ?? false;
  const layers = nowcast
    ? radarWet
      ? nowcast.snow
        ? SNOW
        : RAIN
      : null
    : w.kind === "snow"
      ? SNOW
      : w.kind === "rain" || w.kind === "storm"
        ? RAIN
        : w.kind === "drizzle"
          ? DRIZZLE
          : null;
  const fact = "font-semibold text-white tabular-nums";

  return (
    <section
      className="relative isolate overflow-hidden rounded-2xl px-6 py-6 text-white shadow-[0_10px_30px_-12px_rgb(20_24_50/0.45)] ring-1 ring-inset ring-white/15 [text-shadow:0_1px_2px_rgb(0_0_0/0.18)] sm:px-8"
      style={{ backgroundImage: sky }}
    >
      <div className="weather-fx -z-10" aria-hidden>
        {stars && <div className="weather-stars" style={{ backgroundImage: STARS }} />}
        {clouds.map((c) => (
          <div
            key={c.seconds}
            className="weather-clouds"
            style={{
              backgroundImage: c.image,
              opacity: c.opacity,
              animationDuration: `${c.seconds}s`,
              ["--weather-span" as string]: `${CLOUD_SPAN}px`,
            }}
          />
        ))}
        {flash && <div className="weather-flash" />}
        <div className="weather-shade" />
        {layers?.map((l) => (
          <div
            key={l.seconds}
            className={cn("weather-layer", layers !== SNOW && "weather-slant")}
            style={{
              backgroundImage: l.image,
              backgroundSize: `${l.w}px ${l.h}px`,
              opacity: l.opacity,
              animationDuration: `${l.seconds}s`,
              ["--weather-drop" as string]: `${l.h}px`,
            }}
          />
        ))}
      </div>

      <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-white/70">{t.weather.hint}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className="text-[4.5rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">{w.temp}°</p>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-white/80">
            <span>
              {t.weather.feels} <span className={fact}>{w.feels}°</span>
            </span>
            <span>
              {t.weather.wind} <span className={fact}>{w.wind} {t.weather.kmh}</span>
            </span>
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-white/80">
            <span>
              {t.weather.chance} <span className={fact}>{w.chance}%</span>
            </span>
            <span className={fact}>
              {w.amount.toFixed(1)} {t.weather.mm}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-center">
          <Icon className="size-12" strokeWidth={1.6} aria-hidden />
          <p className="text-[16px] font-semibold">{t.weather.kind[w.kind]}</p>
        </div>
      </div>

      {nowcast && <Radar nowcast={nowcast} />}

      <p className="mt-5 text-[11px] text-white/55">
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="hover:text-white">
          Open-Meteo
        </a>
        {nowcast && (
          <>
            {" · "}
            <a href="https://rainbow.ai/" target="_blank" rel="noreferrer" className="hover:text-white">
              Rainbow.AI
            </a>
          </>
        )}
      </p>
    </section>
  );
}

/** The game, minute by minute, as the radar sees it: a bar per minute and one sentence. */
function Radar({ nowcast }: { nowcast: Nowcast }) {
  const { t } = useI18n();
  const wet = nowcast.rates.filter((r) => r >= 0.1).length;
  const max = Math.max(0, ...nowcast.rates);
  return (
    <div className="mt-5 border-t border-white/20 pt-4">
      <p className="text-[13.5px] text-white/85">
        <span className="font-semibold text-white">{t.weather.radar}:</span>{" "}
        {wet === 0 ? t.weather.radarDry : t.weather.radarWet(wet, nowcast.rates.length, max.toFixed(1))}
      </p>
      <div className="mt-2.5 flex h-7 items-end gap-px" aria-hidden>
        {nowcast.rates.map((r, i) => (
          <div
            key={i}
            className="min-w-0 flex-1 rounded-t-[1px] bg-white/75"
            // 4 mm/h is a proper downpour for a kickabout; anything above just fills the bar.
            style={{ height: `${Math.max(6, Math.min(100, (r / 4) * 100))}%`, opacity: r >= 0.1 ? 1 : 0.3 }}
          />
        ))}
      </div>
    </div>
  );
}
