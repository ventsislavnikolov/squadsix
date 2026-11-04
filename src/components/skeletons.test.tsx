// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderComponent } from "../../test/render-component";
import { Bone, FormSkeleton, ListSkeleton, MatchSkeleton } from "./skeletons";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

describe("skeletons", () => {
  it("says it is loading while a list is on the way", async () => {
    renderComponent(<ListSkeleton />);
    const status = await screen.findByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(status.querySelectorAll("li")).toHaveLength(8);
  });

  it("greys out four fields and a button for a form", async () => {
    renderComponent(<FormSkeleton />);
    const status = await screen.findByRole("status");
    expect(status.querySelectorAll(".space-y-2\\.5")).toHaveLength(4);
  });

  it("greys out three options of two teams of six for a game", async () => {
    renderComponent(<MatchSkeleton />);
    const status = await screen.findByRole("status");
    expect(status.querySelectorAll(".rounded-xl")).toHaveLength(3);
    expect(status.querySelectorAll(".h-3\\.5")).toHaveLength(36);
  });

  it("keeps a bone's own size", async () => {
    const { container } = renderComponent(<Bone className="h-4 w-20" />);
    await screen.findByText((_, el) => el === container.firstElementChild);
    expect(container.querySelector(".animate-pulse")?.className).toContain(
      "w-20"
    );
  });
});
