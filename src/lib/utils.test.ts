import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins the classes that apply and lets the later Tailwind class win", () => {
    expect(cn("px-2 py-1", false, null, undefined, "px-4")).toBe("py-1 px-4");
  });
});
