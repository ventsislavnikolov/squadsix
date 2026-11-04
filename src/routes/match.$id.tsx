import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
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
import {
  type ChangeEvent,
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { JevTrace } from "@/components/jev-trace";
import { PANE, PageHead, Section } from "@/components/page";
import { ProposalCard } from "@/components/proposal-card";
import {
  AnnounceShare,
  EventInfo,
  OwnerActions,
  SignupPanel,
} from "@/components/signup-panel";
import { MatchSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNowcast, useWeather, WeatherCard } from "@/components/weather";
import { WhoAmI } from "@/components/who-am-i";
import { hasStarted } from "@/domain/signup";
import { useI18n } from "@/lib/i18n";
import { matchPreview, previewVersion, SITE, shareUrl } from "@/lib/preview";
import {
  ballsQuery,
  matchdayQuery,
  pickListQuery,
  sessionQuery,
  warm,
} from "@/lib/queries";
import { shareText } from "@/lib/share";
import { useMe } from "@/lib/use-voter";
import { cn } from "@/lib/utils";
import { lock, rebalance, setResult, unlock, vote } from "@/server/functions";
import type { MatchdayView, ProposalView, RosterPlayer } from "@/server/repo";

export const Route = createFileRoute("/match/$id")({
  loader: async ({ context, params }) => {
    const qc = context.queryClient;
    warm(qc, matchdayQuery(params.id), pickListQuery, ballsQuery);
    // A link crawler reads the head and nothing after it, so it waits for the game. A
    // person gets the skeleton at once and the game streams in.
    const session = await qc.ensureQueryData(sessionQuery);
    if (!session.crawler) {
      return null;
    }
    const day = await qc.ensureQueryData(matchdayQuery(params.id));
    if (!day) {
      throw notFound();
    }
    return { preview: matchPreview(day), version: previewVersion(day) };
  },
  // What Messenger shows when the link is pasted into the group.
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {};
    }
    const { preview: p, version } = loaderData;
    // A new version in the query makes Messenger fetch a fresh picture once the list moves.
    const image = `${SITE}/og/${params.id}?v=${encodeURIComponent(version)}`;
    return {
      meta: [
        { title: p.title },
        { name: "description", content: p.description },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Squad Six" },
        { property: "og:locale", content: "bg_BG" },
        // og:url carries the same ?v= as the shared link, so each state stays its own
        // preview instead of folding back onto one cached card.
        {
          property: "og:url",
          content: `${SITE}/match/${params.id}?v=${version}`,
        },
        { property: "og:title", content: p.title },
        { property: "og:description", content: p.description },
        { property: "og:image", content: image },
        { property: "og:image:secure_url", content: image },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: `${p.badge} · ${p.when}` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: p.title },
        { name: "twitter:description", content: p.description },
        { name: "twitter:image", content: image },
      ],
    };
  },
  component: MatchPage,
  pendingComponent: MatchSkeleton,
});

/** Where the game is: each stage has its own title, lead and share button. */
type Stage = "cancelled" | "locked" | "voting" | "signup";

function stageOf(day: MatchdayView): Stage {
  if (day.cancelledAt !== null) {
    return "cancelled";
  }
  if (day.lockedAt !== null) {
    return "locked";
  }
  return day.proposals.length > 0 ? "voting" : "signup";
}

type Winner = NonNullable<MatchdayView["winner"]>;

/** A full score names the winner by itself; `null` while either side is empty. */
function scoreWinner(a: string, b: string): Winner | null {
  if (a === "" || b === "") {
    return null;
  }
  if (Number(a) > Number(b)) {
    return "a";
  }
  if (Number(a) < Number(b)) {
    return "b";
  }
  return "draw";
}

/**
 * One game, start to finish, on one page: the announcement and its list, then — once
 * there are teams — the three options and the vote, then the result.
 */
