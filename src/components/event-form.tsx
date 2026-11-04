import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWeatherAt, WeatherCard } from "@/components/weather";
import { useI18n } from "@/lib/i18n";
import { venuesQuery } from "@/lib/queries";
import { sofiaInstant } from "@/lib/weather";

const NEW = "__new__";

const selectVenueId = (s: { values: EventValues }) => s.values.venueId;
const selectValues = (s: { values: EventValues }) => s.values;

export interface EventValues {
  date: string;
  mapUrl: string;
  note: string;
  time: string;
  venueId: string;
  venueName: string;
}

/** The venue as the server wants it: an existing one, or a new one to create. */
export function venueInput(v: EventValues) {
  return v.venueId === NEW || !v.venueId
    ? { name: v.venueName.trim(), mapUrl: v.mapUrl.trim() || null }
    : { id: v.venueId };
}

/** Today in Sofia, as the <input type="date"> wants it. */
export function sofiaToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia" }).format(
    d
  );
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
  const submit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      form.handleSubmit();
    },
    [form]
  );

  return (
    <form className="max-w-lg space-y-5" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <form.Field name="date">
          {(f) => (
            <TextInput
              label={t.event.date}
              max={sofiaToday(14)}
              min={sofiaToday()}
              onValue={f.handleChange}
              required
              type="date"
              value={f.state.value}
            />
          )}
        </form.Field>
        <form.Field name="time">
          {(f) => (
            <TextInput
              label={t.event.time}
              onValue={f.handleChange}
              required
              step={900}
              type="time"
              value={f.state.value}
            />
          )}
        </form.Field>
      </div>

      <form.Field name="venueId">
        {(f) => (
          <div>
            <span className="eyebrow">{t.event.venue}</span>
            <Select onValueChange={f.handleChange} value={f.state.value}>
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

      <form.Subscribe selector={selectVenueId}>
        {(venueId) =>
          venueId === NEW && (
            <div className="space-y-3 rounded-xl border border-fg/[0.08] p-4">
              <form.Field name="venueName">
                {(f) => (
                  <TextInput
                    label={t.event.venueName}
                    minLength={2}
                    onValue={f.handleChange}
                    placeholder={t.event.venueNamePlaceholder}
                    required
                    value={f.state.value}
                  />
                )}
              </form.Field>
              <form.Field name="mapUrl">
                {(f) => (
                  <TextInput
                    label={t.event.mapUrl}
                    onValue={f.handleChange}
                    placeholder="https://maps.app.goo.gl/…"
                    type="url"
                    value={f.state.value}
                  />
                )}
              </form.Field>
            </div>
          )
        }
      </form.Subscribe>

      <form.Field name="note">
        {(f) => (
          <TextArea
            label={t.event.note}
            maxLength={300}
            onValue={f.handleChange}
            placeholder={t.event.notePlaceholder}
            rows={2}
            value={f.state.value}
          />
        )}
      </form.Field>

      <form.Subscribe selector={selectValues}>
        {(v) => {
          const picked = venues.find((x) => x.id === v.venueId);
          // A day, a time and a place — then it's worth saying what the sky will do.
          const placed = picked ? true : v.venueName.trim().length >= 2;
          return (
            <Forecast
              mapUrl={picked ? picked.mapUrl : v.mapUrl.trim() || null}
              startsAt={placed ? sofiaInstant(v.date, v.time) : null}
            />
          );
        }}
      </form.Subscribe>

      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      <Button disabled={pending} size="lg" type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}

type ValueProps<P> = Omit<P, "onChange" | "className"> & {
  label: string;
  onValue: (value: string) => void;
};

/** A labelled text input that reports its value, not the change event. */
function TextInput({
  label,
  onValue,
  ...props
}: ValueProps<React.ComponentProps<typeof Input>>) {
  const change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onValue(e.target.value),
    [onValue]
  );
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <Input {...props} className="mt-2" onChange={change} />
    </label>
  );
}

/** TextInput's multi-line twin. */
function TextArea({
  label,
  onValue,
  ...props
}: ValueProps<React.ComponentProps<typeof Textarea>>) {
  const change = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => onValue(e.target.value),
    [onValue]
  );
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <Textarea {...props} className="mt-2" onChange={change} />
    </label>
  );
}

/** The weather for the game being set up. Waits for typing to stop before asking. */
function Forecast({
  startsAt,
  mapUrl,
}: {
  startsAt: string | null;
  mapUrl: string | null;
}) {
  const [settled, setSettled] = useState({ startsAt, mapUrl });
  useEffect(() => {
    const id = setTimeout(() => setSettled({ startsAt, mapUrl }), 500);
    return () => clearTimeout(id);
  }, [startsAt, mapUrl]);
  const weather = useWeatherAt(settled.startsAt, settled.mapUrl);
  return weather && <WeatherCard nowcast={null} weather={weather} />;
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
    <Select onValueChange={onChange} value={value}>
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
