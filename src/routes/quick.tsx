import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { LoaderIcon, SearchIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { VenueSelect } from "@/components/event-form";
import { Empty, PageHead, PANE, Section } from "@/components/page";
import { Pips, Rating } from "@/components/rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { effectiveRating, SQUAD_SIZE } from "@/domain/balance";
import { useI18n } from "@/lib/i18n";
import { openMatchQuery, pickListQuery, venuesQuery } from "@/lib/queries";
import { useMe } from "@/lib/use-voter";
import { cn } from "@/lib/utils";
import { addGuest, quickCreate } from "@/server/functions";
import type { RosterPlayer } from "@/server/repo";

export const Route = createFileRoute("/quick")({
  // While a game is open, there is no "new game" — go straight to it.
  beforeLoad: async ({ context }) => {
    const open = await context.queryClient.fetchQuery(openMatchQuery);
    if (open.id) throw redirect({ to: "/match/$id", params: { id: open.id } });
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(pickListQuery),
      context.queryClient.ensureQueryData(venuesQuery),
    ]),
  component: PickSquad,
});

function PickSquad() {
  const { t, error, isAdmin } = useI18n();
  const { data: players } = useSuspenseQuery(pickListQuery);
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const { data: venues } = useSuspenseQuery(venuesQuery);
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" }),
  );
  const [venue, setVenue] = useState(venues[0]?.id ?? "none");
  const [me] = useMe();
  const navigate = useNavigate();

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < SQUAD_SIZE) next.add(id);
      return next;
    });

  const make = useMutation({
    mutationFn: () =>
      quickCreate({
        data: {
          playerIds: [...picked],
          time: time || null,
          venue: venue === "none" ? null : { id: venue },
          actorId: me || null,
        },
      }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: ["open-match"] });
      await navigate({ to: "/match/$id", params: { id } });
    },
  });

  const q = filter.trim().toLocaleLowerCase();
  const visible = (list: RosterPlayer[]) =>
    list.filter(
      (p) => !q || p.name.bg.toLocaleLowerCase().includes(q) || p.name.en.toLowerCase().includes(q),
    );
  const regulars = players.filter((p) => !p.isGuest);
  const guests = players.filter((p) => p.isGuest);

  const ready = picked.size === SQUAD_SIZE;
  const total = players
    .filter((p) => picked.has(p.id))
    .reduce((s, p) => s + effectiveRating({ rating: p.rating ?? null }), 0);

  return (
    <div className={cn(PANE, "space-y-10 pt-10 pb-16")}>
      <PageHead
        eyebrow={t.pick.eyebrow(t.date(new Date().toISOString()))}
        title={t.pick.title}
        lead={t.pick.lead}
      />


      <div className="grid max-w-lg grid-cols-2 gap-3">
        <label className="block">
          <span className="eyebrow">{t.event.quickTime}</span>
          <Input
            className="mt-2"
            type="time"
            step={900}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <div>
          <span className="eyebrow">{t.event.quickVenue}</span>
          <div className="mt-2">
            <VenueSelect value={venue} onChange={setVenue} />
          </div>
        </div>
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg/35" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t.pick.search}
          className="pl-9"
        />
      </div>

      <Section title={t.pick.regulars} note={t.pick.regularsNote(regulars.length)}>
        <Roster players={visible(regulars)} picked={picked} full={ready} onToggle={toggle} />
      </Section>

      <Section title={t.pick.guests} note={t.pick.guestsNote}>
        <GuestForm
          onAdded={(id) => {
            if (!ready) setPicked((prev) => new Set(prev).add(id));
          }}
        />
        <div className="mt-5">
          {guests.length ? (
            <Roster players={visible(guests)} picked={picked} full={ready} onToggle={toggle} />
          ) : (
            <Empty>{t.pick.noGuests}</Empty>
          )}
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 border-t border-fg/[0.09] bg-background/95 backdrop-blur">
        <div className={cn(PANE, "flex items-center justify-between gap-4 py-4")}>
          <div className="flex items-baseline gap-6">
            <p className="font-mono text-[1.35rem] tabular-nums">
              <span className={ready ? "text-confirmed" : undefined}>{picked.size}</span>
              <span className="text-fg/35">/{SQUAD_SIZE}</span>
            </p>
            {isAdmin && (
              <p className="hidden font-mono text-[12.5px] tabular-nums text-fg/45 sm:block">
                {t.pick.sum(total.toFixed(1), (total / 2).toFixed(1))}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {make.isError && (
              <p className="hidden text-[12.5px] text-destructive md:block">{error(make.error)}</p>
            )}
            {picked.size > 0 && !make.isPending && (
              <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                {t.pick.clear}
              </Button>
            )}
            <Button
              disabled={!ready || make.isPending}
              onClick={() => make.mutate()}
            >
              {make.isPending ? (
                <>
                  <LoaderIcon className="animate-spin" /> {t.pick.thinking}
                </>
              ) : ready ? (
                t.pick.make
              ) : (
                t.pick.more(SQUAD_SIZE - picked.size)
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Roster({
  players,
  picked,
  full,
  onToggle,
}: {
  players: RosterPlayer[];
  picked: Set<string>;
  full: boolean;
  onToggle: (id: string) => void;
}) {
  const { t, name } = useI18n();
  if (!players.length) return <Empty>{t.pick.noMatch}</Empty>;
  return (
    <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
      {players.map((p) => {
        const on = picked.has(p.id);
        const blocked = full && !on;
        return (
          <li key={p.id} className="border-b border-fg/[0.07]">
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={blocked}
              onClick={() => onToggle(p.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-sm py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                blocked ? "cursor-not-allowed opacity-35" : "hover:text-fg",
              )}
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-[4px] border",
                  on ? "border-primary bg-primary" : "border-fg/25",
                )}
              >
                {on && <span className="size-1.5 rounded-[1px] bg-primary-foreground" />}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-[14px]", !on && "text-fg/75")}>
                {name(p.name)}
              </span>
              {p.rating !== undefined && (
                <>
                  <Pips value={p.rating} />
                  <Rating value={p.rating} className="w-9 text-right" />
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function GuestForm({ onAdded }: { onAdded: (id: string) => void }) {
  const { t, error } = useI18n();
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (name: string) => addGuest({ data: { name } }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: ["pick-list"] });
      onAdded(id);
    },
  });

  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value, formApi }) => {
      await add.mutateAsync(value.name.trim());
      formApi.reset();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex max-w-md flex-wrap items-start gap-2.5"
    >
      <form.Field
        name="name"
        validators={{ onSubmit: z.string().trim().min(2, t.pick.nameTooShort).max(60) }}
      >
        {(field) => (
          <div className="min-w-0 flex-1">
            <Input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              placeholder={t.pick.guestPlaceholder}
              aria-invalid={field.state.meta.errors.length > 0}
            />
            {field.state.meta.errors[0] && (
              <p className="mt-1.5 text-[12px] text-destructive">
                {String(
                  (field.state.meta.errors[0] as { message?: string })?.message ??
                    field.state.meta.errors[0],
                )}
              </p>
            )}
            {add.isError && <p className="mt-1.5 text-[12px] text-destructive">{error(add.error)}</p>}
          </div>
        )}
      </form.Field>
      <Button type="submit" variant="outline" disabled={add.isPending}>
        <UserPlusIcon /> {t.pick.addGuest}
      </Button>
    </form>
  );
}
