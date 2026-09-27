# Squad Six

Picks fair 6-a-side teams for the office game. Choose the twelve who turned up, get three
proposals, everyone votes.

## How the teams are chosen

Jev (TypeSafe AI) is a *decision* model: it answers typed questions (yes/no, pick one, score)
with calibrated probabilities. It does not write text and is weak at arithmetic, so the
harness in `src/server/jev-harness.ts` splits the work:

1. **measure** (code): try all 462 ways to split 12 into 6 + 6, keep ~10 near-even, distinct ones
2. **judge** (Jev): score each candidate "one-sided → dead even" and "does it look stacked?"
3. **compare** (Jev): pick the best game out of all candidates
4. **decide** (code): rank on those answers, keep the top three

Every step is stored and shown under "Как реши Jev" on the match page. Jev is reached
through TypeSafe (`TYPESAFE_API_KEY`) or OpenRouter (`OPENROUTER_API_KEY`, model
`~typesafe/jev-latest`). Without either, the app uses arithmetic only and says so.

Ratings are admin-only. Rules and vocabulary: see `CONTEXT.md`.

## Stack

TanStack Start (Router + server functions) · TanStack Query · TanStack Form · TanStack AI
(`decide()` + `@tanstack/ai-typesafe`) · Neon Postgres · Tailwind v4 + shadcn/ui (`radix-rhea`
preset), Outfit + Onest · deployed on Vercel (Nitro).

## Run

```bash
cp .env.example .env.local   # fill in the values
pnpm install
pnpm dev
```

Schema: `db/schema.sql`. Placeholder roster: `db/seed.sql`.

## Later

Players' own sign-in; anonymous peer ratings; rating suggestions from results.
