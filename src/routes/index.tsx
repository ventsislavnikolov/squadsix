import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CalendarPlusIcon, ListChecksIcon } from "lucide-react";
import { PageHead, PANE } from "@/components/page";
import { useI18n } from "@/lib/i18n";
import { matchdaysQuery, openMatchQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  // While a game is open (announced, signing up, voting), "/" is that game.
  beforeLoad: async ({ context }) => {
    const open = await context.queryClient.fetchQuery(openMatchQuery);
    if (open.id) throw redirect({ to: "/match/$id", params: { id: open.id } });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(matchdaysQuery),
  component: Start,
});

/** Nothing planned: announce a game, or tick twelve on the spot. */
function Start() {
  const { t } = useI18n();
  const { data: days } = useSuspenseQuery(matchdaysQuery);
  const last = days.find((d) => !d.cancelled);

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead
        eyebrow={t.start.eyebrow}
        title={t.start.title}
        lead={
          <>
            {t.start.lead}
            {last && (
              <span className="mt-1 block text-fg/45">
                {t.start.last(last.startsAt ? t.when(last.startsAt) : t.date(last.playedOn))}
              </span>
            )}
          </>
        }
      />
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Choice
          to="/new"
          icon={<CalendarPlusIcon className="size-5" />}
          title={t.start.announce}
          note={t.start.announceNote}
          primary
        />
        <Choice
          to="/quick"
          icon={<ListChecksIcon className="size-5" />}
          title={t.start.quick}
          note={t.start.quickNote}
        />
      </div>
    </div>
  );
}

function Choice({
  to,
  icon,
  title,
  note,
  primary,
}: {
  to: "/new" | "/quick";
  icon: React.ReactNode;
  title: string;
  note: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border p-5 shadow-xs transition-colors",
        primary
          ? "border-primary/40 bg-primary/[0.05] hover:bg-primary/[0.09]"
          : "border-fg/[0.1] bg-card hover:bg-fg/[0.03]",
      )}
    >
      <span className={cn(primary ? "text-primary" : "text-fg/60")}>{icon}</span>
      <span className="text-[16px] font-medium">{title}</span>
      <span className="text-[13px] leading-[1.6] text-fg/55">{note}</span>
    </Link>
  );
}
