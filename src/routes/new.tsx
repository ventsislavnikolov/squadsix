import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { EventForm, venueInput } from "@/components/event-form";
import { PANE, PageHead } from "@/components/page";
import { FormSkeleton } from "@/components/skeletons";
import { WhoAmI } from "@/components/who-am-i";
import { useI18n } from "@/lib/i18n";
import {
  openMatchQuery,
  pickListQuery,
  venuesQuery,
  warm,
} from "@/lib/queries";
import { useMe } from "@/lib/use-voter";
import { cn } from "@/lib/utils";
import { announce } from "@/server/functions";

export const Route = createFileRoute("/new")({
  beforeLoad: async ({ context }) => {
    const open = await context.queryClient.fetchQuery(openMatchQuery);
    if (open.id) {
      throw redirect({ to: "/match/$id", params: { id: open.id } });
    }
  },
  loader: ({ context }) =>
    warm(context.queryClient, venuesQuery, pickListQuery),
  pendingComponent: FormSkeleton,
  component: NewGame,
});

function NewGame() {
  const { t, error } = useI18n();
  const [me] = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const submit = useMutation({
    mutationFn: (v: Parameters<typeof venueInput>[0]) =>
      announce({
        data: {
          date: v.date,
          time: v.time,
          venue: venueInput(v),
          note: v.note.trim() || null,
          actorId: me,
        },
      }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: ["open-match"] });
      await qc.invalidateQueries({ queryKey: ["venues"] });
      await navigate({ to: "/match/$id", params: { id } });
    },
  });

  return (
    <div className={cn(PANE, "space-y-8 py-10")}>
      <PageHead
        eyebrow={t.event.newEyebrow}
        lead={t.event.newLead}
        title={t.event.newTitle}
      />
      <WhoAmI />
      {me ? (
        <EventForm
          error={submit.isError ? error(submit.error) : null}
          initial={{}}
          onSubmit={submit.mutate}
          pending={submit.isPending}
          submitLabel={t.event.submit}
        />
      ) : null}
    </div>
  );
}
