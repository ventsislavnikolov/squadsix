import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  LoaderIcon,
  LockIcon,
  LockOpenIcon,
  RefreshCwIcon,
  Share2Icon,
} from "lucide-react";
import { useState } from "react";
import { JevTrace } from "@/components/jev-trace";
import { Figure, PageHead, PANE, Section } from "@/components/page";
import { ProposalCard } from "@/components/proposal-card";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SQUAD_SIZE } from "@/domain/balance";
import { useI18n } from "@/lib/i18n";
import { matchdayQuery } from "@/lib/queries";
import { useMe } from "@/lib/use-voter";
import { cn } from "@/lib/utils";
import { lock, rebalance, setResult, unlock, vote } from "@/server/functions";
import type { MatchdayView, RosterPlayer } from "@/server/repo";

export const Route = createFileRoute("/match/$id")({
  loader: async ({ context, params }) => {
    const day = await context.queryClient.ensureQueryData(matchdayQuery(params.id));
    if (!day) throw notFound();
  },
  component: MatchPage,
});

const MAX_RUNS = 3;

function MatchPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(matchdayQuery(id));
  const day = data!;
  const { t, name, error, isAdmin } = useI18n();
  const qc = useQueryClient();
  const [me, setMe] = useMe();

  const byId = new Map(day.players.map((p) => [p.id, p]));
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["matchday", id] }),
      // Locking or unlocking decides whether a new game can be started.
      qc.invalidateQueries({ queryKey: ["open-match"] }),
    ]);
  const locked = day.lockedAt !== null;
  const meInSquad = byId.has(me);

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
  const notVoted = day.players.filter((p) => !voted.has(p.id));
  const runsLeft = MAX_RUNS - day.runsUsed;
  const canRebalance = !locked && day.votes.length === 0 && runsLeft > 0;

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

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead
        eyebrow={t.match.eyebrow(t.date(day.playedOn))}
        title={locked ? t.match.titleLocked : t.match.titleOpen}
        lead={locked ? t.match.leadLocked : t.match.leadOpen}
        actions={
          <>
            {!locked && (
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
            {!locked && leader && (
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
            {locked && chosen && <ShareButton day={day} teams={chosen} byId={byId} />}
            {locked && isAdmin && (
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
          </>
        }
      />

      {day.run?.source === "fallback" && (
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

      <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
        <Figure label={t.match.players} value={day.players.length} />
        <Figure
          label={t.match.voted}
          value={
            <>
              {day.votes.length}
              <span className="text-fg/35">/{SQUAD_SIZE}</span>
            </>
          }
        />
      </div>

      {!locked && (
        <Identity players={day.players} me={me} meInSquad={meInSquad} setMe={setMe} />
      )}

      {!locked && notVoted.length > 0 && day.votes.length > 0 && (
        <p className="text-[12.5px] text-fg/45">
          {t.match.notVoted(notVoted.map((p) => name(p.name)).join(", "))}
        </p>
      )}

      {locked && chosen && <ResultForm day={day} />}

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
              canVote={!locked && meInSquad}
              voting={cast.isPending}
              onVote={() => cast.mutate(p.id)}
            />
          );
        })}
      </div>

      {/* The harness trace is for the admin, who is learning how Jev decides. */}
      {isAdmin && day.run && (
        <Section title={t.match.howTitle} note={t.match.howNote}>
          <JevTrace steps={day.run.trace} />
        </Section>
      )}
    </div>
  );
}

/** "Who are you?" — the twelve names, one tap. Remembered on this phone. */
function Identity({
  players,
  me,
  meInSquad,
  setMe,
}: {
  players: RosterPlayer[];
  me: string;
  meInSquad: boolean;
  setMe: (id: string) => void;
}) {
  const { t, name } = useI18n();
  const [choosing, setChoosing] = useState(false);

  if (me && !choosing) {
    const self = players.find((p) => p.id === me);
    return (
      <p className="text-[13px] text-fg/55">
        {meInSquad ? t.match.votingAs(name(self?.name)) : t.match.notInSquad}{" "}
        <button
          type="button"
          className="underline underline-offset-4 hover:text-fg"
          onClick={() => setChoosing(true)}
        >
          {t.match.notYou}
        </button>
      </p>
    );
  }

  return (
    <div>
      <p className="eyebrow">{t.match.whoAreYou}</p>
      <p className="mt-2 text-[13px] text-fg/50">{t.match.whoAreYouNote}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {players.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={p.id === me ? "default" : "outline"}
            onClick={() => {
              setMe(p.id);
              setChoosing(false);
            }}
          >
            {name(p.name)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ResultForm({ day }: { day: MatchdayView }) {
  const { t, error } = useI18n();
  const qc = useQueryClient();
  const [winner, setWinner] = useState(day.winner);
  const [a, setA] = useState(day.scoreA?.toString() ?? "");
  const [b, setB] = useState(day.scoreB?.toString() ?? "");
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
              onClick={() => setWinner(o.value)}
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
        const text = t.match.shareText(t.date(day.playedOn), list(teams.teamA), list(teams.teamB));
        const url = window.location.href;
        try {
          if (navigator.share) {
            await navigator.share({ text: `${text}\n\n${url}` });
            return;
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") return; // closed the share sheet
        }
        await navigator.clipboard.writeText(`${text}\n\n${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <Share2Icon /> {copied ? t.match.shared : t.match.share}
    </Button>
  );
}
