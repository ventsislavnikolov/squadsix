// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Empty, Figure, PageHead, Section } from "./page";

describe("PageHead", () => {
  it("shows the eyebrow, title, lead and actions", () => {
    render(
      <PageHead
        actions={<button type="button">Act</button>}
        eyebrow="Archive"
        lead="The last games."
        title="Past games"
      />
    );
    expect(screen.getByText("Archive")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Past games" })).toBeTruthy();
    expect(screen.getByText("The last games.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Act" })).toBeTruthy();
  });

  it("puts the aside on the eyebrow's line, with or without an eyebrow", () => {
    const { rerender } = render(
      <PageHead aside={<span>Side</span>} eyebrow="Game" title="Title" />
    );
    expect(screen.getByText("Side")).toBeTruthy();
    expect(screen.getAllByText("Game")).toHaveLength(1);

    rerender(<PageHead aside={<span>Side</span>} title="Title" />);
    expect(screen.getByText("Side")).toBeTruthy();
    expect(screen.queryByText("Game")).toBeNull();
  });

  it("shows only the title when nothing else is given", () => {
    const { container } = render(<PageHead title="Just this" />);
    expect(container.textContent).toBe("Just this");
  });
});

describe("Section", () => {
  it("shows the title, note, actions and content", () => {
    render(
      <Section actions={<span>Actions</span>} note="A note" title="Rules">
        <p>Body</p>
      </Section>
    );
    expect(screen.getByRole("heading", { name: "Rules" })).toBeTruthy();
    expect(screen.getByText("A note")).toBeTruthy();
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("leaves the note out when there is none", () => {
    const { container } = render(
      <Section title="Rules">
        <p>Body</p>
      </Section>
    );
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
});

describe("Figure", () => {
  it.each([
    ["neutral", ""],
    ["confirmed", "text-confirmed"],
    ["warning", "text-warning"],
    ["a", "text-team-a"],
    ["b", "text-team-b"],
  ] as const)("colours a %s figure", (tone, className) => {
    render(<Figure label="Gap" tone={tone} value="0.5" />);
    const value = screen.getByText("0.5");
    const tones = [
      "text-confirmed",
      "text-warning",
      "text-team-a",
      "text-team-b",
    ];
    for (const colour of tones) {
      expect(value.className.includes(colour)).toBe(colour === className);
    }
    expect(screen.getByText("Gap")).toBeTruthy();
  });

  it("is neutral by default", () => {
    render(<Figure label="Votes" value={3} />);
    expect(screen.getByText("3").className).not.toContain("text-team");
  });
});

describe("Empty", () => {
  it("shows its copy", () => {
    render(<Empty>Nothing here yet.</Empty>);
    expect(screen.getByText("Nothing here yet.")).toBeTruthy();
  });
});
