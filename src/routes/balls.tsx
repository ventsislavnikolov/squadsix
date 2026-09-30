import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { HandIcon } from "lucide-react";
import { Empty, PageHead, PANE, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhoAmI } from "@/components/who-am-i";
import { useI18n } from "@/lib/i18n";
import { ballsQuery, pickListQuery } from "@/lib/queries";
import { useMe } from "@/lib/use-voter";
import { cn } from "@/lib/utils";
import { passBalls } from "@/server/functions";

export const Route = createFileRoute("/balls")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(ballsQuery),
      context.queryClient.ensureQueryData(pickListQuery),
    ]),
  component: Balls,
});

/** Where the balls are, and who had them before. */
function Balls() {
  const { t, name, error, isAdmin } = useI18n();
  const qc = useQueryClient();
  const [me] = useMe();
  const { data: trail } = useSuspenseQuery(ballsQuery);
  const { data: players } = useSuspenseQuery(pickListQuery);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (id: string) => name(byId.get(id)?.name);

  const now = trail[0];
  const holder = now ? nameOf(now.playerId) : t.balls.unknown;
  const mine = !!me && now?.playerId === me;
  // The holder hands them on; the admin can put them with anyone.
  const canGive = mine || isAdmin;

  const pass = useMutation({
    mutationFn: (playerId: string) => passBalls({ data: { playerId, actorId: me || null } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["balls"] }),
  });

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead
        eyebrow={t.balls.eyebrow}
        title={t.balls.title(holder)}
        lead={
          <>
            {now && <span className="block text-fg/70">{t.balls.since(t.date(now.since))}</span>}
            {t.balls.lead}
          </>
        }
      />

      <WhoAmI compact />

      <div className="flex flex-wrap items-center gap-3">
        {mine ? (
          <p className="text-[14px] font-medium text-primary">{t.balls.youHave}</p>
        ) : (
          me && (
            <Button disabled={pass.isPending} onClick={() => pass.mutate(me)}>
              <HandIcon /> {t.balls.mine}
            </Button>
          )
        )}
        {canGive && (
          <Select value="" onValueChange={(id) => id && pass.mutate(id)}>
            <SelectTrigger className="min-w-52">
              <SelectValue placeholder={t.balls.gave} />
            </SelectTrigger>
            <SelectContent>
              {players
                .filter((p) => p.id !== now?.playerId)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {name(p.name)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        {pass.isError && <p className="text-[13px] text-destructive">{error(pass.error)}</p>}
      </div>

      <Section title={t.balls.trail}>
        {trail.length === 0 ? (
          <Empty>{t.balls.empty}</Empty>
        ) : (
          <ul className="border-t border-fg/[0.07]">
            {trail.map((h, i) => (
              <li
                key={`${h.since}-${h.playerId}`}
                className="flex items-baseline justify-between gap-4 border-b border-fg/[0.07] py-3 text-[14px]"
              >
                <span className={cn(i === 0 ? "font-medium" : "text-fg/70")}>{nameOf(h.playerId)}</span>
                <span className="font-mono text-[12px] tabular-nums text-fg/45">{t.date(h.since, "short")}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
