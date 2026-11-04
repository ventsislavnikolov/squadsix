// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOFIA, sofiaInstant } from "@/lib/weather";
import type { Venue } from "@/server/repo";
import { renderComponent } from "../../test/render-component";
import { weather } from "../../test/weather-fixture";
import {
  EventForm,
  type EventValues,
  sofiaToday,
  VenueSelect,
  venueInput,
} from "./event-form";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const VENUES: Venue[] = [
  { hidden: false, id: "v1", mapUrl: null, name: "Office pitch" },
  {
    hidden: false,
    id: "v2",
    mapUrl: "https://www.google.com/maps/@42.65,23.35,17z",
    name: "Park",
  },
];
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SUBMIT = { name: "Announce" };

function renderForm({
  venues = VENUES,
  initial = {},
  error = null,
  pending = false,
  extra = [],
}: {
  venues?: Venue[];
  initial?: Partial<EventValues>;
  error?: string | null;
  pending?: boolean;
  extra?: [readonly unknown[], unknown][];
} = {}) {
  const onSubmit = vi.fn();
  const view = renderComponent(
    <EventForm
      error={error}
      initial={initial}
      onSubmit={onSubmit}
      pending={pending}
      submitLabel="Announce"
    />,
    { data: [[["venues"], venues], ...extra] }
  );
  return { ...view, onSubmit };
}

describe("venueInput", () => {
  const values: EventValues = {
    date: "2026-11-05",
    mapUrl: "  https://maps.app.goo.gl/x ",
    note: "",
    time: "20:00",
    venueId: "__new__",
    venueName: "  New pitch ",
  };

  it("names a new place, with its map link when there is one", () => {
    expect(venueInput(values)).toEqual({
      mapUrl: "https://maps.app.goo.gl/x",
      name: "New pitch",
    });
    expect(venueInput({ ...values, mapUrl: " ", venueId: "" })).toEqual({
      mapUrl: null,
      name: "New pitch",
    });
  });

  it("points at an existing place by id", () => {
    expect(venueInput({ ...values, venueId: "v1" })).toEqual({ id: "v1" });
  });
});

describe("sofiaToday", () => {
  it("gives Sofia's date as the date input wants it", () => {
    expect(sofiaToday()).toMatch(DATE);
    expect(Date.parse(sofiaToday(14)) - Date.parse(sofiaToday())).toBe(
      14 * 86_400_000
    );
  });
});

describe("EventForm", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 503 })))
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts at today, 20:00, at the last used place, and sends what was set", async () => {
    const { user, onSubmit } = renderForm({ initial: { note: "Bring bibs" } });
    const date = (await screen.findByLabelText("Day")) as HTMLInputElement;
    expect(date.value).toBe(sofiaToday());
    expect(date.min).toBe(sofiaToday());
    expect(date.max).toBe(sofiaToday(14));
    expect((screen.getByLabelText("Time") as HTMLInputElement).value).toBe(
      "20:00"
    );
    expect(screen.getByRole("combobox").textContent).toContain("Office pitch");

    fireEvent.change(screen.getByLabelText("Time"), {
      target: { value: "19:30" },
    });
    await user.clear(screen.getByLabelText("Note (optional)"));
    await user.type(screen.getByLabelText("Note (optional)"), "Dark shirts");
    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenCalledWith({
      date: sofiaToday(),
      mapUrl: "",
      note: "Dark shirts",
      time: "19:30",
      venueId: "v1",
      venueName: "",
    });
  });

  it("asks for a new place's name and map link", async () => {
    const { user, onSubmit } = renderForm();
    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "New place…" }));
    await user.type(screen.getByLabelText("Place name"), "Roof");
    await user.type(
      screen.getByLabelText("Google Maps link (optional)"),
      "https://maps.app.goo.gl/abc"
    );
    fireEvent.change(screen.getByLabelText("Day"), {
      target: { value: sofiaToday(3) },
    });
    await user.click(screen.getByRole("button", SUBMIT));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        date: sofiaToday(3),
        mapUrl: "https://maps.app.goo.gl/abc",
        venueId: "__new__",
        venueName: "Roof",
      })
    );
  });

  it("goes straight to a new place when there are none yet", async () => {
    renderForm({ venues: [] });
    expect(await screen.findByLabelText("Place name")).toBeTruthy();
  });

  it("starts from the game being edited", async () => {
    renderForm({
      initial: { date: "2026-11-09", time: "18:00", venueId: "v2" },
    });
    expect(
      ((await screen.findByLabelText("Day")) as HTMLInputElement).value
    ).toBe("2026-11-09");
    expect(screen.getByRole("combobox").textContent).toContain("Park");
  });

  it("shows the forecast for the day, time and place once typing stops", async () => {
    const date = sofiaToday(1);
    const startsAt = sofiaInstant(date, "20:00");
    renderForm({
      extra: [
        [["weather", startsAt, SOFIA.lat, SOFIA.lng], weather({ temp: 21 })],
      ],
      initial: { date },
    });
    expect(await screen.findByText("Forecast for kick-off")).toBeTruthy();
    expect(screen.getByText("21°")).toBeTruthy();
  });

  it("reads a new place's coordinates off its map link", async () => {
    const date = sofiaToday(1);
    const startsAt = sofiaInstant(date, "20:00");
    const { user } = renderForm({
      extra: [[["weather", startsAt, 42.7, 23.4], weather({ temp: 9 })]],
      initial: { date },
      venues: [],
    });
    await user.type(await screen.findByLabelText("Place name"), "Hill");
    fireEvent.change(screen.getByLabelText("Google Maps link (optional)"), {
      target: { value: "https://www.google.com/maps/@42.7,23.4,17z" },
    });
    expect(await screen.findByText("9°")).toBeTruthy();
  });

  it("waits for a place before asking about the weather", async () => {
    renderForm({ venues: [] });
    await screen.findByLabelText("Place name");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByText("Forecast for kick-off")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and holds the button while saving", async () => {
    renderForm({ error: "One game a day.", pending: true });
    expect(await screen.findByText("One game a day.")).toBeTruthy();
    expect(screen.getByRole("button", SUBMIT).hasAttribute("disabled")).toBe(
      true
    );
  });
});

describe("VenueSelect", () => {
  it("offers no place or any venue, and reports the pick", async () => {
    const onChange = vi.fn();
    const { user } = renderComponent(
      <VenueSelect onChange={onChange} value="none" />,
      { data: [[["venues"], VENUES]] }
    );
    const trigger = await screen.findByRole("combobox");
    expect(trigger.textContent).toContain("No place");
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Park" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("v2"));
  });
});
