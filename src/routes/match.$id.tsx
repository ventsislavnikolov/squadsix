import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  Ban,
  LoaderIcon,
  LockIcon,
  LockOpenIcon,
  RefreshCwIcon,
  Share2Icon,
} from "lucide-react";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { JevTrace } from "@/components/jev-trace";
import { PageHead, PANE, Section } from "@/components/page";
import { ProposalCard } from "@/components/proposal-card";
import { AnnounceShare, EventInfo, OwnerActions, SignupPanel } from "@/components/signup-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhoAmI } from "@/components/who-am-i";
import { hasStarted } from "@/domain/signup";
import { useI18n } from "@/lib/i18n";
import { matchdayQuery, pickListQuery } from "@/lib/queries";
import { shareText } from "@/lib/share";
import { useMe } from "@/lib/use-voter";
import { cn } from "@/lib/utils";
import { lock, rebalance, setResult, unlock, vote } from "@/server/functions";
import type { MatchdayView, RosterPlayer } from "@/server/repo";

export const Route = createFileRoute("/match/$id")({
  loader: async ({ context, params }) => {
    const [day] = await Promise.all([
      context.queryClient.ensureQueryData(matchdayQuery(params.id)),
      context.queryClient.ensureQueryData(pickListQuery),
    ]);
    if (!day) throw notFound();
  },
  component: MatchPage,
});

const MAX_RUNS = 3;

/**
 * One game, start to finish, on one page: the announcement and its list, then — once
 * there are teams — the three options and the vote, then the result.
 */
function MatchPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(matchdayQuery(id));
  const day = data!;
  const { t, name, error, isAdmin } = useI18n();
  const qc = useQueryClient();
  const [me] = useMe();

  const byId = new Map(day.players.map((p) => [p.id, p]));
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["matchday", id] }),
      // Locking or unlocking decides whether a new game can be started.
      qc.invalidateQueries({ queryKey: ["open-match"] }),
    ]);
  const cancelled = day.cancelledAt !== null;
  const locked = day.lockedAt !== null;
  const hasTeams = day.proposals.length > 0;
  const started = day.kind === "announced" && hasStarted(day.startsAt);
  const inSquad = new Set(day.squad);
  const meInSquad = inSquad.has(me);

  const cast = useMutation({
    mutationFn: (proposalId: string) => vote({ data: { matchdayId: id, proposalId, playerId: me } }),
    onSuccess: refresh,
  });
  const again = useMutation({ mutationFn: () => rebalance({ data: { id } }), onSuccess: refresh });
  const doLock = useMutation({ mutationFn: () => lock({ data: { id } }), onSuccess: refresh });
  const doUnlock = useMutation({ mutationFn: () => unlock({ data: { id } }), onSuccess: refresh });
  const failure = [cast, again, doLock, doUnlock].find((m) => m.isError)?.error;

  const votersOf = new Map<string, string[]>();
  for (const v of day.votes) {
    votersOf.set(v.proposalId, [...(votersOf.get(v.proposalId) ?? []), name(byId.get(v.playerId)?.name)]);
  }
  const top = Math.max(0, ...[...votersOf.values()].map((v) => v.length));
  const myVote = day.votes.find((v) => v.playerId === me)?.proposalId;
  const voted = new Set(day.votes.map((v) => v.playerId));
  const notVoted = day.squad.filter((pid) => !voted.has(pid)).map((pid) => byId.get(pid));
  const runsLeft = MAX_RUNS - day.runsUsed;
  const canRebalance = !locked && day.votes.length === 0 && runsLeft > 0 && day.squad.length === 12;

  const chosen = day.proposals.find((p) => p.id === day.lockedProposalId);
  // Who would win if locked now — same rule as the server: most votes, then Jev's order.
  const leader = [...day.proposals].sort(
    (x, y) =>
      (votersOf.get(y.id)?.length ?? 0) - (votersOf.get(x.id)?.length ?? 0) ||
      x.position - y.position,
  )[0];
  const proposals = chosen
    ? [chosen, ...day.proposals.filter((p) => p !== chosen)]
    : day.proposals;

  const when = day.startsAt ? t.when(day.startsAt) : t.date(day.playedOn);
  const title = cancelled
    ? t.event.cancelled
    : locked
      ? t.match.titleLocked
      : hasTeams
        ? t.match.titleOpen
        : when;

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead
        eyebrow={hasTeams || cancelled ? t.match.eyebrow(when) : t.nav.match}
        title={title}
        lead={
          cancelled
            ? day.cancelReason
            : locked
              ? t.match.leadLocked
              : hasTeams
                ? t.match.leadOpen
                : undefined
        }
        actions={
          <>
            {!cancelled && !locked && hasTeams && (
              <Button
                variant="outline"
                disabled={!canRebalance || again.isPending}
                title={
                  day.votes.length > 0 ? t.match.againBlockedVotes : t.match.againHint(runsLeft)
                }
                onClick={() => again.mutate()}
              >
                {again.isPending ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />}
                {t.match.again}
                <span className="font-mono text-[11px] text-fg/45">{runsLeft}/{MAX_RUNS}</span>
              </Button>
            )}
            {!cancelled && !locked && leader && day.squad.length === 12 && (
              <ConfirmButton
                disabled={doLock.isPending}
                title={t.match.lockTitle}
                description={t.match.lockBody(leader.position, (votersOf.get(leader.id) ?? []).length)}
                confirmLabel={t.match.lock}
                onConfirm={() => doLock.mutate()}
              >
                <LockIcon /> {t.match.lock}
              </ConfirmButton>
            )}
            {!cancelled && !locked && <AnnounceShare day={day} byId={byId} />}
            {!cancelled && locked && chosen && <ShareButton day={day} teams={chosen} byId={byId} />}
            {locked && isAdmin && !cancelled && (
              <ConfirmButton
                variant="ghost"
                disabled={doUnlock.isPending}
                title={t.match.unlockTitle}
                description={t.match.unlockBody}
                confirmLabel={t.match.unlock}
                onConfirm={() => doUnlock.mutate()}
              >
                <LockOpenIcon /> {t.match.unlock}
              </ConfirmButton>
            )}
            <OwnerActions day={day} />
          </>
        }
      />

      {cancelled && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/[0.07] px-4 py-3 text-[14px]">
          <Ban className="size-4 text-destructive" />
          {t.event.cancelled}
        </div>
      )}

      {(day.venue || day.note || day.changes || day.createdBy) && <EventInfo day={day} byId={byId} />}

      {isAdmin && day.run?.source === "fallback" && (
        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/[0.07] px-4 py-3 text-[13.5px]">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-warning">{t.match.fallbackTitle}</p>
            <p className="mt-1 text-fg/60">
              {day.run.error === "missing-key"
                ? t.match.fallbackMissingKey
                : t.match.fallbackError(day.run.error ?? "")}{" "}
              {t.match.fallbackTail}
            </p>
          </div>
        </div>
      )}

      {failure && <p className="text-[13px] text-destructive">{error(failure)}</p>}

      {/* Once locked there's no vote left; only say who you are if you already picked. */}
      {!cancelled && !started && (!locked || me) && <WhoAmI />}

      {!hasTeams && <SignupPanel day={day} byId={byId} />}

      {hasTeams && !cancelled && (
        <>
          {locked && chosen && (day.kind === "quick" || started) &&
            (isAdmin ? <ResultForm day={day} /> : day.winner && <ResultView day={day} />)}

          {!locked && me && !meInSquad && (
            <p className="text-[13px] text-fg/50">{t.match.notInSquad}</p>
          )}
          {!locked && notVoted.length > 0 && day.votes.length > 0 && (
            <p className="text-[12.5px] text-fg/45">
              {t.match.voted} {day.votes.length}/12 · {t.match.notVoted(notVoted.map((p) => name(p?.name)).join(", "))}
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-3">
            {proposals.map((p) => {
              const voters = votersOf.get(p.id) ?? [];
              return (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  byId={byId}
                  voters={voters}
                  leading={voters.length === top && top > 0}
                  mine={myVote === p.id}
                  chosen={p.id === day.lockedProposalId}
                  canVote={!locked && !started && meInSquad}
                  voting={cast.isPending}
                  onVote={() => cast.mutate(p.id)}
                />
              );
            })}
          </div>

          <SignupPanel day={day} byId={byId} />
        </>
      )}

      {/* The harness trace is for the admin, who is learning how Jev decides. */}
      {isAdmin && day.run && day.run.trace.length > 0 && (
        <Section title={t.match.howTitle} note={t.match.howNote}>
          <JevTrace steps={day.run.trace} />
        </Section>
      )}
    </div>
  );
}

