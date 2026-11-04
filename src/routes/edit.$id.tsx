import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { EventForm, venueInput } from "@/components/event-form";
import { PANE, PageHead } from "@/components/page";
import { FormSkeleton } from "@/components/skeletons";
import { useI18n } from "@/lib/i18n";
import { matchdayQuery, venuesQuery, warm } from "@/lib/queries";
import { useMe } from "@/lib/use-voter";
import { cn } from "@/lib/utils";
import { editMatch } from "@/server/functions";

export const Route = createFileRoute("/edit/$id")({
  loader: ({ context, params }) =>
    warm(context.queryClient, matchdayQuery(params.id), venuesQuery),
  pendingComponent: FormSkeleton,
  component: EditGame,
});

function EditGame() {
  const { id } = Route.useParams();
  const { t, error } = useI18n();
  const { data: day } = useSuspenseQuery(matchdayQuery(id));
  if (!day) {
    throw notFound();
  }
  const [me] = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const kickoff = day.startsAt ? new Date(day.startsAt) : null;
  const initial = {
    date: day.playedOn,
    time: kickoff
      ? kickoff.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Sofia",
        })
      : "20:00",
    venueId: day.venue?.id,
    note: day.note ?? "",
  };

  const save = useMutation({
    mutationFn: (v: Parameters<typeof venueInput>[0]) =>
      editMatch({
        data: {
          id,
          actorId: me || null,
          date: v.date,
          time: v.time,
          venue: venueInput(v),
          note: v.note.trim() || null,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["matchday", id] });
      await qc.invalidateQueries({ queryKey: ["venues"] });
      await navigate({ to: "/match/$id", params: { id } });
    },
  });

  return (
    <div className={cn(PANE, "space-y-8 py-10")}>
      <PageHead
        eyebrow={t.event.editEyebrow}
        lead={t.event.editLead}
        title={t.event.editTitle}
      />
      <EventForm
        error={save.isError ? error(save.error) : null}
        initial={initial}
        onSubmit={save.mutate}
        pending={save.isPending}
        submitLabel={t.event.save}
      />
    </div>
  );
}
