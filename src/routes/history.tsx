import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Empty, PageHead, PANE } from "@/components/page";
import { matchdaysQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  loader: ({ context }) => context.queryClient.ensureQueryData(matchdaysQuery),
  component: History,
});

function History() {
  const { data: days } = useSuspenseQuery(matchdaysQuery);
  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead eyebrow="Архив" title="Минали мачове" lead="Последните 20 дни с игра." />
      {days.length === 0 ? (
        <Empty>Още няма мачове. Започни от „Нов мач“.</Empty>
      ) : (
        <ul className="border-t border-white/[0.06]">
          {days.map((d) => (
            <li key={d.id} className="border-b border-white/[0.06]">
              <Link
                to="/match/$id"
                params={{ id: d.id }}
                className="flex items-baseline justify-between gap-4 py-3.5 text-[14px] hover:text-white"
              >
                <span className="text-white/80">
                  {new Date(d.playedOn).toLocaleDateString("bg-BG", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                <span className="font-mono text-[12px] tabular-nums text-white/45">
                  {d.playerCount} играчи · {d.voteCount} {d.voteCount === 1 ? "глас" : "гласа"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
