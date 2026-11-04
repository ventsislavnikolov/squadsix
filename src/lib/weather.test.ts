import { QueryClient } from "@tanstack/react-query";
import { afterEach, assert, describe, expect, it, vi } from "vitest";
import {
  blend,
  kindOf,
  MODELS,
  parseCoords,
  SOFIA,
  sofiaInstant,
  strengthOf,
  weatherQuery,
} from "./weather";

describe("parseCoords", () => {
  it("prefers the pin over the camera in a full place link", () => {
    const url =
      "https://www.google.com/maps/place/X/@42.6574373,23.3510685,17z/data=!3m1!4b1!8m2!3d42.6580001!4d23.3520002!16s";
    expect(parseCoords(url)).toEqual({ lat: 42.658_000_1, lng: 23.352_000_2 });
  });

  it("reads the camera or a query when that is all there is", () => {
    expect(parseCoords("https://www.google.com/maps/@42.65,23.35,15z")).toEqual(
      { lat: 42.65, lng: 23.35 }
    );
    expect(parseCoords("https://maps.google.com/?q=42.65,23.35")).toEqual({
      lat: 42.65,
      lng: 23.35,
    });
  });

  it("gives up on a short link, which has none", () => {
    expect(parseCoords("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(parseCoords(null)).toBeNull();
  });
});

describe("sofiaInstant", () => {
  it("reads the form's date and time on Sofia's clock, summer and winter", () => {
    expect(sofiaInstant("2026-10-13", "20:00")).toBe(
      "2026-10-13T17:00:00.000Z"
    );
    expect(sofiaInstant("2026-12-01", "20:00")).toBe(
      "2026-12-01T18:00:00.000Z"
    );
  });

  it("is null while a field is half-typed", () => {
    expect(sofiaInstant("", "20:00")).toBeNull();
    expect(sofiaInstant("2026-10-13", "")).toBeNull();
  });
});

describe("kindOf", () => {
  it("folds WMO codes into what the card can show", () => {
    expect(kindOf(0)).toBe("clear");
    expect(kindOf(2)).toBe("partly");
    expect(kindOf(3)).toBe("cloudy");
    expect(kindOf(48)).toBe("fog");
    expect(kindOf(53)).toBe("drizzle");
    expect(kindOf(61)).toBe("rain");
    expect(kindOf(81)).toBe("rain");
    expect(kindOf(73)).toBe("snow");
    expect(kindOf(86)).toBe("snow");
    expect(kindOf(96)).toBe("storm");
  });
});

/** blend()'s forecast, which these cases expect to exist. */
const blended = (hourly: Parameters<typeof blend>[0]) => {
  const w = blend(hourly);
  assert(w, "blend gave no forecast");
  return w;
};

describe("blend", () => {
  /** One hour as Open-Meteo returns it, a column per model. */
  const hour = (
    runs: Record<string, { temp: number; mm: number; code: number } | null>
  ) =>
    Object.fromEntries(
      Object.entries(runs).flatMap(([m, r]) => [
        [`temperature_2m_${m}`, [r?.temp ?? null]],
        [`apparent_temperature_${m}`, [r ? r.temp - 2 : null]],
        [`precipitation_${m}`, [r?.mm ?? null]],
        [`weather_code_${m}`, [r?.code ?? null]],
        [`wind_speed_10m_${m}`, [r ? 10 : null]],
        [`is_day_${m}`, [r ? 0 : null]],
      ])
    );
  const [a, b, c, d, e, f] = MODELS;

  it("averages the numbers and counts who expects rain", () => {
    const w = blended(
      hour({
        [a]: { temp: 9.4, mm: 1.2, code: 55 },
        [b]: { temp: 8.9, mm: 1.1, code: 61 },
        [c]: { temp: 7.8, mm: 1.6, code: 61 },
        [d]: { temp: 8.2, mm: 1.5, code: 61 },
        [e]: { temp: 9.4, mm: 1.7, code: 61 },
        [f]: { temp: 8.1, mm: 1.5, code: 61 },
      })
    );
    expect(w).toMatchObject({
      kind: "rain",
      temp: 9,
      feels: 7,
      wind: 10,
      wetModels: 6,
      models: 6,
      night: true,
    });
    expect(w.amount).toBe(1.5);
  });

  it("lets the dry majority pick the sky, and one wet model not flood the total", () => {
    const w = blended(
      hour({
        [a]: { temp: 15, mm: 0, code: 3 },
        [b]: { temp: 15, mm: 0, code: 3 },
        [c]: { temp: 15, mm: 0, code: 2 },
        [d]: { temp: 15, mm: 6, code: 63 },
      })
    );
    expect(w).toMatchObject({
      kind: "cloudy",
      wetModels: 1,
      models: 4,
      amount: 0,
    });
  });

  it("gives an even split to rain", () => {
    const w = blended(
      hour({
        [a]: { temp: 12, mm: 0, code: 3 },
        [b]: { temp: 12, mm: 0.4, code: 61 },
      })
    );
    expect(w).toMatchObject({ kind: "rain", wetModels: 1, models: 2 });
  });

  it("keeps each model's own answer", () => {
    const w = blended(
      hour({
        [a]: { temp: 9.4, mm: 1.2, code: 55 },
        [b]: { temp: 8.9, mm: 1.1, code: 61 },
      })
    );
    expect(w.runs).toEqual([
      { model: a, kind: "drizzle", temp: 9.4, amount: 1.2 },
      { model: b, kind: "rain", temp: 8.9, amount: 1.1 },
    ]);
  });

  /** Kick-off after `before` hours of the given rain, as two models report it. */
  const kickoffAfter = (before: number[]) => {
    const column = (name: string, fill: number) => ({
      [`${name}_${a}`]: [...before.map(() => fill), fill],
      [`${name}_${b}`]: [...before.map(() => fill), fill],
    });
    return blended({
      ...column("temperature_2m", 10),
      ...column("weather_code", 3),
      ...column("is_day", 1),
      [`precipitation_${a}`]: [...before, 0],
      [`precipitation_${b}`]: [...before, 0],
    });
  };

  it("adds up the rain before kick-off and reads the pitch from it", () => {
    expect(kickoffAfter([]).before).toEqual({ mm: 0, pitch: "dry" });
    // A steady 1 mm/h all day: 24 mm, the last six hours of it still lying there.
    expect(kickoffAfter(new Array(24).fill(1)).before).toEqual({
      mm: 24,
      pitch: "soaked",
    });
    // A shower this morning has mostly drained by the evening.
    expect(kickoffAfter([4, ...new Array(23).fill(0)]).before).toEqual({
      mm: 4,
      pitch: "damp",
    });
    // The same shower an hour before the game has not.
    expect(kickoffAfter([...new Array(23).fill(0), 4]).before).toEqual({
      mm: 4,
      pitch: "wet",
    });
  });

  it("skips models that don't reach that far ahead", () => {
    const w = blended(
      hour({ [a]: { temp: 10, mm: 0, code: 0 }, [b]: null, [c]: null })
    );
    expect(w).toMatchObject({
      kind: "clear",
      temp: 10,
      models: 1,
      wetModels: 0,
    });
    expect(blend(hour({ [a]: null }))).toBeNull();
    expect(blend({})).toBeNull();
  });

  it("counts measured rain as rain even when the sky says cloudy", () => {
    const w = blended(
      hour({
        [a]: { temp: 12, mm: 0.5, code: 3 },
        [b]: { temp: 12, mm: 0, code: 3 },
      })
    );
    expect(w).toMatchObject({ kind: "rain", wetModels: 1 });
  });

  it("skips the hours no model reported before kick-off", () => {
    const w = blended({
      [`temperature_2m_${a}`]: [null, 10, 10],
      [`weather_code_${a}`]: [null, 3, 3],
      [`precipitation_${a}`]: [null, 0.5, 0],
    });
    expect(w.before).toEqual({ mm: 0.5, pitch: "damp" });
    expect(w).toMatchObject({ feels: 10, wind: 0, night: false });
  });
});

describe("strengthOf", () => {
  it("names mm an hour the way forecasters do", () => {
    expect(strengthOf(0.2)).toBe("faint");
    expect(strengthOf(1.5)).toBe("light");
    expect(strengthOf(4)).toBe("moderate");
    expect(strengthOf(9)).toBe("heavy");
  });
});

describe("weatherQuery", () => {
  const kickoff = "2026-10-13T17:00:00.000Z"; // 20:00 in Sofia
  const fetchMock = vi.fn<typeof fetch>();

  const run = async (now: string) => {
    vi.useFakeTimers({ now: new Date(now), toFake: ["Date"] });
    vi.stubGlobal("fetch", fetchMock);
    return await new QueryClient().fetchQuery(weatherQuery(kickoff, SOFIA));
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("asks every model for the day before and the hour of kick-off, on Sofia's clock", async () => {
    const [model] = MODELS;
    fetchMock.mockResolvedValue(
      Response.json({
        hourly: {
          [`temperature_2m_${model}`]: [11, 12],
          [`weather_code_${model}`]: [0, 1],
        },
      })
    );
    const w = await run("2026-10-12T09:00:00.000Z");
    expect(w).toMatchObject({ kind: "partly", temp: 12, models: 1 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("start_hour")).toBe("2026-10-12T20:00");
    expect(url.searchParams.get("end_hour")).toBe("2026-10-13T20:00");
    expect(url.searchParams.get("models")).toBe(MODELS.join(","));
    expect(url.searchParams.get("latitude")).toBe(String(SOFIA.lat));
  });

  it("does not ask beyond the forecast horizon or long after the game", async () => {
    expect(await run("2026-09-20T09:00:00.000Z")).toBeNull();
    expect(await run("2026-10-13T20:00:00.000Z")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows nothing when the forecast service fails or has no hours", async () => {
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }));
    expect(await run("2026-10-13T12:00:00.000Z")).toBeNull();
    fetchMock.mockResolvedValueOnce(Response.json({}));
    expect(await run("2026-10-13T12:00:00.000Z")).toBeNull();
  });
});
