import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { AlertTriangleIcon, LoaderIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { Figure, PageHead, PANE, Section } from "@/components/page";
import { ProposalCard } from "@/components/proposal-card";
import { JevTrace } from "@/components/jev-trace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchdayQuery } from "@/lib/queries";
import { useVoter } from "@/lib/use-voter";
import { cn } from "@/lib/utils";
import { rebalance, vote } from "@/server/functions";

export const Route = createFileRoute("/match/$id")({
  loader: async ({ context, params }) => {
    const day = await context.queryClient.ensureQueryData(matchdayQuery(params.id));
    if (!day) throw notFound();
  },
  component: MatchPage,
});

function MatchPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(matchdayQuery(id));
  const day = data!;
  const qc = useQueryClient();
  const [voter, setVoter] = useVoter();
  const [draft, setDraft] = useState("");

  const byId = new Map(day.players.map((p) => [p.id, p]));
  const refresh = () => qc.invalidateQueries({ queryKey: ["matchday", id] });

  const cast = useMutation({
    mutationFn: (proposalId: string) =>
      vote({ data: { matchdayId: id, proposalId, voter } }),
    onSuccess: refresh,
  });

  const again = useMutation({
    mutationFn: () => rebalance({ data: { id } }),
    onSuccess: refresh,
  });

  const counts = new Map<string, string[]>();
  for (const v of day.votes) counts.set(v.proposalId, [...(counts.get(v.proposalId) ?? []), v.voter]);
  const top = Math.max(0, ...[...counts.values()].map((v) => v.length));
  const myVote = day.votes.find((v) => v.voter === voter)?.proposalId;

  const played = new Date(day.playedOn).toLocaleDateString("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead
        eyebrow={`Мач · ${played}`}
        title="Три варианта. Гласувайте."
        lead="Сумите са сметнати от кода. Оценките са на Jev. Един глас на човек — ако гласуваш пак, гласът ти се мести."
        actions={
          <Button
            variant="outline"
            disabled={again.isPending}
            onClick={() => {
              if (
                day.votes.length === 0 ||
                confirm(`Новите варианти ще изтрият ${day.votes.length} гласа. Продължаваме?`)
              ) {
                again.mutate();
              }
            }}
          >
            {again.isPending ? <LoaderIcon className="animate-spin" /> : <RefreshCwIcon />}
            Нови варианти
          </Button>
        }
      />

      {day.run?.source === "fallback" && (
        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/[0.06] px-4 py-3 text-[13.5px]">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-warning">Тези отбори не са решени от Jev.</p>
            <p className="mt-1 text-white/60">
              {day.run.error} Показани са трите варианта с най-малка разлика в сумата.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
        <Figure label="Играчи" value={day.players.length} />
        <Figure label="Гласове" value={day.votes.length} />
        {day.run && (
          <>
            <Figure
              label="Решено от"
              value={day.run.source === "jev" ? day.run.model : "аритметика"}
              tone={day.run.source === "jev" ? "confirmed" : "warning"}
            />
            <Figure label="Време" value={`${(day.run.durationMs / 1000).toFixed(2)} s`} />
          </>
        )}
      </div>

      {!voter ? (
        <form
          className="flex max-w-md flex-wrap items-end gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim().length >= 2) setVoter(draft);
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="eyebrow">Кой гласува?</span>
            <Input
              className="mt-2"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Твоето име"
            />
          </label>
          <Button type="submit" disabled={draft.trim().length < 2}>
            Готово
          </Button>
        </form>
      ) : (
        <p className="text-[13px] text-white/50">
          Гласуваш като <span className="text-white">{voter}</span>.{" "}
          <button type="button" className="underline underline-offset-4 hover:text-white" onClick={() => setVoter("")}>
            Не си ти?
          </button>
        </p>
      )}

      {cast.isError && <p className="text-[13px] text-destructive">{cast.error.message}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        {day.proposals.map((p) => {
          const voters = counts.get(p.id) ?? [];
          return (
            <ProposalCard
              key={p.id}
              proposal={p}
              byId={byId}
              voters={voters}
              leading={voters.length === top && top > 0}
              mine={myVote === p.id}
              voting={!voter || cast.isPending}
              onVote={() => cast.mutate(p.id)}
            />
          );
        })}
      </div>

      {day.run && (
        <Section
          title="Как реши Jev"
          note="Jev не пише текст и не смята. Той отговаря на въпроси с „да/не“, „избери едно“ или „дай оценка“, и казва колко е сигурен. Ето всяка стъпка."
        >
          <JevTrace steps={day.run.trace} />
        </Section>
      )}
    </div>
  );
}
