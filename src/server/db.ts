// Postgres on Neon, over HTTP — one round trip per query, no pool to keep warm, which is
// what a Vercel function wants. Server-only: never import this from a component.

import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | undefined;

export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  client ??= neon(requireEnv("DATABASE_URL"));
  return client(strings, ...values) as Promise<Record<string, unknown>[]>;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
