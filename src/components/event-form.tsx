import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useWeatherAt, WeatherCard } from "@/components/weather";
import { useI18n } from "@/lib/i18n";
import { venuesQuery } from "@/lib/queries";
import { sofiaInstant } from "@/lib/weather";

const NEW = "__new__";

export type EventValues = {
  date: string;
  time: string;
  venueId: string;
  venueName: string;
  mapUrl: string;
  note: string;
};

/** The venue as the server wants it: an existing one, or a new one to create. */
export function venueInput(v: EventValues) {
  return v.venueId === NEW || !v.venueId
    ? { name: v.venueName.trim(), mapUrl: v.mapUrl.trim() || null }
    : { id: v.venueId };
}

/** Today in Sofia, as the <input type="date"> wants it. */
export function sofiaToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia" }).format(d);
}

/** Day, time, place and note — for announcing a game and for editing one. */
export function EventForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial: Partial<EventValues>;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (values: EventValues) => void;
}) {
  const { t } = useI18n();
  const { data: venues } = useSuspenseQuery(venuesQuery);
  const form = useForm({
    defaultValues: {
      date: initial.date ?? sofiaToday(),
      time: initial.time ?? "20:00",
      venueId: initial.venueId ?? venues[0]?.id ?? NEW,
      venueName: "",
      mapUrl: "",
      note: initial.note ?? "",
    } satisfies EventValues,
    onSubmit: ({ value }) => onSubmit(value),
  });

  return (
    <form
      className="max-w-lg space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <form.Field name="date">
          {(f) => (
            <label className="block">
              <span className="eyebrow">{t.event.date}</span>
              <Input
                className="mt-2"
                type="date"
                min={sofiaToday()}
                max={sofiaToday(14)}
                required
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="time">
          {(f) => (
            <label className="block">
              <span className="eyebrow">{t.event.time}</span>
              <Input
                className="mt-2"
                type="time"
                step={900}
                required
                value={f.state.value}
                onChange={(e) => f.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>
      </div>

      <form.Field name="venueId">
        {(f) => (
          <div>
            <span className="eyebrow">{t.event.venue}</span>
            <Select value={f.state.value} onValueChange={f.handleChange}>
              <SelectTrigger className="mt-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW}>{t.event.newVenue}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values.venueId}>
        {(venueId) =>
          venueId === NEW && (
            <div className="space-y-3 rounded-xl border border-fg/[0.08] p-4">
              <form.Field name="venueName">
                {(f) => (
                  <label className="block">
                    <span className="eyebrow">{t.event.venueName}</span>
                    <Input
                      className="mt-2"
                      required
                      minLength={2}
                      value={f.state.value}
                      onChange={(e) => f.handleChange(e.target.value)}
                      placeholder={t.event.venueNamePlaceholder}
                    />
                  </label>
                )}
              </form.Field>
              <form.Field name="mapUrl">
                {(f) => (
                  <label className="block">
                    <span className="eyebrow">{t.event.mapUrl}</span>
                    <Input
                      className="mt-2"
                      type="url"
                      value={f.state.value}
                      onChange={(e) => f.handleChange(e.target.value)}
                      placeholder="https://maps.app.goo.gl/…"
                    />
                  </label>
                )}
              </form.Field>
            </div>
          )
        }
      </form.Subscribe>

      <form.Field name="note">
        {(f) => (
          <label className="block">
            <span className="eyebrow">{t.event.note}</span>
            <Textarea
              className="mt-2"
              rows={2}
              maxLength={300}
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
              placeholder={t.event.notePlaceholder}
            />
          </label>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => s.values}>
        {(v) => {
          const picked = venues.find((x) => x.id === v.venueId);
          // A day, a time and a place — then it's worth saying what the sky will do.
          const placed = picked ? true : v.venueName.trim().length >= 2;
          return (
            <Forecast
              startsAt={placed ? sofiaInstant(v.date, v.time) : null}
              mapUrl={picked ? picked.mapUrl : v.mapUrl.trim() || null}
            />
          );
        }}
      </form.Subscribe>

      {error && <p className="text-[13px] text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

/** The weather for the game being set up. Waits for typing to stop before asking. */
function Forecast({ startsAt, mapUrl }: { startsAt: string | null; mapUrl: string | null }) {
  const [settled, setSettled] = useState({ startsAt, mapUrl });
  useEffect(() => {
    const id = setTimeout(() => setSettled({ startsAt, mapUrl }), 500);
    return () => clearTimeout(id);
  }, [startsAt, mapUrl]);
  const weather = useWeatherAt(settled.startsAt, settled.mapUrl);
  return weather && <WeatherCard weather={weather} nowcast={null} />;
}

/** Place picker for the quick game: optional, defaults to the last used. */
export function VenueSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  const { data: venues } = useSuspenseQuery(venuesQuery);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t.event.noVenue}</SelectItem>
        {venues.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            {v.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