/** The result as everyone else sees it: only the admin writes it. */
function ResultView({ day }: { day: MatchdayView }) {
  const { t } = useI18n();
  const score = day.scoreA !== null && day.scoreB !== null ? ` · ${day.scoreA}:${day.scoreB}` : "";
  const text =
    day.winner === "draw"
      ? t.common.draw
      : t.history.won(day.winner === "a" ? t.common.teamA : t.common.teamB);
  return (
    <Section title={t.match.result}>
      <p
        className={cn(
          "text-[17px] font-medium first-letter:uppercase",
          day.winner === "a" && "text-team-a",
          day.winner === "b" && "text-team-b",
        )}
      >
        {text + score}
      </p>
    </Section>
  );
}

function ResultForm({ day }: { day: MatchdayView }) {
  const { t, error } = useI18n();
  const qc = useQueryClient();
  const [picked, setPicked] = useState(day.winner);
  const [a, setA] = useState(day.scoreA?.toString() ?? "");
  const [b, setB] = useState(day.scoreB?.toString() ?? "");
  // A full score names the winner by itself; the buttons are for when nobody kept score.
  const fromScore =
    a === "" || b === "" ? null : Number(a) > Number(b) ? "a" : Number(a) < Number(b) ? "b" : "draw";
  const winner = fromScore ?? picked;
  const save = useMutation({
    mutationFn: () =>
      setResult({
        data: {
          id: day.id,
          winner: winner!,
          scoreA: a === "" ? null : Number(a),
          scoreB: b === "" ? null : Number(b),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["matchday", day.id] }),
  });

  const options = [
    { value: "a", label: t.common.teamA, tone: "text-team-a" },
    { value: "draw", label: t.common.draw, tone: "" },
    { value: "b", label: t.common.teamB, tone: "text-team-b" },
  ] as const;

  return (
    <Section title={t.match.result} note={t.match.resultNote}>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          {options.map((o) => (
            <Button
              key={o.value}
              variant={winner === o.value ? "default" : "outline"}
              className={cn(winner !== o.value && o.tone)}
              onClick={() => {
                setPicked(o.value);
                // Picking against the typed score means the score was wrong: drop it.
                if (fromScore && fromScore !== o.value) {
                  setA("");
                  setB("");
                }
              }}
            >
              {o.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 font-mono">
          <Input
            inputMode="numeric"
            className="w-16 text-center"
            value={a}
            onChange={(e) => setA(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="0"
          />
          <span className="text-fg/40">:</span>
          <Input
            inputMode="numeric"
            className="w-16 text-center"
            value={b}
            onChange={(e) => setB(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="0"
          />
        </div>
        <Button disabled={!winner || save.isPending} onClick={() => save.mutate()}>
          {t.common.save}
        </Button>
        {save.isSuccess && <span className="text-[12.5px] text-confirmed">{t.match.resultSaved}</span>}
        {save.isError && <span className="text-[12.5px] text-destructive">{error(save.error)}</span>}
      </div>
    </Section>
  );
}

/** Teams as text for the Messenger group: the phone's share sheet, or the clipboard. */
function ShareButton({
  day,
  teams,
  byId,
}: {
  day: MatchdayView;
  teams: { teamA: string[]; teamB: string[] };
  byId: Map<string, RosterPlayer>;
}) {
  const { t, name } = useI18n();
  const [copied, setCopied] = useState(false);
  const list = (ids: string[]) =>
    ids
      .map((id) => name(byId.get(id)?.name))
      .sort((x, y) => x.localeCompare(y))
      .join(", ");

  return (
    <Button
      variant="outline"
      onClick={async () => {
        const when = day.startsAt ? t.when(day.startsAt) : t.date(day.playedOn);
        const text = t.match.shareText(when, list(teams.teamA), list(teams.teamB));
        if ((await shareText(`${text}\n\n${window.location.href}`)) === "copied") {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      <Share2Icon /> {copied ? t.match.shared : t.match.share}
    </Button>
  );
}