function MatchPage() {
  const { id } = Route.useParams();
  const { data: day } = useSuspenseQuery(matchdayQuery(id));
  // The panels below read these two; wait for them here so nothing pops in afterwards.
  useSuspenseQuery(pickListQuery);
  useSuspenseQuery(ballsQuery);
  if (!day) {
    throw notFound();
  }
  const { t, error, isAdmin, lang } = useI18n();
  // The tab's title, in the reader's language. Crawlers get theirs from the head above.
  const tabTitle = matchPreview(day, lang).title;
  useEffect(() => {
    document.title = tabTitle;
    return () => {
      document.title = "Squad Six";
    };
  }, [tabTitle]);
  const qc = useQueryClient();
  const [me] = useMe();
  const weather = useWeather(day);
  const nowcast = useNowcast(day);

  const byId = new Map(day.players.map((p) => [p.id, p]));
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["matchday", id] }),
      // Locking or unlocking decides whether a new game can be started.
      qc.invalidateQueries({ queryKey: ["open-match"] }),
    ]);
  const stage = stageOf(day);
  const cancelled = stage === "cancelled";
  const locked = day.lockedAt !== null;
  const hasTeams = day.proposals.length > 0;
  const started = day.kind === "announced" && hasStarted(day.startsAt);

  const cast = useMutation({
    mutationFn: (proposalId: string) =>
      vote({ data: { matchdayId: id, proposalId, playerId: me } }),
    onSuccess: refresh,
  });
  const again = useMutation({
    mutationFn: () => rebalance({ data: { id } }),
    onSuccess: refresh,
  });
  const doLock = useMutation({
    mutationFn: () => lock({ data: { id } }),
    onSuccess: refresh,
  });
  const doUnlock = useMutation({
    mutationFn: () => unlock({ data: { id } }),
    onSuccess: refresh,
  });
  const failure = [cast, again, doLock, doUnlock].find((m) => m.isError)?.error;

  const chosen = day.proposals.find((p) => p.id === day.lockedProposalId);
  const when = day.startsAt ? t.when(day.startsAt) : t.date(day.playedOn);
  const title = {
    cancelled: t.event.cancelled,
    locked: t.match.titleLocked,
    voting: t.match.titleOpen,
    signup: when,
  }[stage];
  const lead = {
    cancelled: day.cancelReason,
    locked: t.match.leadLocked,
    voting: t.match.leadOpen,
    signup: undefined,
  }[stage];

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead
        actions={
          isAdmin ? (
            <AdminActions
              again={again}
              day={day}
              doLock={doLock}
              doUnlock={doUnlock}
            />
          ) : undefined
        }
        aside={asideFor(stage, day, byId, chosen)}
        eyebrow={hasTeams || cancelled ? t.match.eyebrow(when) : t.nav.match}
        lead={lead}
        title={title}
      />

      {cancelled ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/[0.07] px-4 py-3 text-[14px]">
          <Ban className="size-4 text-destructive" />
          {t.event.cancelled}
        </div>
      ) : null}

      {weather && !started ? (
        <WeatherCard nowcast={nowcast} weather={weather} />
      ) : null}

      {day.venue || day.note || day.changes || day.createdBy ? (
        <EventInfo byId={byId} day={day} />
      ) : null}

      <FallbackNotice day={day} />

      {failure ? (
        <p className="text-[13px] text-destructive">{error(failure)}</p>
      ) : null}

      {/* Once locked there's no vote left; only say who you are if you already picked. */}
      {!(cancelled || started) && (!locked || me) ? <WhoAmI /> : null}

      {hasTeams ? null : <SignupPanel byId={byId} day={day} />}

      {hasTeams && !cancelled ? (
        <>
          <ResultBlock day={day} started={started} />
          <Voting
            byId={byId}
            cast={cast}
            day={day}
            locked={locked}
            me={me}
            started={started}
          />
          <SignupPanel byId={byId} day={day} />
        </>
      ) : null}

      <AdminTrace day={day} />
    </div>
  );
}

