// A stand-in for `src/server/db.ts` in the server tests: `sql` records every query (its
// text with the placeholders as `?`, whitespace collapsed, and its values) and answers
// with the rows a test registered for a fragment of that text. Nothing reaches Neon.
//   vi.mock("./db", () => import("../../test/fake-sql"));

type Rows = Record<string, unknown>[];
type Answer = Rows | ((values: unknown[]) => Rows);

interface Rule {
  answer: Answer;
  fragment: string;
  once: boolean;
}

export interface Query {
  text: string;
  values: unknown[];
}

export const queries: Query[] = [];
const rules: Rule[] = [];

export function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Rows> {
  const text = strings.join("?").replace(/\s+/gu, " ").trim();
  queries.push({ text, values });
  // One-off answers first, in the order they were given; then the standing ones.
  const index = [
    ...rules.flatMap((r, i) => (r.once ? [i] : [])),
    ...rules.flatMap((r, i) => (r.once ? [] : [i])),
  ].find((i) => text.includes(rules[i]?.fragment ?? "\0"));
  const rule = index === undefined ? undefined : rules[index];
  if (!rule || index === undefined) {
    return Promise.resolve([]);
  }
  if (rule.once) {
    rules.splice(index, 1);
  }
  return Promise.resolve(
    typeof rule.answer === "function" ? rule.answer(values) : rule.answer
  );
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

/** Every query whose text holds `fragment` gets these rows (until reset). */
export function answer(fragment: string, rows: Answer) {
  rules.push({ fragment, answer: rows, once: false });
}

/** The next query whose text holds `fragment` gets these rows; later ones fall through. */
export function answerOnce(fragment: string, rows: Answer) {
  rules.push({ fragment, answer: rows, once: true });
}

/** The queries whose text holds `fragment`, in the order they ran. */
export function ran(fragment: string): Query[] {
  return queries.filter((q) => q.text.includes(fragment));
}

export function resetSql() {
  queries.length = 0;
  rules.length = 0;
}
