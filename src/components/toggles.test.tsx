// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderComponent } from "../../test/render-component";
import { setLang } from "../../test/server-functions";
import { LangToggle, THEME_SCRIPT, ThemeToggle } from "./toggles";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const KEY = "s6-theme";

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cycles system → light → dark → system and remembers the choice", async () => {
    const { user } = renderComponent(<ThemeToggle />);
    const button = await screen.findByRole("button", {
      name: "Theme: System",
    });

    await user.click(button);
    expect(button.getAttribute("aria-label")).toBe("Theme: Light");
    expect(localStorage.getItem(KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    await user.click(button);
    expect(button.getAttribute("aria-label")).toBe("Theme: Dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(button);
    expect(button.getAttribute("aria-label")).toBe("Theme: System");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("starts from the theme chosen before", async () => {
    localStorage.setItem(KEY, "dark");
    renderComponent(<ThemeToggle />);
    expect(
      await screen.findByRole("button", { name: "Theme: Dark" })
    ).toBeTruthy();
  });

  it("ignores anything else stored under its key", async () => {
    localStorage.setItem(KEY, "purple");
    renderComponent(<ThemeToggle />);
    expect(
      await screen.findByRole("button", { name: "Theme: System" })
    ).toBeTruthy();
  });

  it("still switches for this page when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { user } = renderComponent(<ThemeToggle />);
    const button = await screen.findByRole("button", {
      name: "Theme: System",
    });
    await user.click(button);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies the stored theme before paint", () => {
    localStorage.setItem(KEY, "dark");
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("LangToggle", () => {
  it("switches to the other language and re-renders in it", async () => {
    setLang.mockResolvedValue(undefined);
    const { user, queryClient } = renderComponent(<LangToggle />);
    await user.click(await screen.findByRole("button", { name: "БГ" }));
    expect(setLang).toHaveBeenCalledWith({ data: { lang: "bg" } });
    await waitFor(() =>
      expect(queryClient.getQueryData(["session"])).toMatchObject({
        lang: "bg",
      })
    );
    expect(await screen.findByRole("button", { name: "EN" })).toBeTruthy();
  });

  it("switches from Bulgarian to English", async () => {
    setLang.mockResolvedValue(undefined);
    const { user } = renderComponent(<LangToggle />, {
      session: { lang: "bg" },
    });
    await user.click(await screen.findByRole("button", { name: "EN" }));
    expect(setLang).toHaveBeenCalledWith({ data: { lang: "en" } });
  });

  it("leaves an empty session cache alone", async () => {
    setLang.mockResolvedValue(undefined);
    const { user, queryClient } = renderComponent(<LangToggle />);
    const button = await screen.findByRole("button", { name: "БГ" });
    queryClient.removeQueries({ queryKey: ["session"] });
    await user.click(button);
    await waitFor(() => expect(setLang).toHaveBeenCalled());
  });
});
