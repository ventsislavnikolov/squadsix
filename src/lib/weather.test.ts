import { describe, expect, it } from "vitest";
import { kindOf, parseCoords, sofiaInstant } from "./weather";

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
