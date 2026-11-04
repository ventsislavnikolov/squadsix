import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Empty, PANE, PageHead } from "@/components/page";
import { ListSkeleton } from "@/components/skeletons";
import { useI18n } from "@/lib/i18n";
import { logQuery, warm } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/log")({
  loader: ({ context }) => warm(context.queryClient, logQuery),
  pendingComponent: ListSkeleton,
  component: Log,
});

function Log() {
  const { t, lang } = useI18n();
  const { data: rows } = useSuspenseQuery(logQuery);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === "bg" ? "bg-BG" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  return (
    <div className={cn(PANE, "space-y-8 py-10")}>
      <PageHead
        eyebrow={t.admin.eyebrow}
        lead={t.log.lead}
        title={t.log.title}
      />
      {rows.length === 0 ? (
        <Empty>{t.log.empty}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-t border-fg/[0.07] text-[12.5px]">
            <tbody>
              {rows.map((r) => (
                <tr
                  className={cn(
                    "border-b border-fg/[0.07] align-top",
                    !r.ok && "bg-destructive/[0.05]"
                  )}
                  key={r.id}
                >
                  <td className="py-2 pr-4 font-mono whitespace-nowrap text-fg/50 tabular-nums">
                    {when(r.at)}
                  </td>
                  <td className="py-2 pr-4 font-mono whitespace-nowrap">
                    {r.action}
                    {r.ok ? null : (
                      <span className="ml-2 text-destructive">
                        {t.log.refused}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-fg/70">
                    {r.matchdayId ? (
                      <Link
                        className="underline underline-offset-2"
                        params={{ id: r.matchdayId }}
                        to="/match/$id"
                      >
                        {r.matchdayId.slice(0, 8)}
                      </Link>
                    ) : null}{" "}
                    {r.actor ? (
                      <span className="text-fg/55">{r.actor}</span>
                    ) : null}
                    {r.detail ? (
                      <span className="block font-mono text-[11px] break-all text-fg/40">
                        {JSON.stringify(r.detail)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 font-mono text-[11px] text-fg/40">
                    {r.ip}
                    <span
                      className="block max-w-[260px] truncate"
                      title={r.userAgent ?? ""}
                    >
                      {r.userAgent}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
