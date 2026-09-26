import type { HarnessStep } from "@/server/jev-harness";
import { cn } from "@/lib/utils";

const KIND: Record<HarnessStep["kind"], { tag: string; who: string }> = {
  measure: { tag: "measure", who: "код" },
  judge: { tag: "judge", who: "Jev" },
  compare: { tag: "compare", who: "Jev" },
  decide: { tag: "decide", who: "код" },
  error: { tag: "error", who: "Jev" },
};

/**
 * The harness run, step by step. Who did each step — our code or the model — is the
 * first thing on every line, because that is the point of looking.
 */
export function JevTrace({ steps }: { steps: HarnessStep[] }) {
  const judges = steps.filter((s) => s.kind === "judge");
  const rest = steps.filter((s) => s.kind !== "judge");
  const ordered = [
    ...rest.filter((s) => s.kind === "measure"),
    ...judges,
    ...rest.filter((s) => s.kind !== "measure"),
  ];

  return (
    <ol className="border-t border-white/[0.06]">
      {ordered.map((step, i) => (
        <li key={i} className="border-b border-white/[0.06]">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-baseline gap-4 py-3 text-[13.5px] [&::-webkit-details-marker]:hidden">
              <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-white/30">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "w-14 shrink-0 font-mono text-[11px] uppercase tracking-[0.14em]",
                  KIND[step.kind].who === "Jev" ? "text-primary" : "text-white/45",
                  step.kind === "error" && "text-destructive",
                )}
              >
                {KIND[step.kind].who}
              </span>
              <span className="min-w-0 flex-1 text-white/80">{step.label}</span>
              {"ms" in step && (
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-white/40">
                  {step.ms} ms
                </span>
              )}
              <span className="shrink-0 text-white/30 transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="pb-4 pl-[6.5rem]">
              <StepDetail step={step} />
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}

function StepDetail({ step }: { step: HarnessStep }) {
  switch (step.kind) {
    case "measure":
      return (
        <p className="text-[12.5px] text-white/50">
          {step.candidates} кандидата подадени към Jev. Всички имат 6 на 6 и са проверени от кода.
        </p>
      );
    case "decide":
      return (
        <p className="font-mono text-[12px] text-white/55">избрани: {step.picked.join(", ")}</p>
      );
    case "error":
      return <p className="font-mono text-[12px] text-destructive">{step.message}</p>;
    case "judge":
    case "compare":
      return (
        <div className="space-y-4">
          <p className="font-mono text-[11.5px] text-white/40">
            {step.model}
            {step.tokens !== null && ` · ${step.tokens} токена`}
          </p>
          <Answers answers={step.answers} />
          <details>
            <summary className="cursor-pointer text-[12px] text-white/45 hover:text-white/70">
              Какво видя Jev (state + въпроси)
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-white/[0.06] bg-black/30 p-3 font-mono text-[11px] leading-[1.6] text-white/60">
              {JSON.stringify({ state: step.state, questions: step.questions }, null, 2)}
            </pre>
          </details>
        </div>
      );
  }
}

/** Probabilities as bars — the whole point of a calibrated model is the distribution. */
function Answers({ answers }: { answers: Record<string, unknown> }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {Object.entries(answers).map(([key, raw]) => {
        const a = raw as {
          type: string;
          value: string | boolean;
          probability: number;
          probabilities?: Record<string, number>;
        };
        const dist =
          a.probabilities ??
          (a.type === "boolean" ? { да: a.probability, не: 1 - a.probability } : {});
        return (
          <div key={key}>
            <p className="eyebrow">{key}</p>
            <p className="mt-1 text-[13px]">
              → <span className="font-medium">{String(a.value === true ? "да" : a.value === false ? "не" : a.value)}</span>
            </p>
            <ul className="mt-2 space-y-1">
              {Object.entries(dist)
                .sort((x, y) => y[1] - x[1])
                .slice(0, 6)
                .map(([label, p]) => (
                  <li key={label} className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                    <span className="w-20 shrink-0 truncate text-white/50">{label}</span>
                    <span className="h-1.5 flex-1 rounded-full bg-white/[0.06]">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.round(p * 100)}%` }}
                      />
                    </span>
                    <span className="w-9 text-right text-white/60">{Math.round(p * 100)}%</span>
                  </li>
                ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
