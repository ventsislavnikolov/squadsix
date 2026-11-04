import { formatRating, GUEST_RATING } from "@/domain/balance";
import { cn } from "@/lib/utils";

// Ratings are admin-only: these components only ever receive a value when the server
// decided the viewer may see it.

/** A rating as a measurement. "?" for unrated, with what it counts as. */
export function Rating({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  if (value === null) {
    return (
      <span
        className={cn(
          "font-mono text-[12.5px] text-warning tabular-nums",
          className
        )}
      >
        ?<span className="text-fg/30">/{GUEST_RATING}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-mono text-[12.5px] text-fg/70 tabular-nums",
        className
      )}
    >
      {formatRating(value)}
    </span>
  );
}

/** Five pips, half-filled for x.5. */
export function Pips({ value }: { value: number | null }) {
  return (
    <span aria-hidden className="inline-flex gap-[3px]">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill =
          value === null ? 0 : Math.max(0, Math.min(1, value - n + 1));
        return (
          <span
            className={cn(
              "h-[6px] w-[6px] rounded-full border",
              value === null
                ? "border-dashed border-warning/60"
                : "border-fg/25"
            )}
            key={n}
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
