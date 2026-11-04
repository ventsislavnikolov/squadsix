// A blended forecast as `weatherQuery` returns it, for tests that show the weather card.
import type { Weather } from "@/lib/weather";

export function weather(extra: Partial<Weather> = {}): Weather {
  return {
    amount: 0,
    before: { mm: 0.4, pitch: "dry" },
    feels: 17,
    kind: "clear",
    models: 2,
    night: false,
    runs: [
      { amount: 0, kind: "clear", model: "ecmwf_ifs025", temp: 18.2 },
      { amount: 0.2, kind: "drizzle", model: "icon_seamless", temp: 17.6 },
    ],
    temp: 18,
    wetModels: 0,
    wind: 12,
    ...extra,
  };
}