/** Teams to share once locked, the announcement before that; nothing once cancelled. */
function asideFor(
  stage: Stage,
  day: MatchdayView,
  byId: Map<string, RosterPlayer>,
  chosen: ProposalView | undefined
): ReactNode {
  if (stage === "cancelled") {
    return;
  }
  if (stage === "locked") {
    return chosen ? (
      <ShareButton byId={byId} day={day} teams={chosen} />
    ) : undefined;
  }
  return <AnnounceShare byId={byId} day={day} />;
}

type Action = UseMutationResult<unknown, Error, void>;

/** New options, lock and unlock: the admin's say over the vote. */
function AdminActions({
  day,
  again,
  doLock,
  doUnlock,
}: {
  day: MatchdayView;
  again: Action;
  doLock: Action;
  doUnlock: Action;
}) {
  const { t } = useI18n();
  const cancelled = day.cancelledAt !== null;
  const locked = day.lockedAt !== null;
  const open = !(cancelled || locked);
  const full = day.squad.length === 12;
  const canRebalance = !locked && full;
  const leader = leaderOf(day);
  const { mutate: rebalanceNow } = again;
  const { mutate: lockNow } = doLock;
  const { mutate: unlockNow } = doUnlock;
  const onAgain = useCallback(() => rebalanceNow(), [rebalanceNow]);
  const onLock = useCallback(() => lockNow(), [lockNow]);
  const onUnlock = useCallback(() => unlockNow(), [unlockNow]);

  const againLabel = (
    <>
      {again.isPending ? (
        <LoaderIcon className="animate-spin" />
      ) : (
        <RefreshCwIcon />
      )}
      {t.match.again}
    </>
  );
  // New options throw the votes away, so that takes a second yes.
  const againButton =
    day.votes.length > 0 ? (
      <ConfirmButton
        confirmLabel={t.match.again}
        description={t.match.againBody(day.votes.length)}
        disabled={!canRebalance || again.isPending}
        onConfirm={onAgain}
        title={t.match.againTitle}
        variant="outline"
      >
        {againLabel}
      </ConfirmButton>
    ) : (
      <Button
        disabled={!canRebalance || again.isPending}
        onClick={onAgain}
        variant="outline"
      >
        {againLabel}
      </Button>
    );

  return (
    <>
      {open && day.proposals.length > 0 ? againButton : null}
      {open && leader && full ? (
        <ConfirmButton
          confirmLabel={t.match.lock}
          description={t.match.lockBody(
            leader.position,
            day.votes.filter((v) => v.proposalId === leader.id).length
          )}
          disabled={doLock.isPending}
          onConfirm={onLock}
          title={t.match.lockTitle}
        >
          <LockIcon /> {t.match.lock}
        </ConfirmButton>
      ) : null}
      {locked && !cancelled ? (
        <ConfirmButton
          confirmLabel={t.match.unlock}
          description={t.match.unlockBody}
          disabled={doUnlock.isPending}
          onConfirm={onUnlock}
          title={t.match.unlockTitle}
          variant="ghost"
        >
          <LockOpenIcon /> {t.match.unlock}
        </ConfirmButton>
      ) : null}
      <OwnerActions day={day} />
    </>
  );
}

/** Who would win if locked now — same rule as the server: most votes, then Jev's order. */
function leaderOf(day: MatchdayView): ProposalView | undefined {
  const votes = (proposalId: string) =>
    day.votes.filter((v) => v.proposalId === proposalId).length;
  const [leader] = [...day.proposals].sort(
    (x, y) => votes(y.id) - votes(x.id) || x.position - y.position
  );
  return leader;
}

/** For the admin: Jev was unreachable, so the arithmetic alone made the teams. */
function FallbackNotice({ day }: { day: MatchdayView }) {
  const { t, isAdmin } = useI18n();
  if (!isAdmin || day.run?.source !== "fallback") {
    return null;
  }
  const { error } = day.run;
  return (
    <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/[0.07] px-4 py-3 text-[13.5px]">
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
      <div>
        <p className="font-medium text-warning">{t.match.fallbackTitle}</p>
        <p className="mt-1 text-fg/60">
          {error === "missing-key"
            ? t.match.fallbackMissingKey
            : t.match.fallbackError(error ?? "")}{" "}
          {t.match.fallbackTail}
        </p>
      </div>
    </div>
  );
}

