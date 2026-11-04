import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Navigate,
  redirect,
} from "@tanstack/react-router";
import { CalendarPlusIcon, ListChecksIcon } from "lucide-react";
import { Suspense } from "react";
import { PANE, PageHead } from "@/components/page";
import { Bone, MatchSkeleton } from "@/components/skeletons";
import { useI18n } from "@/lib/i18n";
import { matchdaysQuery, openMatchQuery, warm } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  // While a game is open (announced, signing up, voting), "/" is that game. If we already
  // know of one, go now; otherwise paint first and let the page find out (see Start).
  beforeLoad: ({ context }) => {
    const open = context.queryClient.getQueryData(openMatchQuery.queryKey);
    if (open?.id) {
      throw redirect({ to: "/match/$id", params: { id: open.id } });
    }
  },
  loader: ({ context }) => warm(context.queryClient, matchdaysQuery),
  component: Start,
  pendingComponent: MatchSkeleton,
});

/** Nothing planned: announce a game, or tick twelve on the spot. */
function Start() {
  const { t } = useI18n();
  const { data: open } = useSuspenseQuery(openMatchQuery);
  if (open.id) {
    return (
      <>
        <Navigate params={{ id: open.id }} replace to="/match/$id" />
        <MatchSkeleton />
      </>
    );
  }

  return (
    <div className={cn(PANE, "space-y-10 py-10")}>
      <PageHead
        eyebrow={t.start.eyebrow}
        lead={
          <>
            {t.start.lead}
            <Suspense fallback={<Bone className="mt-2.5 h-3.5 w-56" />}>
              <LastGame />
            </Suspense>
          </>
        }
        title={t.start.title}
      />
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Choice
          icon={<CalendarPlusIcon className="size-5" />}
          note={t.start.announceNote}
          primary
          title={t.start.announce}
          to="/new"
        />
        <Choice
          icon={<ListChecksIcon className="size-5" />}
          note={t.start.quickNote}
          title={t.start.quick}
          to="/quick"
        />
      </div>
    </div>
  );
}

/** The one line on this page that needs the database. */
function LastGame() {
  const { t } = useI18n();
  const { data: days } = useSuspenseQuery(matchdaysQuery);
  const last = days.find((d) => !d.cancelled);
  if (!last) {
    return null;
  }
  return (
    <span className="mt-1 block text-fg/45">
      {t.start.last(
        last.startsAt ? t.when(last.startsAt) : t.date(last.playedOn)
      )}
    </span>
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
      className={cn(
        "group flex flex-col gap-3 rounded-xl border p-5 shadow-xs transition-colors",
        primary
          ? "border-primary/40 bg-primary/[0.05] hover:bg-primary/[0.09]"
          : "border-fg/[0.1] bg-card hover:bg-fg/[0.03]"
      )}
      to={to}
    >
      <span className={cn(primary ? "text-primary" : "text-fg/60")}>
        {icon}
      </span>
      <span className="text-[16px] font-medium">{title}</span>
      <span className="text-[13px] leading-[1.6] text-fg/55">{note}</span>
    </Link>
  );
}
