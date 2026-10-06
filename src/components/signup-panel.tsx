import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  CircleDotIcon,
  LoaderIcon,
  MapPinIcon,
  PencilIcon,
  Share2Icon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SQUAD_SIZE } from "@/domain/balance";
import { guestsOpen, guestsOpenAt, hasStarted } from "@/domain/signup";
import { useI18n } from "@/lib/i18n";
import { shareUrl } from "@/lib/preview";
import { ballsQuery, pickListQuery } from "@/lib/queries";
import { shareText } from "@/lib/share";
import { useMe } from "@/lib/use-voter";
import { cn } from "@/lib/utils";
import { addGuest, cancelMatch, makeTeams, signUp, withdraw } from "@/server/functions";
import type { MatchdayView, RosterPlayer } from "@/server/repo";

/** Refetch this game and whatever depends on whether a game is open. */
function useRefresh(id: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["matchday", id] }),
      qc.invalidateQueries({ queryKey: ["open-match"] }),
      qc.invalidateQueries({ queryKey: ["pick-list"] }),
    ]);
}

/* ------------------------------------------------------------------- event info -- */

/** Where, the note, who announced it, and what changed since — above everything else. */
export function EventInfo({ day, byId }: { day: MatchdayView; byId: Map<string, RosterPlayer> }) {
  const { t, name } = useI18n();
  const creator = day.createdBy ? byId.get(day.createdBy) : undefined;
  // Whoever has the balls has to bring them; they may not be on this game's list.
  const { data: trail = [] } = useQuery(ballsQuery);
  const { data: everyone = [] } = useQuery(pickListQuery);
  const holderId = trail[0]?.playerId;
  const holder = holderId ? (byId.get(holderId) ?? everyone.find((p) => p.id === holderId)) : undefined;
  return (
    <div className="space-y-3">
      {day.venue && (
        <p className="flex flex-wrap items-center gap-3 text-[15px]">
          <MapPinIcon className="size-4 text-primary" />
          <span className="font-medium">{day.venue.name}</span>
          {day.venue.mapUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={day.venue.mapUrl} target="_blank" rel="noreferrer">
                {t.event.map}
              </a>
            </Button>
          )}
        </p>
      )}
      {day.note && <p className="max-w-[44rem] text-[14px] text-fg/70">{day.note}</p>}
      {day.changes && day.changes.length > 0 && (
        <p className="inline-block rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-1.5 text-[13px]">
          <span className="font-medium text-warning">{t.event.changed}:</span>{" "}
          {day.changes
            .map((c) => `${t.event.field[c.field]} ${c.from || "—"} → ${c.to || "—"}`)
            .join(" · ")}
        </p>
      )}
      {holder && !day.cancelledAt && (
        <p className="flex items-center gap-3 text-[14px]">
          <CircleDotIcon className="size-4 text-primary" />
          <Link to="/balls" className="underline-offset-4 hover:underline">
            {t.balls.title(name(holder.name))}
          </Link>
        </p>
      )}
      {creator && day.kind === "announced" && (
        <p className="text-[12.5px] text-fg/45">{t.event.by(name(creator.name))}</p>
      )}
    </div>
  );
}

/** Edit and cancel. The server lets whoever announced the game do both; the buttons are admin-only. */
export function OwnerActions({ day }: { day: MatchdayView }) {
  const { t, error, isAdmin } = useI18n();
  const [me] = useMe();
  const refresh = useRefresh(day.id);
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: () =>
      cancelMatch({ data: { id: day.id, actorId: me || null, reason: reason.trim() || null } }),
    onSuccess: refresh,
  });

  if (!isAdmin || day.cancelledAt) return null;
  const editable = !day.lockedAt && !hasStarted(day.startsAt) && day.kind === "announced";

  return (
    <>
      {editable && (
        <Button asChild variant="outline">
          <Link to="/edit/$id" params={{ id: day.id }}>
            <PencilIcon /> {t.event.edit}
          </Link>
        </Button>
      )}
      <ConfirmButton
        variant="ghost"
        disabled={cancel.isPending}
        title={t.event.cancelTitle}
        description={
          <>
            {t.event.cancelBody}
            <Input
              className="mt-3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.event.cancelReason}
              maxLength={200}
            />
          </>
        }
        confirmLabel={t.event.cancel}
        onConfirm={() => cancel.mutate()}
      >
        <Ban /> {t.event.cancel}
      </ConfirmButton>
      {cancel.isError && <p className="text-[13px] text-destructive">{error(cancel.error)}</p>}
    </>
  );
}

