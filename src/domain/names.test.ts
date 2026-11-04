import { describe, expect, it } from "vitest";
import { bgToEn, enToBg, findGuest, nameFromInput, shortNames } from "./names";

const p = (
  id: string,
  firstBg: string,
  lastBg: string,
  firstEn: string,
  lastEn: string
) => ({
  id,
  firstBg,
  lastBg,
  firstEn,
  lastEn,
});

describe("shortNames", () => {
  it("uses the first name, and adds the initial to everyone sharing it", () => {
    const names = shortNames([
      p("1", "Ивайло", "Вълчев", "Ivaylo", "Valchev"),
      p("2", "Ивайло", "Петков", "Ivaylo", "Petkov"),
      p("3", "Венцислав", "Николов", "Ventsislav", "Nikolov"),
    ]);
    expect(names.get("1")).toEqual({ bg: "Ивайло В.", en: "Ivaylo V." });
    expect(names.get("2")).toEqual({ bg: "Ивайло П.", en: "Ivaylo P." });
    expect(names.get("3")).toEqual({ bg: "Венцислав", en: "Ventsislav" });
  });

  it("treats a clash in either script as a clash", () => {
    const names = shortNames([
      p("1", "Тодор", "Петров", "Todd", "Petrov"),
      p("2", "Тодор", "Иванов", "Todor", "Ivanov"),
    ]);
    expect(names.get("1")?.en).toBe("Todd P.");
    expect(names.get("2")?.en).toBe("Todor I.");
  });

  it("falls back to the full surname when initials clash too", () => {
    const names = shortNames([
      p("1", "Иво", "Петров", "Ivo", "Petrov"),
      p("2", "Иво", "Павлов", "Ivo", "Pavlov"),
    ]);
    expect(names.get("1")?.bg).toBe("Иво Петров");
    expect(names.get("2")?.bg).toBe("Иво Павлов");
  });
});

describe("transliteration", () => {
  it("follows the official Bulgarian system", () => {
    expect(bgToEn("Венцислав")).toBe("Ventsislav");
    expect(bgToEn("Живко Щерев")).toBe("Zhivko Shterev");
    expect(bgToEn("Мария")).toBe("Maria");
    expect(bgToEn("Върбанов")).toBe("Varbanov");
  });

  it("guesses Latin → Cyrillic", () => {
    expect(enToBg("Ivaylo")).toBe("Ивайло");
    expect(enToBg("Georgi")).toBe("Георги");
    expect(enToBg("Martin")).toBe("Мартин");
  });

  it("splits a typed guest name into both scripts", () => {
    expect(nameFromInput("  Мартин   Иванов ")).toEqual({
      firstBg: "Мартин",
      lastBg: "Иванов",
      firstEn: "Martin",
      lastEn: "Ivanov",
    });
    expect(nameFromInput("Georgi")).toEqual({
      firstBg: "Георги",
      lastBg: "",
      firstEn: "Georgi",
      lastEn: "",
    });
  });
});

describe("findGuest", () => {
  const guests = [
    p("1", "Велислав", "Кунев", "Velislav", "Kunev"),
    p("2", "Атанас", "(Станислав)", "Atanas", "(Stanislav)"),
    p("3", "Иван", "Петров", "Ivan", "Petrov"),
    p("4", "Иван", "Георгиев", "Ivan", "Georgiev"),
  ];

  it("finds a guest by the full name, in either script and any case", () => {
    expect(findGuest(guests, nameFromInput("Велислав Кунев"))?.id).toBe("1");
    expect(findGuest(guests, nameFromInput("velislav kunev"))?.id).toBe("1");
  });

  it("finds the only guest with a first name when just that was typed", () => {
    expect(findGuest(guests, nameFromInput("Велислав"))?.id).toBe("1");
    expect(findGuest(guests, nameFromInput("Atanas"))?.id).toBe("2");
  });

  it("finds nobody when the first name is shared or the surname differs", () => {
    expect(findGuest(guests, nameFromInput("Иван"))).toBeUndefined();
    expect(findGuest(guests, nameFromInput("Велислав Иванов"))).toBeUndefined();
    expect(findGuest(guests, nameFromInput("Мартин"))).toBeUndefined();
  });
});
