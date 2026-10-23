import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Empty, PageHead, PANE, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListSkeleton } from "@/components/skeletons";
import { useI18n } from "@/lib/i18n";
import { fullRosterQuery, rulesQuery, warm } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { addRule, removeRule } from "@/server/functions";
import type { RosterPlayer, RuleView } from "@/server/repo";

export const Route = createFileRoute("/admin/rules")({
  loader: ({ context }) => warm(context.queryClient, rulesQuery, fullRosterQuery),
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
      <Section title={title} note={note}>
        {list.length === 0 ? (
          <Empty>{t.rules.empty}</Empty>
        ) : (
          <div className="border-t border-fg/[0.07]">
            {list.map((r) => (
              <Row key={r.id} rule={r} byId={byId} />
            ))}
          </div>
        )}
        <AddRule kind={kind} roster={roster} />
      </Section>
    );
  };

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead eyebrow={t.admin.eyebrow} title={t.rules.title} lead={t.rules.lead} />
      {section("together", t.rules.together, t.rules.togetherNote)}
      {section("apart", t.rules.apart, t.rules.apartNote)}
    </div>
  );
}

function Row({ rule, byId }: { rule: RuleView; byId: Map<string, RosterPlayer> }) {
  const { t, name, error } = useI18n();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeRule({ data: { id: rule.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-fg/[0.07] py-3 text-[14px]">
      <span className="min-w-0 flex-1">
        {rule.players.map((id, i) => {
          const p = byId.get(id);
          return (
            <span key={id}>
              {i > 0 && (
                <span className="px-2 text-fg/35">{rule.kind === "together" ? "+" : "↔"}</span>
              )}
              <span className={cn(p?.hidden && "text-fg/40")}>
                {name(p?.name)}
                {p?.hidden && <span className="ml-1 text-[11px]">({t.rules.hidden})</span>}
              </span>
            </span>
          );
        })}
      </span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t.rules.remove}
        disabled={remove.isPending}
        onClick={() => remove.mutate()}
      >
        <XIcon />
      </Button>
      {remove.isError && <p className="w-full text-[12px] text-destructive">{error(remove.error)}</p>}
    </div>
  );
}

const NONE = "none";

/** Two pickers for Apart, three for Together (the third optional). */
function AddRule({ kind, roster }: { kind: Kind; roster: RosterPlayer[] }) {
  const { t, name, error } = useI18n();
  const qc = useQueryClient();
  const slots = kind === "together" ? 3 : 2;
  const [picked, setPicked] = useState<string[]>(() => Array(slots).fill(NONE));
  const chosen = picked.filter((id) => id !== NONE);
  const valid = chosen.length >= 2 && new Set(chosen).size === chosen.length;
  // Hidden players keep their rules but can't be given new ones.
  const options = roster.filter((p) => !p.hidden);

  const add = useMutation({
    mutationFn: () => addRule({ data: { kind, players: chosen } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["rules"] });
      setPicked(Array(slots).fill(NONE));
    },
  });

  return (
    <div className="mt-4 space-y-2">
      <div
        className={cn(
          "grid gap-2",
          slots === 3
            ? "sm:grid-cols-[repeat(3,minmax(0,14rem))_auto]"
            : "sm:grid-cols-[repeat(2,minmax(0,14rem))_auto]",
        )}
      >
        {picked.map((value, i) => (
          <Select
            key={i}
            value={value}
            onValueChange={(v) => setPicked((cur) => cur.map((x, j) => (j === i ? v : x)))}
          >
            <SelectTrigger className="w-full" aria-label={t.rules.pick}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-fg/45">
                {i === 2 ? t.rules.optional : t.rules.pick}
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
        ))}
        <Button disabled={!valid || add.isPending} onClick={() => add.mutate()}>
          <PlusIcon /> {t.rules.add}
        </Button>
      </div>
      {add.isError && <p className="text-[12px] text-destructive">{error(add.error)}</p>}
    </div>
  );
}
