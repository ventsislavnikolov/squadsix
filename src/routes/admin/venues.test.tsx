// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VENUE } from "../../../test/fixtures";
import { answerSession, renderApp } from "../../../test/render-app";
import { getVenues, saveVenue } from "../../../test/server-functions";

vi.mock("@/server/functions", () => import("../../../test/server-functions"));

const SAVE = /^save$/iu;

describe("admin venues page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    answerSession({ isAdmin: true });
  });

  it("says when there are no venues", async () => {
    getVenues.mockResolvedValue([]);
    renderApp("/admin/venues");
    expect(
      await screen.findByText(
        "No places yet. They're added from the announcement."
      )
    ).toBeDefined();
  });

  it("renames a venue, sets its map and hides it", async () => {
    getVenues.mockResolvedValue([VENUE]);
    saveVenue.mockResolvedValue(undefined);
    const { user } = renderApp("/admin/venues");
    const name = await screen.findByLabelText("Name");
    const save = screen.getByRole("button", { name: SAVE });
    expect(save).toHaveProperty("disabled", true);
    await user.clear(name);
    await user.type(name, "P");
    // A one-letter name cannot be saved.
    expect(save).toHaveProperty("disabled", true);
    await user.type(name, "ark ");
    await user.type(
      screen.getByLabelText("Map link"),
      "https://maps.example.com/x"
    );
    await user.click(screen.getByRole("switch"));
    await user.click(save);
    await waitFor(() =>
      expect(saveVenue).toHaveBeenCalledWith({
        data: {
          id: "v1",
          name: "Park",
          mapUrl: "https://maps.example.com/x",
          hidden: true,
        },
      })
    );
  });

  it("clears the map link and shows a refusal", async () => {
    getVenues.mockResolvedValue([
      { ...VENUE, mapUrl: "https://maps.example.com/y" },
    ]);
    saveVenue.mockRejectedValue(new Error("admin-only"));
    const { user } = renderApp("/admin/venues");
    await user.clear(await screen.findByLabelText("Map link"));
    await user.click(screen.getByRole("button", { name: SAVE }));
    expect(await screen.findByText("Admin only.")).toBeDefined();
    expect(saveVenue).toHaveBeenCalledWith({
      data: { id: "v1", name: "Office pitch", mapUrl: null, hidden: false },
    });
  });
});