/** The trace is for the admin, who is learning how Jev decides. */
function AdminTrace({ day }: { day: MatchdayView }) {
  const { t, isAdmin } = useI18n();
  if (!(isAdmin && day.run) || day.run.trace.length === 0) {
    return null;
  }
  return (
    <Section note={t.match.howNote} title={t.match.howTitle}>
      <JevTrace steps={day.run.trace} />
    </Section>
  );
}

/**
 * Once locked and played (a quick game is played at once), the admin writes the
 * result; everyone else sees it once there is one.
 */
function ResultBlock({
  day,
  started,
}: {
  day: MatchdayView;
  started: boolean;
}) {
  const { isAdmin } = useI18n();
  const chosen = day.proposals.some((p) => p.id === day.lockedProposalId);
  if (day.lockedAt === null || !chosen || !(day.kind === "quick" || started)) {
    return null;
  }
  if (isAdmin) {
    return <ResultForm day={day} />;
  }
  return day.winner ? <ResultView day={day} /> : null;
}

/** The three options, who voted for what, and who still hasn't. */
function Voting({
  day,
  byId,
  me,
  locked,
  started,
  cast,
}: {
  day: MatchdayView;
  byId: Map<string, RosterPlayer>;
  me: string;
  locked: boolean;
  started: boolean;
  cast: UseMutationResult<unknown, Error, string>;
}) {
  const { t, name } = useI18n();
  const meInSquad = day.squad.includes(me);
  const votersOf = new Map<string, string[]>();
  for (const v of day.votes) {
    votersOf.set(v.proposalId, [
      ...(votersOf.get(v.proposalId) ?? []),
      name(byId.get(v.playerId)?.name),
    ]);
  }
  const top = Math.max(0, ...[...votersOf.values()].map((v) => v.length));
  const myVote = day.votes.find((v) => v.playerId === me)?.proposalId;
  const voted = new Set(day.votes.map((v) => v.playerId));
  const notVoted = day.squad
    .filter((pid) => !voted.has(pid))
    .map((pid) => byId.get(pid));
  const chosen = day.proposals.find((p) => p.id === day.lockedProposalId);
  const proposals = chosen
    ? [chosen, ...day.proposals.filter((p) => p !== chosen)]
    : day.proposals;
  const { mutate } = cast;

  return (
    <>
      {!locked && me && !meInSquad ? (
        <p className="text-[13px] text-fg/50">{t.match.notInSquad}</p>
      ) : null}
      {!locked && notVoted.length > 0 && day.votes.length > 0 ? (
        <p className="text-[12.5px] text-fg/45">
          {t.match.voted} {day.votes.length}/12 ·{" "}
          {t.match.notVoted(notVoted.map((p) => name(p?.name)).join(", "))}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {proposals.map((p) => {
          const voters = votersOf.get(p.id) ?? [];
          return (
            <VoteCard
              byId={byId}
              canVote={!(locked || started) && meInSquad}
              chosen={p.id === day.lockedProposalId}
              key={p.id}
              leading={voters.length === top && top > 0}
              mine={myVote === p.id}
              onVoteFor={mutate}
              proposal={p}
              voters={voters}
              voting={cast.isPending}
            />
          );
        })}
      </div>
    </>
  );
}

/** A proposal card whose vote button votes for that proposal. */
function VoteCard({
  onVoteFor,
  ...card
}: Omit<ComponentProps<typeof ProposalCard>, "onVote"> & {
  onVoteFor: (proposalId: string) => void;
}) {
  const proposalId = card.proposal.id;
  const onVote = useCallback(
    () => onVoteFor(proposalId),
    [onVoteFor, proposalId]
  );
  return <ProposalCard {...card} onVote={onVote} />;
}

/** The result as everyone else sees it: only the admin writes it. */
function ResultView({ day }: { day: MatchdayView }) {
  const { t } = useI18n();
  const score =
    day.scoreA !== null && day.scoreB !== null
      ? ` · ${day.scoreA}:${day.scoreB}`
      : "";
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
          day.winner === "b" && "text-team-b"
        )}
      >
        {text + score}
      </p>
    </Section>
  );
}

