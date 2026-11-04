// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOFIA, type Weather } from "@/lib/weather";
import type { MatchdayView } from "@/server/repo";
import { renderComponent } from "../../test/render-component";
import { getCoords, getNowcast } from "../../test/server-functions";
import { weather } from "../../test/weather-fixture";
import { useNowcast, useWeather, useWeatherAt, WeatherCard } from "./weather";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const AVERAGE_OF_2_MODELS = /average of 2 models/u;
const AVERAGE_OF_1_MODEL = /average of 1 model$/u;

const HINT = "Forecast for kick-off";

function renderCard(
  w: Weather,
  nowcast: Parameters<typeof WeatherCard>[0]["nowcast"] = null
) {
  return renderComponent(<WeatherCard nowcast={nowcast} weather={w} />);
}

describe("WeatherCard", () => {
  it("shows kick-off temperature, wind, rain vote and the pitch", async () => {
    renderCard(
      weather({ amount: 0.3, before: { mm: 3.2, pitch: "wet" }, wetModels: 1 })
    );
    expect(await screen.findByText(HINT)).toBeTruthy();
    expect(screen.getByText("18°")).toBeTruthy();
    expect(screen.getByText("17°")).toBeTruthy();
    expect(screen.getByText("12 km/h")).toBeTruthy();
    expect(screen.getByText("1 of 2 models")).toBeTruthy();
    expect(screen.getByText("0.3 mm/h")).toBeTruthy();
    expect(screen.getByText("3.2 mm")).toBeTruthy();
    expect(screen.getByText("wet")).toBeTruthy();
    expect(screen.getByText("Clear", { selector: "p" })).toBeTruthy();
    expect(screen.getByText(AVERAGE_OF_2_MODELS)).toBeTruthy();
    expect(screen.queryByText("Rainbow.AI")).toBeNull();
  });

  it("lists each model on its own", async () => {
    renderCard(weather());
    expect(await screen.findByText("See the 2 models one by one")).toBeTruthy();
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("ECMWF");
    expect(rows[0]?.textContent).toContain("Europe");
    expect(rows[0]?.textContent).toContain("18.2°");
    expect(rows[1]?.textContent).toContain("ICON");
    expect(rows[1]?.textContent).toContain("Drizzle");
  });

  it("says how hard it rains or snows, not just that it does", async () => {
    renderCard(
      weather({
        amount: 3,
        kind: "rain",
        models: 1,
        runs: [{ amount: 8, kind: "snow", model: "gfs_seamless", temp: 0 }],
      })
    );
    expect(
      await screen.findByText("Moderate rain", { selector: "p" })
    ).toBeTruthy();
    expect(screen.getByText("Heavy snow")).toBeTruthy();
    expect(screen.getByText("See the model on its own")).toBeTruthy();
    expect(screen.getByText(AVERAGE_OF_1_MODEL)).toBeTruthy();
  });

  it.each([
    [
      { kind: "storm" },
      "Thunderstorm",
      { flash: true, layers: 2, stars: false },
    ],
    [
      { amount: 0.2, kind: "drizzle" },
      "Drizzle",
      { flash: false, layers: 1, stars: false },
    ],
    [
      { amount: 1, kind: "snow" },
      "Light snow",
      { flash: false, layers: 2, stars: false },
    ],
    [{ kind: "fog" }, "Fog", { flash: false, layers: 0, stars: false }],
    [{ kind: "cloudy" }, "Cloudy", { flash: false, layers: 0, stars: false }],
    [
      { kind: "partly" },
      "Partly cloudy",
      { flash: false, layers: 0, stars: false },
    ],
    [
      { kind: "partly", night: true },
      "Partly cloudy",
      { flash: false, layers: 0, stars: true },
    ],
    [
      { kind: "clear", night: true },
      "Clear",
      { flash: false, layers: 0, stars: true },
    ],
  ] as const)("paints the sky for %o", async (extra, label, sky) => {
    const { container } = renderCard(weather(extra));
    expect(await screen.findByText(label, { selector: "p" })).toBeTruthy();
    const fx = container.querySelector(".weather-fx");
    expect(fx?.querySelectorAll(".weather-layer")).toHaveLength(sky.layers);
    expect(Boolean(fx?.querySelector(".weather-flash"))).toBe(sky.flash);
    expect(Boolean(fx?.querySelector(".weather-stars"))).toBe(sky.stars);
  });

  it("slants rain but lets snow fall straight", async () => {
    const { container } = renderCard(weather({ amount: 2, kind: "rain" }));
    await screen.findByText(HINT);
    const layers = container.querySelectorAll(".weather-layer");
    expect(layers).toHaveLength(2);
    expect(layers[0]?.className).toContain("weather-slant");
  });

  it("trusts the radar over the models once it can see the game", async () => {
    const { container } = renderCard(weather({ amount: 2, kind: "rain" }), {
      from: 1_800_000_000,
      rates: [0, 0, 0.05],
      snow: false,
    });
    expect(await screen.findByText("dry for the whole game")).toBeTruthy();
    expect(container.querySelectorAll(".weather-layer")).toHaveLength(0);
    expect(screen.getByText("Rainbow.AI")).toBeTruthy();
  });

  it("draws the radar minute by minute when it rains", async () => {
    const { container } = renderCard(weather(), {
      from: 1_800_000_000,
      rates: [0, 0.5, 6],
      snow: false,
    });
    expect(
      await screen.findByText("rain in 2 of 3 min, up to 6.0 mm/h")
    ).toBeTruthy();
    const bars = [...container.querySelectorAll<HTMLElement>(".h-7 > div")].map(
      (bar) => [bar.style.height, bar.style.opacity]
    );
    expect(bars).toEqual([
      ["6%", "0.3"],
      ["12.5%", "1"],
      ["100%", "1"],
    ]);
    expect(container.querySelectorAll(".weather-slant")).toHaveLength(2);
  });

  it("shows snow when the radar says it snows", async () => {
    const { container } = renderCard(weather(), {
      from: 1_800_000_000,
      rates: [1],
      snow: true,
    });
    await screen.findByText(HINT);
    const layers = container.querySelectorAll(".weather-layer");
    expect(layers).toHaveLength(2);
    expect(layers[0]?.className).not.toContain("weather-slant");
  });
});

