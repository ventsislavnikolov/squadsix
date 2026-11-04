import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon, XIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Empty, PANE, PageHead, Section } from "@/components/page";
import { ListSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { fullRosterQuery, rulesQuery, warm } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { addRule, removeRule } from "@/server/functions";
import type { RosterPlayer, RuleView } from "@/server/repo";

export const Route = createFileRoute("/admin/rules")({
  loader: ({ context }) =>
    warm(context.queryClient, rulesQuery, fullRosterQuery),
  pendingComponent: ListSkeleton,
  component: Rules,
});

type Kind = RuleView["kind"];

function Rules() {
  const { t } = useI18n();
  const { data: rules } = useSuspenseQuery(rulesQuery);
  const { data: roster } = useSuspenseQuery(fullRosterQuery);
  const byId = new Map(roster.map((p) => [p.id, p]));

  const section = (kind: Kind, title: string, note: string) => {
    const list = rules.filter((r) => r.kind === kind);
    return (
      <Section note={note} title={title}>
        {list.length === 0 ? (
          <Empty>{t.rules.empty}</Empty>
        ) : (
          <div className="border-t border-fg/[0.07]">
            {list.map((r) => (
              <Row byId={byId} key={r.id} rule={r} />
            ))}
          </div>
        )}
        <AddRule kind={kind} roster={roster} />
      </Section>
    );
  };

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead
        eyebrow={t.admin.eyebrow}
        lead={t.rules.lead}
        title={t.rules.title}
      />
      {section("together", t.rules.together, t.rules.togetherNote)}
      {section("apart", t.rules.apart, t.rules.apartNote)}
    </div>
  );
}

function Row({
  rule,
  byId,
}: {
  rule: RuleView;
  byId: Map<string, RosterPlayer>;
}) {
  const { t, name, error } = useI18n();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeRule({ data: { id: rule.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });
  const { mutate } = remove;
  const onRemove = useCallback(() => mutate(), [mutate]);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-fg/[0.07] py-3 text-[14px]">
      <span className="min-w-0 flex-1">
        {rule.players.map((id, i) => {
          const p = byId.get(id);
          return (
            <span key={id}>
              {i > 0 ? (
                <span className="px-2 text-fg/35">
                  {rule.kind === "together" ? "+" : "↔"}
                </span>
              ) : null}
              <span className={cn(p?.hidden && "text-fg/40")}>
                {name(p?.name)}
                {p?.hidden ? (
                  <span className="ml-1 text-[11px]">({t.rules.hidden})</span>
                ) : null}
              </span>
            </span>
          );
        })}
      </span>
      <Button
        aria-label={t.rules.remove}
        disabled={remove.isPending}
        onClick={onRemove}
        size="sm"
        variant="ghost"
      >
        <XIcon />
      </Button>
      {remove.isError ? (
        <p className="w-full text-[12px] text-destructive">
          {error(remove.error)}
        </p>
      ) : null}
    </div>
  );
}

const NONE = "none";
// The picker positions: a Together rule has a third, optional one.
const SLOTS: Record<Kind, number[]> = { together: [0, 1, 2], apart: [0, 1] };

/** Two pickers for Apart, three for Together (the third optional). */
function AddRule({ kind, roster }: { kind: Kind; roster: RosterPlayer[] }) {
  const { t, error } = useI18n();
  const qc = useQueryClient();
  const slots = SLOTS[kind].length;
  const [picked, setPicked] = useState<string[]>(() =>
    new Array(slots).fill(NONE)
  );
  const chosen = picked.filter((id) => id !== NONE);
  const valid = chosen.length >= 2 && new Set(chosen).size === chosen.length;
  // Hidden players keep their rules but can't be given new ones.
  const options = roster.filter((p) => !p.hidden);

  const add = useMutation({
    mutationFn: () => addRule({ data: { kind, players: chosen } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["rules"] });
      setPicked(new Array(slots).fill(NONE));
    },
  });
  const { mutate } = add;
  const onAdd = useCallback(() => mutate(), [mutate]);
  const onPick = useCallback(
    (slot: number, id: string) =>
      setPicked((cur) => cur.map((x, j) => (j === slot ? id : x))),
    []
  );

  return (
    <div className="mt-4 space-y-2">
      <div
        className={cn(
          "grid gap-2",
          slots === 3
            ? "sm:grid-cols-[repeat(3,minmax(0,14rem))_auto]"
            : "sm:grid-cols-[repeat(2,minmax(0,14rem))_auto]"
        )}
      >
        {SLOTS[kind].map((slot) => (
          <SlotPicker
            key={slot}
            onPick={onPick}
            options={options}
            picked={picked}
            slot={slot}
          />
        ))}
        <Button disabled={!valid || add.isPending} onClick={onAdd}>
          <PlusIcon /> {t.rules.add}
        </Button>
      </div>
      {add.isError ? (
        <p className="text-[12px] text-destructive">{error(add.error)}</p>
      ) : null}
    </div>
  );
}

/** One player picker; offers whoever isn't already picked in another slot. */
function SlotPicker({
  slot,
  picked,
  options,
  onPick,
}: {
  slot: number;
  picked: string[];
  options: RosterPlayer[];
  onPick: (slot: number, id: string) => void;
}) {
  const { t, name } = useI18n();
  const value = picked[slot] ?? NONE;
  const onValueChange = useCallback(
    (id: string) => onPick(slot, id),
    [onPick, slot]
  );
  return (
    <Select onValueChange={onValueChange} value={value}>
      <SelectTrigger aria-label={t.rules.pick} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem className="text-fg/45" value={NONE}>
          {slot === 2 ? t.rules.optional : t.rules.pick}
        </SelectItem>
        {options
          .filter((p) => p.id === value || !picked.includes(p.id))
          .map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {name(p.name)}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
