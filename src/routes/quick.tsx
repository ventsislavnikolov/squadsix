import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { LoaderIcon, SearchIcon, UserPlusIcon } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { z } from "zod";
import { VenueSelect } from "@/components/event-form";
import { Empty, PANE, PageHead, Section } from "@/components/page";
import { Pips, Rating } from "@/components/rating";
import { FormSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { effectiveRating, SQUAD_SIZE } from "@/domain/balance";
import { useI18n } from "@/lib/i18n";
import {
  openMatchQuery,
  pickListQuery,
  venuesQuery,
  warm,
} from "@/lib/queries";
import { useMe } from "@/lib/use-voter";
import { cn } from "@/lib/utils";
import { addGuest, quickCreate } from "@/server/functions";
import type { RosterPlayer } from "@/server/repo";

export const Route = createFileRoute("/quick")({
  // While a game is open, there is no "new game" — go straight to it.
  beforeLoad: async ({ context }) => {
    const open = await context.queryClient.fetchQuery(openMatchQuery);
    if (open.id) {
      throw redirect({ to: "/match/$id", params: { id: open.id } });
    }
  },
  loader: ({ context }) =>
    warm(context.queryClient, pickListQuery, venuesQuery),
  pendingComponent: FormSkeleton,
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
    new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Sofia",
    })
  );
  const [venue, setVenue] = useState(venues[0]?.id ?? "none");
  const [me] = useMe();
  const navigate = useNavigate();

  const toggle = useCallback(
    (id: string) =>
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else if (next.size < SQUAD_SIZE) {
          next.add(id);
        }
        return next;
      }),
    []
  );

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
      (p) =>
        !q ||
        p.name.bg.toLocaleLowerCase().includes(q) ||
        p.name.en.toLowerCase().includes(q)
    );
  const regulars = players.filter((p) => !p.isGuest);
  const guests = players.filter((p) => p.isGuest);

  const ready = picked.size === SQUAD_SIZE;
  const { mutate } = make;
  const onMake = useCallback(() => mutate(), [mutate]);
  const onClear = useCallback(() => setPicked(new Set()), []);
  const onTime = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setTime(e.target.value),
    []
  );
  const onFilter = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setFilter(e.target.value),
    []
  );
  const onGuestAdded = useCallback(
    (id: string) => {
      if (!ready) {
        setPicked((prev) => new Set(prev).add(id));
      }
    },
    [ready]
  );
  const total = players
    .filter((p) => picked.has(p.id))
    .reduce((s, p) => s + effectiveRating({ rating: p.rating ?? null }), 0);

  return (
    <div className={cn(PANE, "space-y-10 pt-10 pb-16")}>
      <PageHead
        eyebrow={t.pick.eyebrow(t.date(new Date().toISOString()))}
        lead={t.pick.lead}
        title={t.pick.title}
      />

      <div className="grid max-w-lg grid-cols-2 gap-3">
        <label className="block">
          <span className="eyebrow">{t.event.quickTime}</span>
          <Input
            className="mt-2"
            onChange={onTime}
            step={900}
            type="time"
            value={time}
          />
        </label>
        <div>
          <span className="eyebrow">{t.event.quickVenue}</span>
          <div className="mt-2">
            <VenueSelect onChange={setVenue} value={venue} />
          </div>
        </div>
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg/35" />
        <Input
          className="pl-9"
          onChange={onFilter}
          placeholder={t.pick.search}
          value={filter}
        />
      </div>

      <Section
        note={t.pick.regularsNote(regulars.length)}
        title={t.pick.regulars}
      >
        <Roster
          full={ready}
          onToggle={toggle}
          picked={picked}
          players={visible(regulars)}
        />
      </Section>

      <Section note={t.pick.guestsNote} title={t.pick.guests}>
        <GuestForm onAdded={onGuestAdded} />
        <div className="mt-5">
          {guests.length ? (
            <Roster
              full={ready}
              onToggle={toggle}
              picked={picked}
              players={visible(guests)}
            />
          ) : (
            <Empty>{t.pick.noGuests}</Empty>
          )}
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 border-t border-fg/[0.09] bg-background/95 backdrop-blur">
        <div
          className={cn(PANE, "flex items-center justify-between gap-4 py-4")}
        >
          <div className="flex items-baseline gap-6">
            <p className="font-mono text-[1.35rem] tabular-nums">
              <span className={ready ? "text-confirmed" : undefined}>
                {picked.size}
              </span>
              <span className="text-fg/35">/{SQUAD_SIZE}</span>
            </p>
            {isAdmin ? (
              <p className="hidden font-mono text-[12.5px] text-fg/45 tabular-nums sm:block">
                {t.pick.sum(total.toFixed(1), (total / 2).toFixed(1))}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {make.isError ? (
              <p className="hidden text-[12.5px] text-destructive md:block">
                {error(make.error)}
              </p>
            ) : null}
            {picked.size > 0 && !make.isPending && (
              <Button onClick={onClear} size="sm" variant="ghost">
                {t.pick.clear}
              </Button>
            )}
            <Button disabled={!ready || make.isPending} onClick={onMake}>
              <MakeLabel
                missing={SQUAD_SIZE - picked.size}
                pending={make.isPending}
              />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MakeLabel({
  pending,
  missing,
}: {
  pending: boolean;
  missing: number;
}) {
  const { t } = useI18n();
  if (pending) {
    return (
      <>
        <LoaderIcon className="animate-spin" /> {t.pick.thinking}
      </>
    );
  }
  return missing === 0 ? t.pick.make : t.pick.more(missing);
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
  const { t } = useI18n();
  if (!players.length) {
    return <Empty>{t.pick.noMatch}</Empty>;
  }
  return (
    <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
      {players.map((p) => {
        const on = picked.has(p.id);
        return (
          <RosterItem
            blocked={full && !on}
            key={p.id}
            on={on}
            onToggle={onToggle}
            player={p}
          />
        );
      })}
    </ul>
  );
}

function RosterItem({
  player,
  on,
  blocked,
  onToggle,
}: {
  player: RosterPlayer;
  on: boolean;
  blocked: boolean;
  onToggle: (id: string) => void;
}) {
  const { name } = useI18n();
  const onClick = useCallback(() => onToggle(player.id), [onToggle, player.id]);
  return (
    <li className="border-b border-fg/[0.07]">
      {/* biome-ignore lint/a11y/useSemanticElements: the whole row is the checkbox, styled as a list item; a native input cannot hold the name and the rating pips. */}
      <button
        aria-checked={on}
        className={cn(
          "flex w-full items-center gap-3 rounded-sm py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          blocked ? "cursor-not-allowed opacity-35" : "hover:text-fg"
        )}
        disabled={blocked}
        onClick={onClick}
        role="checkbox"
        type="button"
      >
        <span
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-[4px] border",
            on ? "border-primary bg-primary" : "border-fg/25"
          )}
        >
          {on ? (
            <span className="size-1.5 rounded-[1px] bg-primary-foreground" />
          ) : null}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[14px]",
            !on && "text-fg/75"
          )}
        >
          {name(player.name)}
        </span>
        {player.rating === undefined ? null : (
          <>
            <Pips value={player.rating} />
            <Rating className="w-9 text-right" value={player.rating} />
          </>
        )}
      </button>
    </li>
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

  const { handleSubmit } = form;
  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      handleSubmit();
    },
    [handleSubmit]
  );

  return (
    <form
      className="flex max-w-md flex-wrap items-start gap-2.5"
      onSubmit={onSubmit}
    >
      <form.Field
        name="name"
        validators={{
          onSubmit: z.string().trim().min(2, t.pick.nameTooShort).max(60),
        }}
      >
        {(field) => (
          <div className="min-w-0 flex-1">
            <NameInput
              invalid={field.state.meta.errors.length > 0}
              onBlur={field.handleBlur}
              onValue={field.handleChange}
              placeholder={t.pick.guestPlaceholder}
              value={field.state.value}
            />
            {field.state.meta.errors[0] ? (
              <p className="mt-1.5 text-[12px] text-destructive">
                {problemText(field.state.meta.errors[0])}
              </p>
            ) : null}
            {add.isError ? (
              <p className="mt-1.5 text-[12px] text-destructive">
                {error(add.error)}
              </p>
            ) : null}
          </div>
        )}
      </form.Field>
      <Button disabled={add.isPending} type="submit" variant="outline">
        <UserPlusIcon /> {t.pick.addGuest}
      </Button>
    </form>
  );
}

function NameInput({
  value,
  invalid,
  placeholder,
  onBlur,
  onValue,
}: {
  value: string;
  invalid: boolean;
  placeholder: string;
  onBlur: () => void;
  onValue: (value: string) => void;
}) {
  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onValue(e.target.value),
    [onValue]
  );
  return (
    <Input
      aria-invalid={invalid}
      onBlur={onBlur}
      onChange={onChange}
      placeholder={placeholder}
      value={value}
    />
  );
}

/** A validator's problem: Zod's issue carries a message, anything else is shown as is. */
function problemText(problem: unknown): string {
  if (typeof problem === "object" && problem !== null && "message" in problem) {
    return String(problem.message ?? problem);
  }
  return String(problem);
}
