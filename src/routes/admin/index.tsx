import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOutIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { PageHead, PANE, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RATING_STEPS } from "@/domain/balance";
import { bgToEn, enToBg, type PersonName } from "@/domain/names";
import { ListSkeleton } from "@/components/skeletons";
import { useI18n } from "@/lib/i18n";
import { fullRosterQuery, warm } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { logout, savePlayer } from "@/server/functions";
import type { RosterPlayer } from "@/server/repo";

export const Route = createFileRoute("/admin/")({
  loader: ({ context }) => warm(context.queryClient, fullRosterQuery),
  pendingComponent: ListSkeleton,
  component: Players,
});

type Draft = PersonName & { rating: number | null; isGuest: boolean; hidden: boolean };

const EMPTY: Draft = {
  firstBg: "",
  lastBg: "",
  firstEn: "",
  lastEn: "",
  rating: null,
  isGuest: false,
  hidden: false,
};

function Players() {
  const { t } = useI18n();
  const { data: roster } = useSuspenseQuery(fullRosterQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  const out = useMutation({
    mutationFn: () => logout(),
    onSuccess: async () => {
      // Leave the admin pages first: refetching their data now would be refused.
      await navigate({ to: "/" });
      qc.removeQueries({ queryKey: ["full-roster"] });
      qc.removeQueries({ queryKey: ["log"] });
      await qc.invalidateQueries();
    },
  });

  const regulars = roster.filter((p) => !p.isGuest);
  const guests = roster.filter((p) => p.isGuest);
  const unrated = roster.filter((p) => !p.hidden && p.rating === null).length;

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead
        eyebrow={t.admin.eyebrow}
        title={t.admin.title}
        lead={
          <>
            {t.admin.lead}
            {unrated > 0 && <span className="mt-1 block text-warning">{t.admin.unratedCount(unrated)}</span>}
          </>
        }
        actions={
          <>
            <Button onClick={() => setAdding(true)} disabled={adding}>
              <PlusIcon /> {t.admin.add}
            </Button>
            <Button variant="ghost" onClick={() => out.mutate()}>
              <LogOutIcon /> {t.nav.signOut}
            </Button>
          </>
        }
      />

      {adding && (
        <Section title={t.admin.addTitle}>
          <Editor initial={EMPTY} onDone={() => setAdding(false)} />
        </Section>
      )}

      <Section title={t.pick.regulars}>
        <Table players={regulars} />
      </Section>
      {guests.length > 0 && (
        <Section title={t.pick.guests}>
          <Table players={guests} />
        </Section>
      )}
    </div>
  );
}

function Table({ players }: { players: RosterPlayer[] }) {
  return (
    <div className="border-t border-fg/[0.07]">
      {players.map((p) => (
        <Editor
          key={p.id}
          id={p.id}
          shown={p.name}
          lastPlayed={p.lastPlayed}
          initial={{ ...p.full!, rating: p.rating ?? null, isGuest: p.isGuest, hidden: p.hidden }}
        />
      ))}
    </div>
  );
}

/** One player as an editable row. Saves only what changed, one row at a time. */
function Editor({
  id,
  initial,
  shown,
  lastPlayed,
  onDone,
}: {
  id?: string;
  initial: Draft;
  shown?: { bg: string; en: string };
  lastPlayed?: string | null;
  onDone?: () => void;
}) {
  const { t, name, error } = useI18n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const valid = draft.firstBg.trim() !== "" && draft.firstEn.trim() !== "";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: () => savePlayer({ data: { ...draft, id } }),
    onSuccess: async () => {
      // Names, ratings and who can be picked all derive from this row.
      await qc.invalidateQueries();
      onDone?.();
    },
  });

  // Fill the other script when one is typed and the other is still empty.
  const fill = (from: "bg" | "en") => {
    setDraft((d) =>
      from === "bg"
        ? {
            ...d,
            firstEn: d.firstEn || bgToEn(d.firstBg),
            lastEn: d.lastEn || bgToEn(d.lastBg),
          }
        : {
            ...d,
            firstBg: d.firstBg || enToBg(d.firstEn),
            lastBg: d.lastBg || enToBg(d.lastEn),
          },
    );
  };

  return (
    <div
      className={cn(
        "grid grid-cols-2 items-center gap-2 border-b border-fg/[0.07] py-3 sm:grid-cols-[1fr_1fr_1fr_1fr_7.5rem_auto]",
        draft.hidden && "opacity-50",
      )}
    >
      <Input aria-label={t.admin.firstBg} placeholder={t.admin.firstBg} value={draft.firstBg} onChange={(e) => set("firstBg", e.target.value)} onBlur={() => fill("bg")} />
      <Input aria-label={t.admin.lastBg} placeholder={t.admin.lastBg} value={draft.lastBg} onChange={(e) => set("lastBg", e.target.value)} onBlur={() => fill("bg")} />
      <Input aria-label={t.admin.firstEn} placeholder={t.admin.firstEn} value={draft.firstEn} onChange={(e) => set("firstEn", e.target.value)} onBlur={() => fill("en")} />
      <Input aria-label={t.admin.lastEn} placeholder={t.admin.lastEn} value={draft.lastEn} onChange={(e) => set("lastEn", e.target.value)} onBlur={() => fill("en")} />
      <Select
        value={draft.rating === null ? "none" : String(draft.rating)}
        onValueChange={(v) => set("rating", v === "none" ? null : Number(v))}
      >
        <SelectTrigger
          aria-label={t.admin.rating}
          className={cn("w-full font-mono", draft.rating === null && "text-warning")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" title={t.common.unrated}>?</SelectItem>
          {RATING_STEPS.map((r) => (
            <SelectItem key={r} value={String(r)} className="font-mono">
              {r.toFixed(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center justify-end gap-3">
        <label className="flex items-center gap-1.5 text-[12px] text-fg/55">
          <Switch checked={draft.isGuest} onCheckedChange={(v) => set("isGuest", v)} />
          {t.admin.guest}
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-fg/55">
          <Switch checked={draft.hidden} onCheckedChange={(v) => set("hidden", v)} />
          {t.admin.hidden}
        </label>
        {/* Only the row you touched offers to save; the others stay quiet. */}
        <Button
          size="sm"
          className={cn(!dirty && "invisible")}
          disabled={!dirty || !valid || save.isPending}
          onClick={() => save.mutate()}
        >
          {t.common.save}
        </Button>
        {onDone && (
          <Button size="sm" variant="ghost" onClick={onDone}>
            {t.common.cancel}
          </Button>
        )}
      </div>
      {(shown || save.isError) && (
        <p className="col-span-full font-mono text-[11px] text-fg/40">
          {shown && (
            <>
              {t.admin.shown}: {name(shown)} · {t.admin.lastPlayed}:{" "}
              {lastPlayed ? t.date(lastPlayed, "short") : t.admin.never}
            </>
          )}
          {save.isError && <span className="ml-2 text-destructive">{error(save.error)}</span>}
        </p>
      )}
    </div>
  );
}
