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

Every step is stored and shown under "Как реши Jev" on the match page. Without
`TYPESAFE_API_KEY` the app still works, uses arithmetic only, and says so in a warning.

Ratings are 1.0–5.0 in half steps. Guests have no rating: shown as `?`, counted as 2.5.

## Stack

TanStack Start (Router + server functions) · TanStack Query · TanStack Form · TanStack AI
(`decide()` + `@tanstack/ai-typesafe`) · Neon Postgres · Tailwind v4 + shadcn primitives,
design language from RefAI · deployed on Vercel (Nitro).

## Run

```bash
cp .env.example .env.local   # fill DATABASE_URL and TYPESAFE_API_KEY
pnpm install
pnpm dev
```

Schema: `db/schema.sql`. Placeholder roster: `db/seed.sql`.

## v2

Admin screen: add / edit / retire players, change ratings. Sign-in for voting.
