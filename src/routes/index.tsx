import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderIcon, SearchIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Empty, PageHead, PANE, Section } from "@/components/page";
import { Pips, Rating } from "@/components/rating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { effectiveRating, SQUAD_SIZE, type Player } from "@/domain/balance";
import { playersQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { addGuest, createMatchday } from "@/server/functions";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(playersQuery),
  component: PickSquad,
});

function PickSquad() {
  const { data: players } = useSuspenseQuery(playersQuery);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const navigate = useNavigate();

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < SQUAD_SIZE) next.add(id);
      return next;
    });

  const make = useMutation({
    mutationFn: () => createMatchday({ data: { playerIds: [...picked] } }),
    onSuccess: ({ id }) => navigate({ to: "/match/$id", params: { id } }),
  });

  const regulars = players.filter((p) => !p.isGuest);
  const guests = players.filter((p) => p.isGuest);
  const visible = (list: Player[]) =>
    list.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()));

  const chosen = players.filter((p) => picked.has(p.id));
  const total = chosen.reduce((s, p) => s + effectiveRating(p), 0);
  const ready = picked.size === SQUAD_SIZE;

  return (
    <div className={cn(PANE, "space-y-10 py-10 pb-36")}>
      <PageHead
        eyebrow={`Мач · ${new Date().toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long" })}`}
        title="Кой играе днес?"
        lead={
          <>
            Избери {SQUAD_SIZE} души. Кодът смята всички възможни 6 на 6, а Jev избира трите
            най-честни варианта. После всеки гласува.
          </>
        }
      />

      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/35" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Търси по име"
          className="pl-9"
        />
      </div>

      <Section title="От офиса" note={`${regulars.length} души в списъка.`}>
        <Roster players={visible(regulars)} picked={picked} full={ready} onToggle={toggle} />
      </Section>

      <Section
        title="Гости"
        note="Някой отвън, когато не се съберем. Няма рейтинг: показва се „?“ и се смята за 2.5."
      >
        <GuestForm
          onAdded={(p) => {
            if (!ready) setPicked((prev) => new Set(prev).add(p.id));
          }}
        />
        <div className="mt-5">
          {guests.length ? (
            <Roster players={visible(guests)} picked={picked} full={ready} onToggle={toggle} />
          ) : (
            <Empty>Още няма гости.</Empty>
          )}
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 border-t border-white/[0.08] bg-background/95 backdrop-blur">
        <div className={cn(PANE, "flex items-center justify-between gap-4 py-4")}>
          <div className="flex items-baseline gap-6">
            <p className="font-mono text-[1.35rem] tabular-nums">
              <span className={ready ? "text-confirmed" : undefined}>{picked.size}</span>
              <span className="text-white/35">/{SQUAD_SIZE}</span>
            </p>
            <p className="hidden font-mono text-[12.5px] tabular-nums text-white/45 sm:block">
              сума {total.toFixed(1)} · по {(total / 2).toFixed(1)} на отбор
            </p>
          </div>
          <div className="flex items-center gap-3">
            {make.isError && (
              <p className="hidden text-[12.5px] text-destructive md:block">
                {make.error.message}
              </p>
            )}
            {picked.size > 0 && !make.isPending && (
              <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                Изчисти
              </Button>
            )}
            <Button disabled={!ready || make.isPending} onClick={() => make.mutate()}>
              {make.isPending ? (
                <>
                  <LoaderIcon className="animate-spin" /> Jev решава…
                </>
              ) : ready ? (
                "Направи отбори"
              ) : (
                `Още ${SQUAD_SIZE - picked.size}`
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
  players: Player[];
  picked: Set<string>;
  full: boolean;
  onToggle: (id: string) => void;
}) {
  if (!players.length) return <Empty>Никой не отговаря на търсенето.</Empty>;
  return (
    <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
      {players.map((p) => {
        const on = picked.has(p.id);
        const blocked = full && !on;
        return (
          <li key={p.id} className="border-b border-white/[0.06]">
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={blocked}
              onClick={() => onToggle(p.id)}
              className={cn(
                "flex w-full items-center gap-3 py-2.5 text-left transition-colors",
                blocked ? "cursor-not-allowed opacity-35" : "hover:text-white",
              )}
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-[4px] border",
                  on ? "border-primary bg-primary" : "border-white/25",
                )}
              >
                {on && <span className="size-1.5 rounded-[1px] bg-primary-foreground" />}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-[14px]", !on && "text-white/75")}>
                {p.name}
              </span>
              <Pips value={p.rating} />
              <Rating value={p.rating} className="w-9 text-right" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function GuestForm({ onAdded }: { onAdded: (p: Player) => void }) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (name: string) => addGuest({ data: { name } }),
    onSuccess: async (p) => {
      await qc.invalidateQueries({ queryKey: ["players"] });
      onAdded(p);
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
        validators={{
          onSubmit: z.string().trim().min(2, "Поне 2 букви").max(40, "Твърде дълго"),
        }}
      >
        {(field) => (
          <div className="min-w-0 flex-1">
            <Input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              placeholder="Име на госта, напр. „Иван (гост)“"
              aria-invalid={field.state.meta.errors.length > 0}
            />
            {field.state.meta.errors[0] && (
              <p className="mt-1.5 text-[12px] text-destructive">
                {String(field.state.meta.errors[0]?.message ?? field.state.meta.errors[0])}
              </p>
            )}
            {add.isError && (
              <p className="mt-1.5 text-[12px] text-destructive">{add.error.message}</p>
            )}
          </div>
        )}
      </form.Field>
      <Button type="submit" variant="outline" disabled={add.isPending}>
        <UserPlusIcon /> Добави гост
      </Button>
    </form>
  );
}