/** The announcement as Messenger text: when, where, the numbered list, reserves, link. */
export function AnnounceShare({ day, byId }: { day: MatchdayView; byId: Map<string, RosterPlayer> }) {
  const { t, name } = useI18n();
  const [copied, setCopied] = useState(false);
  const lines = day.signups.map((s, i) => `${i + 1}. ${name(byId.get(s.playerId)?.name)}`);
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const text = t.event.shareText(
          day.startsAt ? t.when(day.startsAt) : t.date(day.playedOn),
          day.venue?.name ?? "",
          lines.slice(0, SQUAD_SIZE).join("\n"),
          lines.slice(SQUAD_SIZE).join("\n"),
          shareUrl(day),
        );
        if ((await shareText(text)) === "copied") {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      <Share2Icon /> {copied ? t.event.shared : t.event.share}
    </Button>
  );
}

/* ---------------------------------------------------------------------- the list -- */

export function SignupPanel({ day, byId }: { day: MatchdayView; byId: Map<string, RosterPlayer> }) {
  const { t, name, error, isAdmin } = useI18n();
  const [me] = useMe();
  const refresh = useRefresh(day.id);

  const onList = day.signups.some((s) => s.playerId === me);
  const closed =
    !!day.cancelledAt || (day.kind === "announced" && hasStarted(day.startsAt));
  const hasTeams = day.proposals.length > 0;
  const count = Math.min(day.signups.length, SQUAD_SIZE);

  const join = useMutation({
    mutationFn: () => signUp({ data: { matchdayId: day.id, playerId: me, actorId: me } }),
    onSuccess: refresh,
  });
  const leave = useMutation({
    mutationFn: (playerId: string) =>
      withdraw({ data: { matchdayId: day.id, playerId, actorId: me || null } }),
    onSuccess: refresh,
  });
  const teams = useMutation({
    mutationFn: () => makeTeams({ data: { id: day.id } }),
    onSuccess: refresh,
  });
  const failure = [join, leave, teams].find((m) => m.isError)?.error;

  const canRemove = (playerId: string, addedBy: string | null) =>
    !closed && (isAdmin || (!!me && (me === playerId || me === addedBy)));

  const row = (s: MatchdayView["signups"][number], i: number) => {
    const p = byId.get(s.playerId);
    const adder = s.addedBy ? byId.get(s.addedBy) : undefined;
    return (
      <li
        key={s.playerId}
        className={cn(
          "flex items-center gap-3 border-b border-fg/[0.07] py-2 text-[14px]",
          s.playerId === me && "font-medium",
        )}
      >
        <span className="w-6 shrink-0 text-right font-mono text-[12px] tabular-nums text-fg/40">
          {i + 1}.
        </span>
        <span className="min-w-0 flex-1 truncate">
          {name(p?.name)}
          {p?.isGuest && <span className="ml-1.5 text-[11px] text-fg/40">{t.signup.guestTag}</span>}
          {s.playerId === me && <span className="ml-1.5 text-[11px] text-primary">{t.signup.you}</span>}
          {adder && (
            <span className="ml-2 text-[11.5px] font-normal text-fg/40">
              {t.signup.addedBy(name(adder.name))}
            </span>
          )}
        </span>
        {canRemove(s.playerId, s.addedBy) && (
          <button
            type="button"
            title={t.signup.remove}
            aria-label={`${t.signup.remove} ${name(p?.name)}`}
            disabled={leave.isPending}
            onClick={() => leave.mutate(s.playerId)}
            className="grid size-7 place-items-center rounded-md text-fg/35 hover:bg-fg/[0.06] hover:text-destructive"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </li>
    );
  };

  const squad = day.signups.slice(0, SQUAD_SIZE);
  const reserves = day.signups.slice(SQUAD_SIZE);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-baseline gap-3 text-[1.1rem] font-medium">
          <UsersIcon className="size-4 self-center text-fg/50" />
          {t.signup.title}
          <span className={cn("font-mono text-[14px] tabular-nums", count === SQUAD_SIZE ? "text-confirmed" : "text-fg/50")}>
            {t.signup.count(count)}
          </span>
        </h2>
        {!closed && me && (
          <div className="flex flex-wrap gap-2">
            {onList ? (
              <Button variant="outline" disabled={leave.isPending} onClick={() => leave.mutate(me)}>
                {t.signup.leave}
              </Button>
            ) : (
              <Button disabled={join.isPending} onClick={() => join.mutate()}>
                {join.isPending ? <LoaderIcon className="animate-spin" /> : <UserPlusIcon />}
                {t.signup.join}
              </Button>
            )}
            <AddOther day={day} onDone={refresh} />
          </div>
        )}
      </div>

      {failure && <p className="text-[13px] text-destructive">{error(failure)}</p>}
      {closed && !day.cancelledAt && <p className="text-[13px] text-fg/50">{t.signup.closed}</p>}

      {day.signups.length === 0 ? (
        <p className="text-[13.5px] text-fg/50">{t.signup.empty}</p>
      ) : (
        <ol className="max-w-xl">{squad.map(row)}</ol>
      )}

      {reserves.length > 0 && (
        <div className="max-w-xl">
          <p className="eyebrow mt-2">{t.signup.reserves}</p>
          <ol className="mt-2">{reserves.map((s, i) => row(s, SQUAD_SIZE + i))}</ol>
        </div>
      )}

      {!hasTeams && !day.lockedAt && !day.cancelledAt && (
        <div className="max-w-xl rounded-xl border border-fg/[0.08] bg-card p-4">
          {count < SQUAD_SIZE ? (
            <p className="text-[13.5px] text-fg/60">{t.signup.needMore(SQUAD_SIZE - count)}</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13.5px]">{t.signup.full}</p>
                {day.kind === "announced" && (
                  <p className="mt-1 text-[12.5px] text-fg/45">{t.signup.autoTeams}</p>
                )}
              </div>
              <Button disabled={teams.isPending} onClick={() => teams.mutate()}>
                {teams.isPending && <LoaderIcon className="animate-spin" />}
                {teams.isPending ? t.pick.thinking : t.signup.makeTeams}
              </Button>
            </div>
          )}
        </div>
      )}

      {day.lockedAt && day.squad.length < SQUAD_SIZE && (
        <p className="text-[13.5px] text-warning">{t.signup.needMore(SQUAD_SIZE - day.squad.length)}</p>
      )}
    </section>
  );
}

