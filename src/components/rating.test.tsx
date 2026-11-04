// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pips, Rating } from "./rating";

describe("Rating", () => {
  it("shows a rating as a measurement", () => {
    const { container } = render(<Rating value={3.5} />);
    expect(container.textContent).toBe("3.5");
  });

  it("shows an unrated player as ? out of what they count as", () => {
    const { container } = render(<Rating className="ml-2" value={null} />);
    expect(container.textContent).toBe("?/2.5");
    expect(container.firstElementChild?.className).toContain("ml-2");
  });
});

describe("Pips", () => {
  const fills = (value: number | null) => {
    const { container } = render(<Pips value={value} />);
    return [...container.querySelectorAll("span > span")].map(
      (pip) => (pip as HTMLElement).style.background
    );
  };

  it("fills whole pips and half a pip for x.5", () => {
    const pips = fills(2.5);
    expect(pips).toHaveLength(5);
    expect(pips[0]).toBe("var(--color-primary)");
    expect(pips[1]).toBe("var(--color-primary)");
    expect(pips[2]).toContain("linear-gradient");
    expect(pips[3]).toBe("");
    expect(pips[4]).toBe("");
  });

  it("leaves every pip empty and dashed for an unrated player", () => {
    const { container } = render(<Pips value={null} />);
    const pips = [...container.querySelectorAll("span > span")];
    expect(pips.every((p) => (p as HTMLElement).style.background === "")).toBe(
      true
    );
    expect(pips[0]?.className).toContain("border-dashed");
  });
});
