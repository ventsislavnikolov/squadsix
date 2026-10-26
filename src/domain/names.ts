// How a person is called on screen.
//
// Everyone has a name in both scripts; the page shows the one for its language. On screen
// it is the first name only — phones at the pitch have no room for "Асен Светославов
// Красимиров" — plus the surname's initial when two people share a first name
// ("Ивайло В.", "Ивайло П."). The initial is added to *both* people, automatically, so
// nobody has to remember to rename the first Ivaylo when the second one joins.

export type Lang = "bg" | "en";

export type PersonName = {
  firstBg: string;
  lastBg: string;
  firstEn: string;
  lastEn: string;
};

export type ShortName = { bg: string; en: string };

/** Short display names for a whole roster, deduplicated against each other. */
export function shortNames<T extends PersonName & { id: string }>(
  people: T[],
): Map<string, ShortName> {
  const key = (p: PersonName) => [p.firstBg.toLocaleLowerCase("bg"), p.firstEn.toLowerCase()];
  const counts = new Map<string, number>();
  for (const p of people) {
    // A clash in either script counts: "Ivaylo" and "Ивайло" are the same name.
    for (const k of new Set(key(p))) counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const out = new Map<string, ShortName>();
  for (const p of people) {
    const clash = key(p).some((k) => (counts.get(k) ?? 0) > 1);
    out.set(p.id, {
      bg: clash ? withInitial(p.firstBg, p.lastBg) : p.firstBg,
      en: clash ? withInitial(p.firstEn, p.lastEn) : p.firstEn,
    });
  }

  // Two "Ивайло П." left? Fall back to the full surname for those.
  for (const lang of ["bg", "en"] as const) {
    const seen = new Map<string, string[]>();
    for (const [id, n] of out) seen.set(n[lang], [...(seen.get(n[lang]) ?? []), id]);
    for (const ids of seen.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        const p = people.find((x) => x.id === id)!;
        const full = lang === "bg" ? `${p.firstBg} ${p.lastBg}` : `${p.firstEn} ${p.lastEn}`;
        out.set(id, { ...out.get(id)!, [lang]: full.trim() });
      }
    }
  }
  return out;
}

function withInitial(first: string, last: string): string {
  const initial = last.trim().charAt(0);
  return initial ? `${first} ${initial.toLocaleUpperCase()}.` : first;
}

/* --------------------------------------------------------------- transliteration -- */

// Bulgarian → Latin: the official Streamlined System (Transliteration Act, 2009).
const BG_TO_EN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

// Latin → Bulgarian is a guess, not a standard: longest match first. Good enough for a
// guest's name, and the admin can correct it.
const EN_TO_BG: [string, string][] = [
  ["sht", "щ"], ["zh", "ж"], ["ts", "ц"], ["ch", "ч"], ["sh", "ш"], ["yu", "ю"],
  ["ya", "я"], ["dj", "дж"], ["ph", "ф"], ["th", "т"], ["ck", "к"],
  ["a", "а"], ["b", "б"], ["c", "к"], ["d", "д"], ["e", "е"], ["f", "ф"], ["g", "г"],
  ["h", "х"], ["i", "и"], ["j", "дж"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"],
  ["o", "о"], ["p", "п"], ["q", "к"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"],
  ["v", "в"], ["w", "у"], ["x", "кс"], ["y", "й"], ["z", "з"],
];

export function isCyrillic(text: string): boolean {
  return /[Ѐ-ӿ]/.test(text);
}

export function bgToEn(text: string): string {
  const lower = text.toLocaleLowerCase("bg");
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = lower[i]!;
    // "-ия" at the end of a word is written "-ia" (София → Sofia).
    if (ch === "и" && lower[i + 1] === "я" && !/[\p{L}]/u.test(lower[i + 2] ?? "")) {
      out += matchCase(text[i]!, "i") + matchCase(text[i + 1]!, "a");
      i++;
      continue;
    }
    const mapped = BG_TO_EN[ch];
    out += mapped === undefined ? text[i] : matchCase(text[i]!, mapped);
  }
  return out;
}

export function enToBg(text: string): string {
  const lower = text.toLowerCase();
  let out = "";
  let i = 0;
  while (i < text.length) {
    const hit = EN_TO_BG.find(([lat]) => lower.startsWith(lat, i));
    if (hit) {
      out += matchCase(text[i]!, hit[1]);
      i += hit[0].length;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

/** A guest's name typed once, in either script, becomes a name in both. */
export function nameFromInput(input: string): PersonName {
  const clean = input.trim().replace(/\s+/g, " ");
  const [first = "", ...rest] = clean.split(" ");
  const last = rest.join(" ");
  if (isCyrillic(clean)) {
    return { firstBg: first, lastBg: last, firstEn: bgToEn(first), lastEn: bgToEn(last) };
  }
  return { firstBg: enToBg(first), lastBg: enToBg(last), firstEn: first, lastEn: last };
}

/**
 * Which known guest a typed name means: the one with the same full name, or, when only a
 * first name was typed, the one guest with that first name. Typing "Велислав" for
 * "Велислав Кунев" must not make a second Велислав.
 */
export function findGuest<T extends PersonName>(guests: T[], typed: PersonName): T | undefined {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const full = guests.find((g) => same(g.firstEn, typed.firstEn) && same(g.lastEn, typed.lastEn));
  if (full || typed.lastEn) return full;
  const byFirst = guests.filter((g) => same(g.firstEn, typed.firstEn));
  return byFirst.length === 1 ? byFirst[0] : undefined;
}

function matchCase(source: string, target: string): string {
  const upper = source !== source.toLocaleLowerCase() && source === source.toLocaleUpperCase();
  return upper ? target.charAt(0).toLocaleUpperCase() + target.slice(1) : target;
}