/** Sign up someone else — from the list, or a guest typed in. */
function AddOther({ day, onDone }: { day: MatchdayView; onDone: () => unknown }) {
  const { t, name, error, isAdmin } = useI18n();
  const [me] = useMe();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [guest, setGuest] = useState("");
  const { data: roster = [] } = useQuery(pickListQuery);
  const onList = new Set(day.signups.map((s) => s.playerId));
  // Guests only in the last 24 hours before an announced game (the server checks too).
  const guestsFrom = day.kind === "announced" ? guestsOpenAt(day.startsAt) : null;
  const guestsAllowed = isAdmin || day.kind !== "announced" || guestsOpen(day.startsAt);

  const add = useMutation({
    mutationFn: async (target: { playerId: string } | { guest: string }) => {
      const playerId =
        "playerId" in target ? target.playerId : (await addGuest({ data: { name: target.guest } })).id;
      await signUp({ data: { matchdayId: day.id, playerId, actorId: me } });
    },
    onSuccess: async () => {
      setGuest("");
      setFilter("");
      setOpen(false);
      await onDone();
    },
  });

  const q = filter.trim().toLocaleLowerCase();
  const candidates = roster.filter(
    (p) =>
      !onList.has(p.id) &&
      (guestsAllowed || !p.isGuest) &&
      (!q || p.name.bg.toLocaleLowerCase().includes(q) || p.name.en.toLowerCase().includes(q)),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlusIcon /> {t.signup.addOther}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md gap-5 bg-card">
        <DialogHeader>
          <DialogTitle>{t.signup.addOtherTitle}</DialogTitle>
          <DialogDescription>{t.signup.addOtherNote}</DialogDescription>
        </DialogHeader>
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.pick.search} />
        <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
          {candidates.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant="outline"
              disabled={add.isPending}
              onClick={() => add.mutate({ playerId: p.id })}
            >
              {name(p.name)}
            </Button>
          ))}
        </div>
        {!guestsAllowed && guestsFrom !== null && (
          <p className="border-t border-fg/[0.08] pt-4 text-[13px] text-fg/55">
            {t.signup.guestsLater(t.when(new Date(guestsFrom).toISOString()))}
          </p>
        )}
        <form
          className={cn("flex gap-2 border-t border-fg/[0.08] pt-4", !guestsAllowed && "hidden")}
          onSubmit={(e) => {
            e.preventDefault();
            if (guest.trim().length >= 2) add.mutate({ guest: guest.trim() });
          }}
        >
          <Input
            value={guest}
            onChange={(e) => setGuest(e.target.value)}
            placeholder={t.pick.guestPlaceholder}
            maxLength={60}
          />
          <Button type="submit" variant="outline" disabled={add.isPending || guest.trim().length < 2}>
            {t.pick.addGuest}
          </Button>
        </form>
        {add.isError && <p className="text-[13px] text-destructive">{error(add.error)}</p>}
      </DialogContent>
    </Dialog>
  );
}
