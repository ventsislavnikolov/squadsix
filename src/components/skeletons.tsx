// What a page looks like while its data is still on the way: the same blocks, greyed.
// Routes start their reads without waiting, so this paints at once and the real page
// streams in over it.

import { PANE } from "@/components/page";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Placeholder rows never reorder; fixed ids keep React's keys tied to a row, not an index.
const LIST_ROWS = [
  { id: "row-1", width: "w-56" },
  { id: "row-2", width: "w-44" },
  { id: "row-3", width: "w-64" },
  { id: "row-4", width: "w-56" },
  { id: "row-5", width: "w-44" },
  { id: "row-6", width: "w-64" },
  { id: "row-7", width: "w-56" },
  { id: "row-8", width: "w-44" },
] as const;
const FORM_FIELDS = ["field-1", "field-2", "field-3", "field-4"] as const;
const OPTIONS = ["option-1", "option-2", "option-3"] as const;
const TEAMS = ["team-a", "team-b"] as const;
const PLAYERS = [
  "player-1",
  "player-2",
  "player-3",
  "player-4",
  "player-5",
  "player-6",
] as const;

export function Bone({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-fg/[0.07]", className)} />
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div aria-busy className={cn(PANE, "space-y-10 py-10")} role="status">
      <span className="sr-only">{t.common.loading}</span>
      <header className="border-b border-fg/[0.06] pb-8">
        <Bone className="h-3 w-44" />
        <Bone className="mt-4 h-8 w-72 max-w-full" />
        <Bone className="mt-4 h-4 w-[30rem] max-w-full" />
      </header>
      {children}
    </div>
  );
}

/** History, the balls' trail, the log, the roster: a heading and ruled rows. */
export function ListSkeleton() {
  return (
    <Frame>
      <ul className="border-t border-fg/[0.07]">
        {LIST_ROWS.map((row) => (
          <li
            className="flex items-center justify-between gap-4 border-b border-fg/[0.07] py-4"
            key={row.id}
          >
            <Bone className={cn("h-4", row.width)} />
            <Bone className="h-3 w-20" />
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** Announcing or editing a game, ticking twelve: labelled fields. */
export function FormSkeleton() {
  return (
    <Frame>
      <div className="max-w-xl space-y-6">
        {FORM_FIELDS.map((field) => (
          <div className="space-y-2.5" key={field}>
            <Bone className="h-3 w-24" />
            <Bone className="h-10 w-full" />
          </div>
        ))}
        <Bone className="h-10 w-36 rounded-full" />
      </div>
    </Frame>
  );
}

/** A game: where and when, then the three options (or the list, which sits the same). */
export function MatchSkeleton() {
  return (
    <Frame>
      <div className="space-y-4">
        <Bone className="h-4 w-64 max-w-full" />
        <Bone className="h-4 w-44" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {OPTIONS.map((option, i) => (
          <div
            className={cn(
              "rounded-xl border border-fg/[0.08] p-6",
              i > 0 && "hidden lg:block"
            )}
            key={option}
          >
            <div className="flex justify-between">
              <Bone className="h-3 w-20" />
              <Bone className="h-3 w-16" />
            </div>
            <div className="mt-8 grid grid-cols-2 gap-8">
              {TEAMS.map((team) => (
                <div className="space-y-3.5" key={team}>
                  <Bone className="h-4 w-16" />
                  {PLAYERS.map((player) => (
                    <Bone className="h-3.5 w-full" key={player} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}
