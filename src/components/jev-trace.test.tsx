// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HarnessStep } from "@/server/jev-harness";
import { renderComponent } from "../../test/render-component";
import { JevTrace } from "./jev-trace";

vi.mock("@/server/functions", () => import("../../test/server-functions"));

const FIRST_BY_CODE = /^01code.*4 ms›$/u;
const SECOND_BY_JEV = /^02Jev.*120 ms›$/u;
const SIXTH_BY_JEV = /^06Jev.*›$/u;
const THREE_RULES = /Rules binding today's 12: 3/u;
const ALL_KEPT = /All kept\./u;
const EIGHT_SENT = /8 candidates sent/u;
const RULES_BINDING = /Rules binding/u;
const STATE_JSON = /"teams": "A vs B"/u;

const judge = (candidate: string, state: HarnessStep): HarnessStep => ({
  ...(state as Extract<HarnessStep, { kind: "judge" }>),
  candidate,
});

const JUDGE: HarnessStep = {
  answers: {
    fair: {
      legend: { "0": "one-sided", "1": "uneven", "2": "close", "3": "level" },
      probabilities: { "0": 0.05, "1": 0.15, "2": 0.3, "3": 0.5 },
      probability: 0.5,
      type: "score",
      value: "3",
    },
    stacked: { probability: 0.25, type: "boolean", value: false },
  },
  candidate: "c1",
  kind: "judge",
  model: "jev-1",
  ms: 120,
  questions: { fair: "How fair?" },
  state: { teams: "A vs B" },
  tokens: 900,
};

const STEPS: HarnessStep[] = [
  { kind: "decide", mode: "jev", ms: 1, picked: ["c2", "c10", "c1"] },
  judge("c10", JUDGE),
  {
    answers: {
      best: {
        probabilities: { c1: 0.2, c10: 0.7, c2: 0.1 },
        probability: 0.7,
        type: "choice",
        value: "c10",
      },
      sure: { probability: 0.9, type: "boolean", value: true },
    },
    kind: "compare",
    model: "jev-1",
    ms: 300,
    questions: {},
    state: null,
    tokens: null,
  },
  judge("c2", JUDGE),
  {
    broken: 1,
    candidates: 10,
    combinations: 462,
    kind: "measure",
    ms: 4,
    rules: 3,
  },
  { kind: "error", message: "rate limited" },
];

describe("JevTrace", () => {
  it("lists the steps in harness order, judges by candidate number", async () => {
    renderComponent(<JevTrace steps={STEPS} />);
    const items = await screen.findAllByRole("listitem");
    const labels = items
      .filter((li) => li.parentElement?.tagName === "OL")
      .map((li) => li.querySelector("summary")?.textContent ?? "");
    expect(labels).toHaveLength(6);
    expect(labels[0]).toContain(
      "The code tried all 462 splits and kept 10 near-even, distinct ones"
    );
    expect(labels[1]).toContain("Jev rated option c2");
    expect(labels[2]).toContain("Jev rated option c10");
    expect(labels[3]).toContain("Jev compared all options");
    expect(labels[4]).toContain("The code ranked");
    expect(labels[5]).toContain("Jev returned an error");
  });

  it("says who did each step and how long it took", async () => {
    renderComponent(<JevTrace steps={STEPS} />);
    const summaries = (await screen.findAllByRole("listitem"))
      .map((li) => li.querySelector("summary"))
      .filter((s): s is HTMLElement => s !== null);
    expect(summaries[0]?.textContent).toMatch(FIRST_BY_CODE);
    expect(summaries[1]?.textContent).toMatch(SECOND_BY_JEV);
    expect(summaries[5]?.textContent).toMatch(SIXTH_BY_JEV);
    expect(summaries[5]?.textContent).not.toContain("ms");
  });

  it("details the measure, decide and error steps", async () => {
    renderComponent(<JevTrace steps={STEPS} />);
    expect(
      await screen.findByText(
        "10 candidates sent to Jev. All are 6-a-side and checked by the code."
      )
    ).toBeTruthy();
    const rules = screen.getByText(THREE_RULES);
    expect(rules.textContent).toContain("1 broken");
    expect(rules.className).toContain("text-warning");
    expect(screen.getByText("picked: c2, c10, c1")).toBeTruthy();
    expect(screen.getByText("rate limited")).toBeTruthy();
  });

  it("shows a step kind it does not know as a bare row instead of crashing", async () => {
    const future = { kind: "review", ms: 7 } as unknown as HarnessStep;
    renderComponent(<JevTrace steps={[future]} />);
    const [row] = await screen.findAllByRole("listitem");
    expect(row?.querySelector("summary")?.textContent).toContain("7 ms");
  });

  it("says every rule held, and skips rules for older runs", async () => {
    renderComponent(
      <JevTrace
        steps={[
          {
            broken: 0,
            candidates: 10,
            combinations: 462,
            kind: "measure",
            ms: 4,
            rules: 2,
          },
          { kind: "decide", mode: "fallback", ms: 1, picked: [] },
        ]}
      />
    );
    expect(await screen.findByText(ALL_KEPT)).toBeTruthy();
    expect(
      screen.getByText("Without Jev: the three with the smallest gap")
    ).toBeTruthy();
  });

  it("skips the rules line for runs from before rules", async () => {
    renderComponent(
      <JevTrace
        steps={[
          { candidates: 8, combinations: 462, kind: "measure", ms: 4 },
          { kind: "error", message: "a" },
          { kind: "error", message: "b" },
        ]}
      />
    );
    expect(await screen.findByText(EIGHT_SENT)).toBeTruthy();
    expect(screen.queryByText(RULES_BINDING)).toBeNull();
  });

  it("shows Jev's answers as distributions, with what it saw", async () => {
    renderComponent(<JevTrace steps={[judge("c1", JUDGE)]} />);
    const [step] = await screen.findAllByRole("listitem");
    if (!step) {
      throw new Error("a step expected");
    }
    expect(within(step).getByText("jev-1 · 900 tokens")).toBeTruthy();
    // Score levels come out of the legend, worded when the app knows them.
    expect(
      within(step).getByText("level", { selector: "span.font-medium" })
    ).toBeTruthy();
    expect(within(step).getByText("one-sided")).toBeTruthy();
    expect(within(step).getByText("50%")).toBeTruthy();
    // A boolean answer is a yes/no split.
    expect(
      within(step).getByText("no", { selector: "span.font-medium" })
    ).toBeTruthy();
    expect(within(step).getByText("75%")).toBeTruthy();
    expect(within(step).getByText(STATE_JSON)).toBeTruthy();
  });

  it("hides what Jev saw from anyone but the admin", async () => {
    renderComponent(<JevTrace steps={STEPS} />);
    expect(
      await screen.findByText(
        "Only the admin can see exactly what Jev saw, because it contains ratings."
      )
    ).toBeTruthy();
    expect(screen.getByText("jev-1")).toBeTruthy();
    // The compare step's choice and its yes answer.
    expect(screen.getAllByText("c10").length).toBeGreaterThan(0);
    expect(screen.getAllByText("yes").length).toBeGreaterThan(0);
  });

  it("shows a score with no distribution", async () => {
    renderComponent(
      <JevTrace
        steps={[
          {
            ...judge("c1", JUDGE),
            answers: { fair: { probability: 1, type: "score", value: "x" } },
          } as HarnessStep,
        ]}
      />
    );
    expect(await screen.findByText("x")).toBeTruthy();
  });
});