const twoDigits = (value: string) => value.replace(/\D/gu, "").slice(0, 2);

function ResultForm({ day }: { day: MatchdayView }) {
  const { t, error } = useI18n();
  const qc = useQueryClient();
  const [picked, setPicked] = useState(day.winner);
  const [a, setA] = useState(day.scoreA?.toString() ?? "");
  const [b, setB] = useState(day.scoreB?.toString() ?? "");
  // A full score names the winner by itself; the buttons are for when nobody kept score.
  const fromScore = scoreWinner(a, b);
  const winner = fromScore ?? picked;
  const save = useMutation({
    mutationFn: (result: Winner) =>
      setResult({
        data: {
          id: day.id,
          winner: result,
          scoreA: a === "" ? null : Number(a),
          scoreB: b === "" ? null : Number(b),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["matchday", day.id] }),
  });
  const { mutate } = save;
  const onSave = useCallback(() => {
    if (winner) {
      mutate(winner);
    }
  }, [mutate, winner]);
  const onPick = useCallback(
    (value: Winner) => {
      setPicked(value);
      // Picking against the typed score means the score was wrong: drop it.
      if (fromScore && fromScore !== value) {
        setA("");
        setB("");
      }
    },
    [fromScore]
  );
  const onA = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setA(twoDigits(e.target.value)),
    []
  );
  const onB = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setB(twoDigits(e.target.value)),
    []
  );

  const options = [
    { value: "a", label: t.common.teamA, tone: "text-team-a" },
    { value: "draw", label: t.common.draw, tone: "" },
    { value: "b", label: t.common.teamB, tone: "text-team-b" },
  ] as const;

  return (
    <Section note={t.match.resultNote} title={t.match.result}>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          {options.map((o) => (
            <WinnerButton
              key={o.value}
              label={o.label}
              onPick={onPick}
              selected={winner === o.value}
              tone={o.tone}
              value={o.value}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 font-mono">
          <Input
            className="w-16 text-center"
            inputMode="numeric"
            onChange={onA}
            placeholder="0"
            value={a}
          />
          <span className="text-fg/40">:</span>
          <Input
            className="w-16 text-center"
            inputMode="numeric"
            onChange={onB}
            placeholder="0"
            value={b}
          />
        </div>
        <Button disabled={!winner || save.isPending} onClick={onSave}>
          {t.common.save}
        </Button>
        {save.isSuccess ? (
          <span className="text-[12.5px] text-confirmed">
            {t.match.resultSaved}
          </span>
        ) : null}
        {save.isError ? (
          <span className="text-[12.5px] text-destructive">
            {error(save.error)}
          </span>
        ) : null}
      </div>
    </Section>
  );
}

function WinnerButton({
  value,
  label,
  tone,
  selected,
  onPick,
}: {
  value: Winner;
  label: string;
  tone: string;
  selected: boolean;
  onPick: (value: Winner) => void;
}) {
  const onClick = useCallback(() => onPick(value), [onPick, value]);
  return (
    <Button
      className={cn(!selected && tone)}
      onClick={onClick}
      variant={selected ? "default" : "outline"}
    >
      {label}
    </Button>
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

  const onShare = useCallback(async () => {
    const list = (ids: string[]) =>
      ids
        .map((id) => name(byId.get(id)?.name))
        .sort((x, y) => x.localeCompare(y))
        .join(", ");
    const when = day.startsAt ? t.when(day.startsAt) : t.date(day.playedOn);
    const text = t.match.shareText(when, list(teams.teamA), list(teams.teamB));
    if ((await shareText(`${text}\n\n${shareUrl(day)}`)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [byId, day, name, t, teams]);

  return (
    <Button onClick={onShare} variant="outline">
      <Share2Icon /> {copied ? t.match.shared : t.match.share}
    </Button>
  );
}
