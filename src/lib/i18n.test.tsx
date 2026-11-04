// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Lang } from "@/domain/names";
import type { Session } from "@/server/functions";
import { useI18n } from "./i18n";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

function i18n(lang: Lang, isAdmin = false) {
  const qc = new QueryClient();
  const session: Session = { crawler: false, isAdmin, lang, me: "" };
  qc.setQueryData(["session"], session);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useI18n(), { wrapper }).result.current;
}

const bg = i18n("bg");
const en = i18n("en", true);

/** Every phrase function in the dictionary, by its dotted path. */
function phrases(dict: object, prefix = ""): Map<string, unknown> {
  const found = new Map<string, unknown>();
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix + key;
    if (typeof value === "function") {
      found.set(path, value);
    } else if (typeof value === "object" && value !== null) {
      for (const [p, v] of phrases(value, `${path}.`)) {
        found.set(p, v);
      }
    }
  }
  return found;
}

/** Same keys, same kinds of values, all the way down. */
function shape(dict: object): unknown {
  return Object.fromEntries(
    Object.entries(dict).map(([key, value]) => [
      key,
      typeof value === "object" && value !== null ? shape(value) : typeof value,
    ])
  );
}

const KICKOFF = "2026-10-13T17:00:00.000Z"; // Tuesday 20:00 in Sofia

// One plausible call of every phrase function; a new one must be added here.
const SAMPLE_ARGS: Record<string, unknown[]> = {
  date: ["2026-10-13T12:00:00.000Z"],
  when: [KICKOFF],
  "weather.ofModels": [2, 6],
  "weather.blended": [6],
  "weather.showModels": [6],
  "weather.radarWet": [12, 60, "1.5"],
  "start.last": ["Tuesday"],
  "who.as": ["Ivo"],
  "who.confirm": ["Ivo"],
  "event.by": ["Ivo"],
  "event.shareText": [
    "Tuesday",
    "Arena",
    "1. Ivo",
    "13. Pav",
    "https://x.test",
  ],
  "signup.count": [7],
  "signup.addedBy": ["Ivo"],
  "signup.needMore": [5],
  "signup.guestsLater": ["Monday 20:00"],
  "pick.eyebrow": ["Tuesday"],
  "pick.regularsNote": [26],
  "pick.more": [3],
  "pick.sum": ["36.0", "18.0"],
  "match.eyebrow": ["Tuesday"],
  "match.againBody": [4],
  "match.lockBody": [2, 5],
  "match.fallbackError": ["timeout"],
  "match.votingAs": ["Ivo"],
  "match.option": [2],
  "match.votes": [3],
  "match.rationale": ["close", 80, 10, 40],
  "match.rationaleFallback": ["0.5"],
  "match.notVoted": ["Ivo, Pav"],
  "match.shareText": ["Tuesday", "Ivo, Pav", "Ani, Bo"],
  "trace.measure": [462, 10],
  "trace.judge": ["c1"],
  "trace.measureDetail": [10],
  "trace.measureRules": [2, 0],
  "history.won": ["Team A"],
  "history.signing": [7],
  "balls.title": ["Ivo"],
  "balls.since": ["Monday"],
  "admin.unratedCount": [3],
};

describe("dictionaries", () => {
  it("have the same keys in both languages", () => {
    expect(shape(en.t)).toEqual(shape(bg.t));
  });

  it("render every phrase in both languages, each its own words", () => {
    const bgPhrases = phrases(bg.t);
    const enPhrases = phrases(en.t);
    expect([...bgPhrases.keys()].sort()).toEqual(
      Object.keys(SAMPLE_ARGS).sort()
    );
    const untranslated: string[] = [];
    for (const [path, args] of Object.entries(SAMPLE_ARGS)) {
      const said = [bgPhrases, enPhrases].map((dict) => {
        const phrase = dict.get(path);
        assert(typeof phrase === "function", `${path} is not a phrase`);
        const text: unknown = phrase(...args);
        assert(typeof text === "string", `${path} did not give text`);
        return text;
      });
      for (const text of said) {
        expect(text, path).not.toMatch(BROKEN);
        expect(text.trim(), path).not.toBe("");
      }
      if (said[0] === said[1]) {
        untranslated.push(path);
      }
    }
    // Numbers and symbols only: nothing to translate.
    expect(untranslated).toEqual(["signup.count"]);
  });
});

