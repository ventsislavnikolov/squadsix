import { describe, expect, it } from "vitest";
import { blend, kindOf, MODELS, parseCoords, sofiaInstant, strengthOf } from "./weather";

describe("parseCoords", () => {
  it("prefers the pin over the camera in a full place link", () => {
    const url =
      "https://www.google.com/maps/place/X/@42.6574373,23.3510685,17z/data=!3m1!4b1!8m2!3d42.6580001!4d23.3520002!16s";
    expect(parseCoords(url)).toEqual({ lat: 42.6580001, lng: 23.3520002 });
  });

  it("reads the camera or a query when that is all there is", () => {
    expect(parseCoords("https://www.google.com/maps/@42.65,23.35,15z")).toEqual({ lat: 42.65, lng: 23.35 });
    expect(parseCoords("https://maps.google.com/?q=42.65,23.35")).toEqual({ lat: 42.65, lng: 23.35 });
  });

  it("gives up on a short link, which has none", () => {
    expect(parseCoords("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(parseCoords(null)).toBeNull();
  });
});

describe("sofiaInstant", () => {
  it("reads the form's date and time on Sofia's clock, summer and winter", () => {
    expect(sofiaInstant("2026-10-13", "20:00")).toBe("2026-10-13T17:00:00.000Z");
    expect(sofiaInstant("2026-12-01", "20:00")).toBe("2026-12-01T18:00:00.000Z");
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

describe("blend", () => {
  /** One hour as Open-Meteo returns it, a column per model. */
  const hour = (runs: Record<string, { temp: number; mm: number; code: number } | null>) =>
    Object.fromEntries(
      Object.entries(runs).flatMap(([m, r]) => [
        [`temperature_2m_${m}`, [r?.temp ?? null]],
        [`apparent_temperature_${m}`, [r ? r.temp - 2 : null]],
        [`precipitation_${m}`, [r?.mm ?? null]],
        [`weather_code_${m}`, [r?.code ?? null]],
        [`wind_speed_10m_${m}`, [r ? 10 : null]],
        [`is_day_${m}`, [r ? 0 : null]],
      ]),
    );
  const [a, b, c, d, e, f] = MODELS;

  it("averages the numbers and counts who expects rain", () => {
    const w = blend(
      hour({
        [a]: { temp: 9.4, mm: 1.2, code: 55 },
        [b]: { temp: 8.9, mm: 1.1, code: 61 },
        [c]: { temp: 7.8, mm: 1.6, code: 61 },
        [d]: { temp: 8.2, mm: 1.5, code: 61 },
        [e]: { temp: 9.4, mm: 1.7, code: 61 },
        [f]: { temp: 8.1, mm: 1.5, code: 61 },
      }),
    )!;
    expect(w).toMatchObject({ kind: "rain", temp: 9, feels: 7, wind: 10, wetModels: 6, models: 6, night: true });
    expect(w.amount).toBe(1.5);
  });

  it("lets the dry majority pick the sky, and one wet model not flood the total", () => {
    const w = blend(
      hour({
        [a]: { temp: 15, mm: 0, code: 3 },
        [b]: { temp: 15, mm: 0, code: 3 },
        [c]: { temp: 15, mm: 0, code: 2 },
        [d]: { temp: 15, mm: 6, code: 63 },
      }),
    )!;
    expect(w).toMatchObject({ kind: "cloudy", wetModels: 1, models: 4, amount: 0 });
  });

  it("gives an even split to rain", () => {
    const w = blend(hour({ [a]: { temp: 12, mm: 0, code: 3 }, [b]: { temp: 12, mm: 0.4, code: 61 } }))!;
    expect(w).toMatchObject({ kind: "rain", wetModels: 1, models: 2 });
  });

  it("keeps each model's own answer", () => {
    const w = blend(hour({ [a]: { temp: 9.4, mm: 1.2, code: 55 }, [b]: { temp: 8.9, mm: 1.1, code: 61 } }))!;
    expect(w.runs).toEqual([
      { model: a, kind: "drizzle", temp: 9.4, amount: 1.2 },
      { model: b, kind: "rain", temp: 8.9, amount: 1.1 },
    ]);
  });

  /** Kick-off after `before` hours of the given rain, as two models report it. */
  const after = (before: number[]) => {
    const column = (name: string, fill: number) => ({
      [`${name}_${a}`]: [...before.map(() => fill), fill],
      [`${name}_${b}`]: [...before.map(() => fill), fill],
    });
    return blend({
      ...column("temperature_2m", 10),
      ...column("weather_code", 3),
      ...column("is_day", 1),
      [`precipitation_${a}`]: [...before, 0],
      [`precipitation_${b}`]: [...before, 0],
    })!;
  };

  it("adds up the rain before kick-off and reads the pitch from it", () => {
    expect(after([]).before).toEqual({ mm: 0, pitch: "dry" });
    // A steady 1 mm/h all day: 24 mm, the last six hours of it still lying there.
    expect(after(Array(24).fill(1)).before).toEqual({ mm: 24, pitch: "soaked" });
    // A shower this morning has mostly drained by the evening.
    expect(after([4, ...Array(23).fill(0)]).before).toEqual({ mm: 4, pitch: "damp" });
    // The same shower an hour before the game has not.
    expect(after([...Array(23).fill(0), 4]).before).toEqual({ mm: 4, pitch: "wet" });
  });

  it("skips models that don't reach that far ahead", () => {
    const w = blend(hour({ [a]: { temp: 10, mm: 0, code: 0 }, [b]: null, [c]: null }))!;
    expect(w).toMatchObject({ kind: "clear", temp: 10, models: 1, wetModels: 0 });
    expect(blend(hour({ [a]: null }))).toBeNull();
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
