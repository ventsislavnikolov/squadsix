// What a page looks like while its data is still on the way: the same blocks, greyed.
// Routes start their reads without waiting, so this paints at once and the real page
// streams in over it.

import { PANE } from "@/components/page";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-fg/[0.07]", className)} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className={cn(PANE, "space-y-10 py-10")} role="status" aria-busy>
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
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex items-center justify-between gap-4 border-b border-fg/[0.07] py-4">
            <Bone className={cn("h-4", i % 3 === 0 ? "w-56" : i % 3 === 1 ? "w-44" : "w-64")} />
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
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2.5">
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
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={cn("rounded-xl border border-fg/[0.08] p-6", i > 0 && "hidden lg:block")}>
            <div className="flex justify-between">
              <Bone className="h-3 w-20" />
              <Bone className="h-3 w-16" />
            </div>
            <div className="mt-8 grid grid-cols-2 gap-8">
              {[0, 1].map((team) => (
                <div key={team} className="space-y-3.5">
                  <Bone className="h-4 w-16" />
                  {Array.from({ length: 6 }, (_, row) => (
                    <Bone key={row} className="h-3.5 w-full" />
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
