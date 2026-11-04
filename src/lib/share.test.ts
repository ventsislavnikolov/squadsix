import { afterEach, describe, expect, it, vi } from "vitest";
import { shareText } from "./share";

const writeText = vi.fn<(text: string) => Promise<void>>();

function phone(share?: (data: ShareData) => Promise<void>) {
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share, clipboard: { writeText } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  writeText.mockReset();
});

describe("shareText", () => {
  it("opens the share sheet where the phone has one", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>();
    share.mockResolvedValue(undefined);
    phone(share);
    expect(await shareText("Teams")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "Teams" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies to the clipboard where there is no share sheet", async () => {
    phone();
    expect(await shareText("Teams")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Teams");
  });

  it("does nothing more when the sheet is closed", async () => {
    phone(() => Promise.reject(new DOMException("closed", "AbortError")));
    expect(await shareText("Teams")).toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard when the sheet fails", async () => {
    phone(() => Promise.reject(new DOMException("no", "NotAllowedError")));
    expect(await shareText("Teams")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Teams");
  });
});
