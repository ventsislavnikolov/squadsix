import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { HarnessStep, Json } from "@/server/jev-harness";

/**
 * The harness run, step by step. Who did each step — our code or the model — is the
 * first thing on every line, because that is the point of looking.
 */
export function JevTrace({ steps }: { steps: HarnessStep[] }) {
  const { t } = useI18n();
  // Judges run in parallel and finish in any order; show them in candidate order.
  const order = {
    measure: 0,
    judge: 1,
    compare: 2,
    decide: 3,
    error: 4,
  } as const;
  const ordered = [...steps].sort(
    (a, b) =>
      order[a.kind] - order[b.kind] ||
      (a.kind === "judge" && b.kind === "judge"
        ? Number(a.candidate.slice(1)) - Number(b.candidate.slice(1))
        : 0)
  );

  const label = (s: HarnessStep) => {
    switch (s.kind) {
      case "measure":
        return t.trace.measure(s.combinations, s.candidates);
      case "judge":
        return t.trace.judge(s.candidate);
      case "compare":
        return t.trace.compare;
      case "decide":
        return s.mode === "jev" ? t.trace.decideJev : t.trace.decideFallback;
      case "error":
        return t.trace.error;
      default: {
        const unknown: never = s;
        return unknown;
      }
    }
  };
  const byJev = (s: HarnessStep) =>
    s.kind === "judge" || s.kind === "compare" || s.kind === "error";

  return (
    <ol className="border-t border-fg/[0.07]">
      {ordered.map((step, i) => (
        <li className="border-b border-fg/[0.07]" key={stepKey(step)}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-baseline gap-3 py-3 text-[13.5px] sm:gap-4 [&::-webkit-details-marker]:hidden">
              <span className="w-6 shrink-0 font-mono text-[11px] text-fg/30 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "w-10 shrink-0 font-mono text-[11px] tracking-[0.14em] uppercase",
                  byJev(step) ? "text-primary" : "text-fg/45",
                  step.kind === "error" && "text-destructive"
                )}
              >
                {byJev(step) ? t.trace.who.jev : t.trace.who.code}
              </span>
              <span className="min-w-0 flex-1 text-fg/80">{label(step)}</span>
              {"ms" in step ? (
                <span className="shrink-0 font-mono text-[11.5px] text-fg/40 tabular-nums">
                  {step.ms} ms
                </span>
              ) : null}
              <span className="shrink-0 text-fg/30 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="pb-4 pl-9 sm:pl-[5.5rem]">
              <StepDetail step={step} />
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}

/** A step's identity within one run: one measure, compare and decide, one judge per candidate. */
function stepKey(step: HarnessStep): string {
  switch (step.kind) {
    case "judge":
      return `judge:${step.candidate}`;
    case "error":
      return `error:${step.message}`;
    default:
      return step.kind;
  }
}

function StepDetail({ step }: { step: HarnessStep }) {
  const { t } = useI18n();
  switch (step.kind) {
    case "measure":
      return (
        <div className="space-y-1 text-[12.5px] text-fg/50">
          <p>{t.trace.measureDetail(step.candidates)}</p>
          {!!step.rules && (
            <p className={cn(!!step.broken && "text-warning")}>
              {t.trace.measureRules(step.rules, step.broken ?? 0)}
            </p>
          )}
        </div>
      );
    case "decide":
      return (
        <p className="font-mono text-[12px] text-fg/55">
          {t.trace.picked}: {step.picked.join(", ")}
        </p>
      );
    case "error":
      return (
        <p className="font-mono text-[12px] text-destructive">{step.message}</p>
      );
    case "judge":
    case "compare":
      return (
        <div className="space-y-4">
          <p className="font-mono text-[11.5px] text-fg/40">
            {step.model}
            {step.tokens !== null && ` · ${step.tokens} ${t.trace.tokens}`}
          </p>
          <Answers answers={step.answers} />
          {step.state === null ? (
            <p className="text-[12px] text-fg/40">{t.trace.hiddenState}</p>
          ) : (
            <details>
              <summary className="cursor-pointer text-[12px] text-fg/45 hover:text-fg/70">
                {t.trace.whatJevSaw}
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-fg/[0.07] bg-fg/[0.04] p-3 font-mono text-[11px] leading-[1.6] text-fg/65">
                {JSON.stringify(
                  { state: step.state, questions: step.questions },
                  null,
                  2
                )}
              </pre>
            </details>
          )}
        </div>
      );
    default: {
      const unknown: never = step;
      return unknown;
    }
  }
}

/** Probabilities as bars — the whole point of a calibrated model is the distribution. */
function Answers({ answers }: { answers: { [key: string]: Json } }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {Object.entries(answers).map(([key, raw]) => {
        const a = raw as unknown as {
          type: string;
          value: string | boolean;
          probability: number;
          probabilities?: Record<string, number>;
          /** Score answers key probabilities by level index; the legend names them. */
          legend?: Record<string, string>;
        };
        const label = (index: string) => {
          const level = a.legend?.[index] ?? index;
          return t.match.fairness[level] ?? level;
        };
        const dist =
          a.type === "boolean"
            ? { [t.trace.yes]: a.probability, [t.trace.no]: 1 - a.probability }
            : Object.fromEntries(
                Object.entries(a.probabilities ?? {}).map(([k, p]) => [
                  label(k),
                  p,
                ])
              );
        const value = answerText(a.value, t.trace, label);
        return (
          <div key={key}>
            <p className="eyebrow">{key}</p>
            <p className="mt-1 text-[13px]">
              → <span className="font-medium">{String(value)}</span>
            </p>
            <ul className="mt-2 space-y-1">
              {Object.entries(dist)
                .sort((x, y) => y[1] - x[1])
                .slice(0, 6)
                .map(([name, p]) => (
                  <li
                    className="flex items-center gap-2 font-mono text-[11px] tabular-nums"
                    key={name}
                  >
                    <span className="w-20 shrink-0 truncate text-fg/50">
                      {name}
                    </span>
                    <span className="h-1.5 flex-1 rounded-full bg-fg/[0.07]">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.round(p * 100)}%` }}
                      />
                    </span>
                    <span className="w-9 text-right text-fg/60">
                      {Math.round(p * 100)}%
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function answerText(
  value: string | boolean,
  words: { yes: string; no: string },
  label: (level: string) => string
): string {
  if (value === true) {
    return words.yes;
  }
  if (value === false) {
    return words.no;
  }
  return label(String(value));
}
