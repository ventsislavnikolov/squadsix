import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Empty, PageHead, PANE } from "@/components/page";
import { useI18n } from "@/lib/i18n";
import { matchdaysQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { MatchdaySummary } from "@/server/repo";

export const Route = createFileRoute("/history")({
  loader: ({ context }) => context.queryClient.ensureQueryData(matchdaysQuery),
  component: History,
});

function History() {
  const { t } = useI18n();
  const { data: days } = useSuspenseQuery(matchdaysQuery);
  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead eyebrow={t.history.eyebrow} title={t.history.title} lead={t.history.lead} />
      {days.length === 0 ? (
        <Empty>{t.history.empty}</Empty>
      ) : (
        <ul className="border-t border-fg/[0.07]">
          {days.map((d) => (
            <li key={d.id} className="border-b border-fg/[0.07]">
              <Link
                to="/match/$id"
                params={{ id: d.id }}
                className="flex items-baseline justify-between gap-4 py-3.5 text-[14px] hover:text-fg"
              >
                <span className="min-w-0 text-fg/80">
                  {d.startsAt ? t.when(d.startsAt) : t.date(d.playedOn, "short")}
                  {d.venueName && <span className="ml-2 text-[12.5px] text-fg/45">{d.venueName}</span>}
                </span>
                <span className="font-mono text-[12px] tabular-nums text-fg/50">
                  <Outcome day={d} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Outcome({ day }: { day: MatchdaySummary }) {
  const { t } = useI18n();
  if (day.cancelled) return <span className="text-destructive">{t.history.cancelled}</span>;
  if (!day.locked && day.voteCount === 0) return <>{t.history.signing(Math.min(day.signupCount, 12))}</>;
  if (!day.locked) return <>{t.history.open} · {t.match.votes(day.voteCount)}</>;
  if (!day.winner) return <>{t.history.lockedNoResult}</>;
  const score = day.scoreA !== null && day.scoreB !== null ? ` · ${day.scoreA}:${day.scoreB}` : "";
  if (day.winner === "draw") return <>{t.common.draw + score}</>;
  const team = day.winner === "a" ? t.common.teamA : t.common.teamB;
  return (
    <span className={day.winner === "a" ? "text-team-a" : "text-team-b"}>
      {t.history.won(team) + score}
    </span>
  );
}
