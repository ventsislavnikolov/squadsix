import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { effectiveRating, type Player } from "@/domain/balance";
import { cn } from "@/lib/utils";
import type { Proposal } from "@/server/repo";
import { Rating } from "./rating";

/**
 * One proposed game. Totals come from our arithmetic (see domain/balance.ts), never from
 * the model's own claim; the rationale is the model's, and is labelled as such.
 */
export function ProposalCard({
  proposal,
  byId,
  voters,
  leading,
  mine,
  onVote,
  voting,
}: {
  proposal: Proposal;
  byId: Map<string, Player>;
  voters: string[];
  leading: boolean;
  mine: boolean;
  onVote: () => void;
  voting: boolean;
}) {
  const gap = Math.abs(proposal.totalA - proposal.totalB);
  return (
    <article
      className={cn(
        "flex flex-col rounded-xl border bg-white/[0.02] transition-colors",
        mine ? "border-primary/60" : "border-white/[0.08]",
      )}
    >
      <header className="flex items-baseline justify-between border-b border-white/[0.06] px-5 py-4">
        <p className="eyebrow">Вариант {proposal.position}</p>
        <p className="font-mono text-[12px] tabular-nums text-white/50">
          разлика{" "}
          <span className={cn(gap <= 0.5 ? "text-confirmed" : gap <= 1.5 ? "text-warning" : "text-destructive")}>
            {gap.toFixed(1)}
          </span>
        </p>
      </header>

      <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
        <Side label="Отбор А" tone="a" total={proposal.totalA} ids={proposal.teamA} byId={byId} />
        <Side label="Отбор Б" tone="b" total={proposal.totalB} ids={proposal.teamB} byId={byId} />
      </div>

      <div className="border-t border-white/[0.06] px-5 py-4">
        <p className="eyebrow">
          {proposal.verdict ? `Защо — според Jev · ${proposal.verdict.candidate}` : "Защо — без Jev"}
        </p>
        {proposal.verdict && <Meter fairness={proposal.verdict.fairness} />}
        <p className="mt-2 text-[13px] leading-[1.65] text-white/60">{proposal.rationale}</p>
      </div>

      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4">
        <div className="min-w-0">
          <p className="font-mono text-[12px] tabular-nums text-white/70">
            {voters.length} {voters.length === 1 ? "глас" : "гласа"}
            {leading && voters.length > 0 && <span className="ml-2 text-confirmed">водещ</span>}
          </p>
          {voters.length > 0 && (
            <p className="mt-1 truncate text-[12px] text-white/40" title={voters.join(", ")}>
              {voters.join(", ")}
            </p>
          )}
        </div>
        <Button size="sm" variant={mine ? "default" : "outline"} onClick={onVote} disabled={voting}>
          {mine ? (
            <>
              <CheckIcon /> Твоят глас
            </>
          ) : (
            "Гласувай"
          )}
        </Button>
      </footer>
    </article>
  );
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
  total: number;
  ids: string[];
  byId: Map<string, Player>;
}) {
  const players = ids
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p)
    .sort((x, y) => effectiveRating(y) - effectiveRating(x));
  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline justify-between">
        <p className={cn("text-[12.5px] font-medium", tone === "a" ? "text-team-a" : "text-team-b")}>
          {label}
        </p>
        <p className="font-mono text-[15px] tabular-nums">{total.toFixed(1)}</p>
      </div>
      <ul className="mt-3 space-y-1.5">
        {players.map((p) => (
          <li key={p.id} className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate">{p.name}</span>
            <Rating value={p.rating} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Jev's fairness score as a scale from one-sided to dead even. */
function Meter({ fairness }: { fairness: number }) {
  return (
    <div className="mt-3">
      <div className="relative h-1.5 rounded-full bg-white/[0.06]">
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${Math.round(fairness * 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-white/30">
        <span>едностранен</span>
        <span>напълно равен</span>
      </div>
    </div>
  );
}
