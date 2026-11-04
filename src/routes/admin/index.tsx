import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOutIcon, PlusIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useId, useState } from "react";
import { PANE, PageHead, Section } from "@/components/page";
import { ListSkeleton } from "@/components/skeletons";
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

type Draft = PersonName & {
  rating: number | null;
  isGuest: boolean;
  hidden: boolean;
};

const EMPTY: Draft = {
  firstBg: "",
  lastBg: "",
  firstEn: "",
  lastEn: "",
  rating: null,
  isGuest: false,
  hidden: false,
};

const patch =
  <K extends keyof Draft>(key: K, value: Draft[K]) =>
  (d: Draft): Draft => ({ ...d, [key]: value });

// Fill the other script when one is typed and the other is still empty.
const fillFrom =
  (from: "bg" | "en") =>
  (d: Draft): Draft =>
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
      qc.removeQueries({ queryKey: ["rules"] });
      await qc.invalidateQueries();
    },
  });

  const { mutate: signOut } = out;
  const onAdd = useCallback(() => setAdding(true), []);
  const onAdded = useCallback(() => setAdding(false), []);
  const onSignOut = useCallback(() => signOut(), [signOut]);

  const regulars = roster.filter((p) => !p.isGuest);
  const guests = roster.filter((p) => p.isGuest);
  const unrated = roster.filter((p) => !p.hidden && p.rating === null).length;

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead
        actions={
          <>
            <Button disabled={adding} onClick={onAdd}>
              <PlusIcon /> {t.admin.add}
            </Button>
            <Button onClick={onSignOut} variant="ghost">
              <LogOutIcon /> {t.nav.signOut}
            </Button>
          </>
        }
        eyebrow={t.admin.eyebrow}
        lead={
          <>
            {t.admin.lead}
            {unrated > 0 && (
              <span className="mt-1 block text-warning">
                {t.admin.unratedCount(unrated)}
              </span>
            )}
          </>
        }
        title={t.admin.title}
      />

      {adding ? (
        <Section title={t.admin.addTitle}>
          <Editor initial={EMPTY} onDone={onAdded} />
        </Section>
      ) : null}

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
      {players.map((p) =>
        // The admin's roster always carries the full names.
        p.full ? (
          <Editor
            id={p.id}
            initial={{
              ...p.full,
              rating: p.rating ?? null,
              isGuest: p.isGuest,
              hidden: p.hidden,
            }}
            key={p.id}
            lastPlayed={p.lastPlayed}
            shown={p.name}
          />
        ) : null
      )}
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
  const guestId = useId();
  const hiddenId = useId();

  const save = useMutation({
    mutationFn: () => savePlayer({ data: { ...draft, id } }),
    onSuccess: async () => {
      // Names, ratings and who can be picked all derive from this row.
      await qc.invalidateQueries();
      onDone?.();
    },
  });

  const { mutate } = save;
  const onSave = useCallback(() => mutate(), [mutate]);
  const onBlurBg = useCallback(() => setDraft(fillFrom("bg")), []);
  const onBlurEn = useCallback(() => setDraft(fillFrom("en")), []);
  const onFirstBg = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      setDraft(patch("firstBg", e.target.value)),
    []
  );
  const onLastBg = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      setDraft(patch("lastBg", e.target.value)),
    []
  );
  const onFirstEn = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      setDraft(patch("firstEn", e.target.value)),
    []
  );
  const onLastEn = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      setDraft(patch("lastEn", e.target.value)),
    []
  );
  const onRating = useCallback(
    (v: string) => setDraft(patch("rating", v === "none" ? null : Number(v))),
    []
  );
  const onGuest = useCallback(
    (v: boolean) => setDraft(patch("isGuest", v)),
    []
  );
  const onHidden = useCallback(
    (v: boolean) => setDraft(patch("hidden", v)),
    []
  );

  return (
    <div
      className={cn(
        "grid grid-cols-2 items-center gap-2 border-b border-fg/[0.07] py-3 sm:grid-cols-[1fr_1fr_1fr_1fr_7.5rem_auto]",
        draft.hidden && "opacity-50"
      )}
    >
      <Input
        aria-label={t.admin.firstBg}
        onBlur={onBlurBg}
        onChange={onFirstBg}
        placeholder={t.admin.firstBg}
        value={draft.firstBg}
      />
      <Input
        aria-label={t.admin.lastBg}
        onBlur={onBlurBg}
        onChange={onLastBg}
        placeholder={t.admin.lastBg}
        value={draft.lastBg}
      />
      <Input
        aria-label={t.admin.firstEn}
        onBlur={onBlurEn}
        onChange={onFirstEn}
        placeholder={t.admin.firstEn}
        value={draft.firstEn}
      />
      <Input
        aria-label={t.admin.lastEn}
        onBlur={onBlurEn}
        onChange={onLastEn}
        placeholder={t.admin.lastEn}
        value={draft.lastEn}
      />
      <Select
        onValueChange={onRating}
        value={draft.rating === null ? "none" : String(draft.rating)}
      >
        <SelectTrigger
          aria-label={t.admin.rating}
          className={cn(
            "w-full font-mono",
            draft.rating === null && "text-warning"
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem title={t.common.unrated} value="none">
            ?
          </SelectItem>
          {RATING_STEPS.map((r) => (
            <SelectItem className="font-mono" key={r} value={String(r)}>
              {r.toFixed(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center justify-end gap-3">
        <label
          className="flex items-center gap-1.5 text-[12px] text-fg/55"
          htmlFor={guestId}
        >
          <Switch
            checked={draft.isGuest}
            id={guestId}
            onCheckedChange={onGuest}
          />
          {t.admin.guest}
        </label>
        <label
          className="flex items-center gap-1.5 text-[12px] text-fg/55"
          htmlFor={hiddenId}
        >
          <Switch
            checked={draft.hidden}
            id={hiddenId}
            onCheckedChange={onHidden}
          />
          {t.admin.hidden}
        </label>
        {/* Only the row you touched offers to save; the others stay quiet. */}
        <Button
          className={cn(!dirty && "invisible")}
          disabled={!(dirty && valid) || save.isPending}
          onClick={onSave}
          size="sm"
        >
          {t.common.save}
        </Button>
        {onDone ? (
          <Button onClick={onDone} size="sm" variant="ghost">
            {t.common.cancel}
          </Button>
        ) : null}
      </div>
      {shown || save.isError ? (
        <p className="col-span-full font-mono text-[11px] text-fg/40">
          {shown ? (
            <>
              {t.admin.shown}: {name(shown)} · {t.admin.lastPlayed}:{" "}
              {lastPlayed ? t.date(lastPlayed, "short") : t.admin.never}
            </>
          ) : null}
          {save.isError ? (
            <span className="ml-2 text-destructive">{error(save.error)}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
