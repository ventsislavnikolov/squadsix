// Page furniture, after RefAI's `ui/page.tsx`: a heading with a hairline under it,
// sections that are rules rather than cards.

import { cn } from "@/lib/utils";

export const PANE = "mx-auto w-full max-w-[1180px] px-4 sm:px-8";

export function PageHead({
  eyebrow,
  aside,
  title,
  lead,
  actions,
}: {
  eyebrow?: string;
  /** Sits on the eyebrow's line, at the right edge. */
  aside?: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-fg/[0.06] pb-8">
      {aside && (
        <div className="flex items-center justify-between gap-4">
          {eyebrow ? <p className="eyebrow min-w-0">{eyebrow}</p> : <span />}
          <div className="shrink-0">{aside}</div>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          {eyebrow && !aside && <p className="eyebrow">{eyebrow}</p>}
          <h1
            className={cn(
              "text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.02em]",
              eyebrow && "mt-3",
            )}
          >
            {title}
          </h1>
          {lead && (
            <div className="mt-3 max-w-[44rem] text-[14.5px] leading-[1.75] text-fg/55">
              {lead}
            </div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({
  title,
  note,
  actions,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="text-[1.1rem] font-medium tracking-[-0.01em]">{title}</h2>
        {actions}
      </div>
      {note && (
        <p className="mt-2 max-w-[46rem] text-[13px] leading-[1.7] text-fg/45">{note}</p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A number typeset as a measurement: mono, with its label above it. */
export function Figure({
  label,
  value,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "confirmed" | "warning" | "a" | "b";
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-mono text-[1.35rem] leading-none tabular-nums",
          tone === "confirmed" && "text-confirmed",
          tone === "warning" && "text-warning",
          tone === "a" && "text-team-a",
          tone === "b" && "text-team-b",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Empty is a designed state with its own copy, not blank space. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-fg/[0.11] bg-fg/[0.012] px-6 py-10 text-center text-[13.5px] text-fg/50">
      {children}
    </div>
  );
}
