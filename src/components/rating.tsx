import { formatRating, GUEST_RATING } from "@/domain/balance";
import { cn } from "@/lib/utils";

/**
 * A rating as a measurement. Guests show "?" and say what they are counted as — the 2.5 is
 * an assumption, and an assumption presented as a figure would be a small lie.
 */
export function Rating({ value, className }: { value: number | null; className?: string }) {
  if (value === null) {
    return (
      <span
        title={`Гост без рейтинг — смята се за ${GUEST_RATING}`}
        className={cn("font-mono text-[12.5px] tabular-nums text-warning", className)}
      >
        ?<span className="text-white/30">/{GUEST_RATING}</span>
      </span>
    );
  }
  return (
    <span className={cn("font-mono text-[12.5px] tabular-nums text-white/70", className)}>
      {formatRating(value)}
    </span>
  );
}

/** Five pips, half-filled for x.5 — readable at a glance on a phone at the pitch. */
export function Pips({ value }: { value: number | null }) {
  return (
    <span className="inline-flex gap-[3px]" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = value === null ? 0 : Math.max(0, Math.min(1, value - n + 1));
        return (
          <span
            key={n}
            className={cn(
              "h-[6px] w-[6px] rounded-full border",
              value === null ? "border-dashed border-warning/50" : "border-white/25",
            )}
            style={
              fill > 0
                ? {
                    background:
                      fill === 1
                        ? "var(--color-primary)"
                        : "linear-gradient(90deg, var(--color-primary) 50%, transparent 50%)",
                    borderColor: "var(--color-primary)",
                  }
                : undefined
            }
          />
        );
      })}
    </span>
  );
}
