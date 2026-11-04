import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ChangeEvent, useCallback, useId, useState } from "react";
import { Empty, PANE, PageHead } from "@/components/page";
import { ListSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { venuesQuery, warm } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { saveVenue } from "@/server/functions";
import type { Venue } from "@/server/repo";

export const Route = createFileRoute("/admin/venues")({
  loader: ({ context }) => warm(context.queryClient, venuesQuery),
  pendingComponent: ListSkeleton,
  component: Venues,
});

function Venues() {
  const { t } = useI18n();
  const { data: venues } = useSuspenseQuery(venuesQuery);
  return (
    <div className={cn(PANE, "space-y-8 py-10")}>
      <PageHead
        eyebrow={t.admin.eyebrow}
        lead={t.venues.lead}
        title={t.venues.title}
      />
      {venues.length === 0 ? (
        <Empty>{t.venues.empty}</Empty>
      ) : (
        <div className="border-t border-fg/[0.07]">
          {venues.map((v) => (
            <Row key={v.id} venue={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ venue }: { venue: Venue }) {
  const { t, error } = useI18n();
  const qc = useQueryClient();
  const initial = {
    name: venue.name,
    mapUrl: venue.mapUrl ?? "",
    hidden: venue.hidden,
  };
  const [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const save = useMutation({
    mutationFn: () =>
      saveVenue({
        data: {
          id: venue.id,
          name: draft.name.trim(),
          mapUrl: draft.mapUrl.trim() || null,
          hidden: draft.hidden,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venues"] }),
  });
  const { mutate } = save;
  const hiddenId = useId();
  const onName = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => ({ ...d, name: e.target.value })),
    []
  );
  const onMapUrl = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => ({ ...d, mapUrl: e.target.value })),
    []
  );
  const onHidden = useCallback(
    (hidden: boolean) => setDraft((d) => ({ ...d, hidden })),
    []
  );
  const onSave = useCallback(() => mutate(), [mutate]);

  return (
    <div
      className={cn(
        "grid items-center gap-2 border-b border-fg/[0.07] py-3 sm:grid-cols-[1fr_1.4fr_auto]",
        draft.hidden && "opacity-50"
      )}
    >
      <Input aria-label={t.venues.name} onChange={onName} value={draft.name} />
      <Input
        aria-label={t.venues.mapUrl}
        onChange={onMapUrl}
        placeholder={t.venues.mapUrl}
        type="url"
        value={draft.mapUrl}
      />
      <div className="flex items-center justify-end gap-3">
        <label
          className="flex items-center gap-1.5 text-[12px] text-fg/55"
          htmlFor={hiddenId}
        >
          <Switch
            checked={draft.hidden}
            id={hiddenId}
            onCheckedChange={onHidden}
          />
          {t.venues.hidden}
        </label>
        <Button
          className={cn(!dirty && "invisible")}
          disabled={!dirty || draft.name.trim().length < 2 || save.isPending}
          onClick={onSave}
          size="sm"
        >
          {t.common.save}
        </Button>
      </div>
      {save.isError ? (
        <p className="col-span-full text-[12px] text-destructive">
          {error(save.error)}
        </p>
      ) : null}
    </div>
  );
}
