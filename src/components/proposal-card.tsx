import { CheckIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { effectiveRating } from "@/domain/balance";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ProposalView, RosterPlayer } from "@/server/repo";
import { Rating } from "./rating";

/**
 * One proposed game. The gap comes from our arithmetic, never the model's claim; the
 * verdict is Jev's and is labelled as such. Totals and ratings appear only for the admin.
 */
export function ProposalCard({
  proposal,
  byId,
  voters,
  leading,
  mine,
  chosen,
  canVote,
  voting,
  onVote,
}: {
  proposal: ProposalView;
  byId: Map<string, RosterPlayer>;
  voters: string[];
  leading: boolean;
  mine: boolean;
  /** Locked on this one. */
  chosen: boolean;
  /** Voting is open and the viewer is one of the twelve. */
  canVote: boolean;
  voting: boolean;
  onVote: () => void;
}) {
  const { t } = useI18n();
  const { gap, verdict: v } = proposal;
  const pct = (n: number) => Math.round(n * 100);

  return (
    <article
      className={cn(
        "flex flex-col rounded-xl border bg-card/60 transition-colors",
        cardBorder(chosen, mine)
      )}
    >
      <header className="flex items-baseline justify-between border-b border-fg/[0.07] px-5 py-4">
        <p className="flex items-center gap-2 eyebrow">
          {t.match.option(proposal.position)}
          {chosen ? (
            <span className="inline-flex items-center gap-1 text-confirmed">
              <TrophyIcon className="size-3" /> {t.match.winnerTag}
            </span>
          ) : null}
        </p>
        <p className="font-mono text-[12px] text-fg/50 tabular-nums">
          {t.match.difference}{" "}
          <span className={gapTone(gap)}>{gap.toFixed(1)}</span>
        </p>
      </header>

      <div className="grid grid-cols-2 divide-x divide-fg/[0.07]">
        <Side
          byId={byId}
          ids={proposal.teamA}
          label={t.common.teamA}
          tone="a"
          total={proposal.totals?.a}
        />
        <Side
          byId={byId}
          ids={proposal.teamB}
          label={t.common.teamB}
          tone="b"
          total={proposal.totals?.b}
        />
      </div>

      <div className="border-t border-fg/[0.07] px-5 py-4">
        {v ? (
          <Meter
            fairness={v.fairness}
            high={t.match.scaleHigh}
            low={t.match.scaleLow}
          />
        ) : null}
        <p className="mt-3 text-[13px] leading-[1.65] text-fg/60">
          {v
            ? t.match.rationale(
                t.match.fairness[v.fairnessLabel] ?? v.fairnessLabel,
                pct(v.fairnessConfidence),
                pct(v.stacked),
                pct(v.preferred)
              )
            : t.match.rationaleFallback(gap.toFixed(1))}
        </p>
      </div>

      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-fg/[0.07] px-5 py-4">
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-fg/70 tabular-nums">
            {t.match.votes(voters.length)}
            {leading && voters.length > 0 && !chosen && (
              <span className="ml-2 text-confirmed">{t.match.leading}</span>
            )}
          </p>
          {voters.length > 0 && (
            <p
              className="mt-1 truncate text-[12px] text-fg/45"
              title={voters.join(", ")}
            >
              {voters.join(", ")}
            </p>
          )}
        </div>
        {canVote ? (
          <Button
            disabled={voting}
            onClick={onVote}
            size="sm"
            variant={mine ? "default" : "outline"}
          >
            {mine ? (
              <>
                <CheckIcon /> {t.match.yourVote}
              </>
            ) : (
              t.match.vote
            )}
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

function cardBorder(chosen: boolean, mine: boolean): string {
  if (chosen) {
    return "border-confirmed/60";
  }
  return mine ? "border-primary/60" : "border-fg/[0.09]";
}

function gapTone(gap: number): string {
  if (gap <= 0.5) {
    return "text-confirmed";
  }
  return gap <= 1.5 ? "text-warning" : "text-destructive";
}

function Side({
  label,
  tone,
  total,
  ids,
  byId,
}: {
  label: string;
  tone: "a" | "b";
  total: number | undefined;
  ids: string[];
  byId: Map<string, RosterPlayer>;
}) {
  const { name, t } = useI18n();
  const players = ids
    .map((id) => byId.get(id))
    .filter((p): p is RosterPlayer => !!p)
    // Admin sees strongest first; everyone else alphabetical, so order leaks nothing.
    .sort((x, y) =>
      x.rating !== undefined && y.rating !== undefined
        ? effectiveRating({ rating: y.rating }) -
          effectiveRating({ rating: x.rating })
        : name(x.name).localeCompare(name(y.name))
    );
  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline justify-between">
        <p
          className={cn(
            "text-[12.5px] font-medium",
            tone === "a" ? "text-team-a" : "text-team-b"
          )}
        >
          {label}
        </p>
        {total !== undefined && (
          <p className="font-mono text-[14px] tabular-nums">
            {total.toFixed(1)}
          </p>
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {players.map((p) => (
          <li
            className="flex items-baseline justify-between gap-2 text-[13px]"
            key={p.id}
          >
            <span className="truncate">
              {name(p.name)}
              {p.isGuest ? (
                <span className="ml-1.5 text-[11px] text-fg/40">
                  {t.common.guest}
                </span>
              ) : null}
            </span>
            {p.rating !== undefined && <Rating value={p.rating} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Jev's fairness score on a scale from one-sided to dead even. */
function Meter({
  fairness,
  low,
  high,
}: {
  fairness: number;
  low: string;
  high: string;
}) {
  return (
    <div className="mt-1">
      <div className="relative h-1.5 rounded-full bg-fg/[0.07]">
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
          style={{
            left: `${Math.round(Math.min(1, Math.max(0, fairness)) * 100)}%`,
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] tracking-[0.12em] text-fg/35 uppercase">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