const BROKEN = /undefined|NaN|\[object/u;

function assert(ok: boolean, message: string): asserts ok {
  if (!ok) {
    throw new Error(message);
  }
}

const EN_SHORT_DATE = /^Tue,? 13 October 2026$/u;
const BG_SHORT_DATE = /^вт, 13 октомври 2026/u;
const ONE_VOTE_EN = /^There is already 1 vote\./u;
const TWO_VOTES_EN = /^There are already 2 votes\./u;
const ONE_VOTE_BG = /^Вече има 1 глас\./u;
const STARTS_WITH_ONE = /^1 /u;
const ONE_BROKEN_EN = /1 broken/u;
const ONE_BROKEN_BG = /нарушени 1/u;

describe("dates and times", () => {
  it("shows kick-off on Sofia's clock, capitalised", () => {
    expect(bg.t.when(KICKOFF)).toBe("Вторник, 13 октомври · 20:00");
    expect(en.t.when(KICKOFF)).toBe("Tuesday 13 October · 20:00");
    expect(bg.t.when("2026-12-01T18:00:00.000Z")).toBe(
      "Вторник, 1 декември · 20:00"
    );
  });

  it("writes a day long, or short with the year", () => {
    const noon = "2026-10-13T12:00:00.000Z";
    expect(en.t.date(noon)).toBe("Tuesday 13 October");
    // ICU versions differ on the comma after a short weekday.
    expect(en.t.date(noon, "short")).toMatch(EN_SHORT_DATE);
    expect(bg.t.date(noon)).toBe("вторник, 13 октомври");
    expect(bg.t.date(noon, "short")).toMatch(BG_SHORT_DATE);
  });
});

describe("counts", () => {
  it("say one and many properly", () => {
    expect([bg.t.match.votes(1), bg.t.match.votes(2)]).toEqual([
      "1 глас",
      "2 гласа",
    ]);
    expect([en.t.match.votes(1), en.t.match.votes(2)]).toEqual([
      "1 vote",
      "2 votes",
    ]);
    expect(en.t.match.againBody(1)).toMatch(ONE_VOTE_EN);
    expect(en.t.match.againBody(2)).toMatch(TWO_VOTES_EN);
    expect(bg.t.match.againBody(1)).toMatch(ONE_VOTE_BG);
    expect(en.t.match.lockBody(1, 1)).toBe(
      "Voting stops. Option 1 wins with 1 vote."
    );
    expect([bg.t.pick.regularsNote(1), en.t.pick.regularsNote(1)]).toEqual([
      "1 човек в списъка.",
      "1 person on the list.",
    ]);
    expect([bg.t.admin.unratedCount(1), en.t.admin.unratedCount(1)]).toEqual([
      "1 човек е без оценка и се смятат за 2.5.",
      expect.stringMatching(STARTS_WITH_ONE),
    ]);
    expect(en.t.admin.unratedCount(2)).not.toBe(en.t.admin.unratedCount(1));
  });

  it("name one forecast model or several", () => {
    expect([bg.t.weather.blended(1), bg.t.weather.blended(3)]).toEqual([
      "средно от 1 модел",
      "средно от 3 модела",
    ]);
    expect([en.t.weather.blended(1), en.t.weather.blended(3)]).toEqual([
      "average of 1 model",
      "average of 3 models",
    ]);
    expect([bg.t.weather.showModels(1), bg.t.weather.showModels(6)]).toEqual([
      "Виж модела поотделно",
      "Виж 6-те модела поотделно",
    ]);
    expect([en.t.weather.showModels(1), en.t.weather.showModels(6)]).toEqual([
      "See the model on its own",
      "See the 6 models one by one",
    ]);
  });
});

describe("phrases with a choice in them", () => {
  it("says „във“ before a name starting with В or Ф", () => {
    expect(bg.t.balls.title("Ваня")).toBe("Топките са във Ваня.");
    expect(bg.t.balls.title("Филип")).toBe("Топките са във Филип.");
    expect(bg.t.balls.title("Иво")).toBe("Топките са в Иво.");
    expect(en.t.balls.title("Ivo")).toBe("Ivo has the balls.");
  });

  it("says whether today's rules all hold", () => {
    expect(en.t.trace.measureRules(2, 0)).toBe(
      "Rules binding today's 12: 2. All kept."
    );
    expect(en.t.trace.measureRules(3, 1)).toMatch(ONE_BROKEN_EN);
    expect(bg.t.trace.measureRules(3, 1)).toMatch(ONE_BROKEN_BG);
  });

  it("leaves out the venue and reserves of an announcement when there are none", () => {
    expect(en.t.event.shareText("Tue", "", "1. Ivo", "", "https://x")).toBe(
      "Tue\n\n1. Ivo\n\nSign up: https://x"
    );
    expect(
      en.t.event.shareText("Tue", "Arena", "1. Ivo", "13. Pav", "https://x")
    ).toBe("Tue\nArena\n\n1. Ivo\n\nReserves:\n13. Pav\n\nSign up: https://x");
    expect(bg.t.event.shareText("Вт", "", "1. Иво", "", "https://x")).toBe(
      "Вт\n\n1. Иво\n\nЗаписвай се: https://x"
    );
    expect(
      bg.t.event.shareText("Вт", "Арена", "1. Иво", "13. Пав", "https://x")
    ).toContain("Арена\n\n1. Иво\n\nРезерви:\n13. Пав");
  });
});

describe("useI18n", () => {
  it("passes on the language and whether the admin is looking", () => {
    expect([bg.lang, bg.isAdmin]).toEqual(["bg", false]);
    expect([en.lang, en.isAdmin]).toEqual(["en", true]);
  });

  it("shows a short name in the page's language", () => {
    const ivo = { bg: "Иво", en: "Ivo" };
    expect([bg.name(ivo), en.name(ivo)]).toEqual(["Иво", "Ivo"]);
    expect(bg.name(undefined)).toBe("?");
  });

  it("words a server refusal, and anything else as a generic failure", () => {
    expect(en.error(new Error("locked"))).toBe(en.t.errors.locked);
    expect(bg.error(new Error("rule-limit"))).toBe(bg.t.errors["rule-limit"]);
    expect(en.error(new Error("socket hang up"))).toBe(en.t.errors.generic);
    expect(en.error("locked")).toBe(en.t.errors.generic);
  });
});