/* ----------------------------------------------------------------------- hooks -- */

const STARTS = "2026-11-05T18:00:00.000Z";

function day(extra: Partial<MatchdayView> = {}): MatchdayView {
  return {
    cancelReason: null,
    cancelledAt: null,
    changedAt: null,
    changes: null,
    createdBy: null,
    id: "m1",
    kind: "announced",
    lockedAt: null,
    lockedProposalId: null,
    note: null,
    playedOn: "2026-11-05",
    players: [],
    proposals: [],
    run: null,
    scoreA: null,
    scoreB: null,
    signups: [],
    squad: [],
    startsAt: STARTS,
    venue: null,
    votes: [],
    winner: null,
    ...extra,
  };
}

function ForecastProbe({ game }: { game: MatchdayView }) {
  const w = useWeather(game);
  const n = useNowcast(game);
  return (
    <p>
      {w ? `temp ${w.temp}` : "no forecast"} /{" "}
      {n ? `radar ${n.rates.length}` : "no radar"}
    </p>
  );
}

function AtProbe({ mapUrl }: { mapUrl: string | null }) {
  const w = useWeatherAt(STARTS, mapUrl);
  return <p>{w ? `temp ${w.temp}` : "no forecast"}</p>;
}

describe("weather hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 503 })))
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reads the forecast for the game's kick-off in Sofia", async () => {
    renderComponent(<ForecastProbe game={day()} />, {
      data: [[["weather", STARTS, SOFIA.lat, SOFIA.lng], weather({ temp: 7 })]],
    });
    expect(await screen.findByText("temp 7 / no radar")).toBeTruthy();
    expect(getNowcast).not.toHaveBeenCalled();
  });

  it("asks the radar in the last hours before kick-off", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(STARTS) - 3_600_000);
    getNowcast.mockResolvedValue({ from: 0, rates: [0, 1], snow: false });
    renderComponent(<ForecastProbe game={day()} />);
    expect(await screen.findByText("no forecast / radar 2")).toBeTruthy();
    expect(getNowcast).toHaveBeenCalledWith({ data: { id: "m1" } });
  });

  it("asks nothing for a cancelled game", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(STARTS) - 3_600_000);
    renderComponent(<ForecastProbe game={day({ cancelledAt: STARTS })} />);
    expect(await screen.findByText("no forecast / no radar")).toBeTruthy();
    expect(getNowcast).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks nothing for a game without a time", async () => {
    renderComponent(<ForecastProbe game={day({ startsAt: null })} />);
    expect(await screen.findByText("no forecast / no radar")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the venue's coordinates off its map link", async () => {
    renderComponent(
      <ForecastProbe
        game={day({
          venue: {
            id: "v",
            mapUrl: "https://www.google.com/maps/@42.1,23.2,15z",
            name: "Park",
          },
        })}
      />,
      { data: [[["weather", STARTS, 42.1, 23.2], weather({ temp: 3 })]] }
    );
    expect(await screen.findByText("temp 3 / no radar")).toBeTruthy();
    expect(getCoords).not.toHaveBeenCalled();
  });

  it("asks the server where a short map link points, then forecasts there", async () => {
    getCoords.mockResolvedValue({ lat: 41.5, lng: 22.5 });
    renderComponent(<AtProbe mapUrl="https://maps.app.goo.gl/xyz" />, {
      data: [[["weather", STARTS, 41.5, 22.5], weather({ temp: 11 })]],
    });
    expect(await screen.findByText("temp 11")).toBeTruthy();
    expect(getCoords).toHaveBeenCalledWith({
      data: { mapUrl: "https://maps.app.goo.gl/xyz" },
    });
  });

  it("falls back to Sofia for a link that is not a link", async () => {
    renderComponent(<AtProbe mapUrl="the park" />, {
      data: [[["weather", STARTS, SOFIA.lat, SOFIA.lng], weather({ temp: 5 })]],
    });
    expect(await screen.findByText("temp 5")).toBeTruthy();
    await waitFor(() => expect(getCoords).not.toHaveBeenCalled());
  });
});
