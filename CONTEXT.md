# Squad Six — context

Picks fair 6-a-side teams for the office game. The words below are the ones the code uses.

## Glossary

- **Player**: someone on the list. Has a name in both scripts (`first_bg/last_bg`, `first_en/last_en`).
- **Short name**: what's shown. It's the first name, plus the surname's initial when two players share a first name ("Ивайло В.", "Ивайло П."). It's computed and never stored (`src/domain/names.ts`).
- **Guest**: a player from outside the office. The name is typed once in either script, and the other script is transliterated. Guests who haven't played for 60 days drop off the pick list but are not deleted.
- **Rating**: 1.0–5.0 in half steps, set by the admin. `null` means unrated and counts as 2.5. Only the admin ever receives ratings from the server.
- **Hidden**: can't be picked, but stays in old games. Players are hidden, never deleted.
- **Matchday**: one game day. There's at most one per calendar day (Sofia time), always with exactly 12 players.
- **Proposal**: one of three candidate splits. Position 1 is Jev's first choice.
- **Run**: one harness execution (`balance_runs`). There are at most 3 per matchday, and a new run is only allowed before anyone has voted.
- **Lock**: ends voting. Anyone can lock, and the proposal with the most votes wins. A tie goes to the lower position. Only the admin can unlock.
- **Result**: the winner (A, B or draw) is required, and the score is optional. It's entered after the lock.

## Decisions (2026-09-26 grilling)

1. The roster is the 27 people in the Messenger group. BG and EN names are stored; the site is bilingual and BG is the default.
2. Ratings are given by the admin alone and are visible only to the admin. Other people see only the gap between teams and Jev's verdict, never the team totals.
3. Admin credentials live in Vercel env: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (scrypt) and `SESSION_SECRET`. There's no player login; a voter picks their name from the 12, on trust.
4. Anyone can create a game, vote (only the 12 playing) and lock. These guards apply:
   - no new game while any game is still open (unlocked), whatever day it was made; "/" redirects to it
   - one game a day
   - new options only while there are 0 votes
   - Jev runs at most 3 times per game
   - locked games are frozen
5. There's an activity log of every action, refusals included, with IP and user agent. It's kept for 90 days and is admin-only.
6. After the lock, the teams can be shared to Messenger (share sheet or clipboard).
7. There are no goalkeepers or positions. It's always 12 players; odd numbers and other sizes are out of scope.
8. Jev's trace ("How Jev decided") and which model decided are shown only to the admin.
   Confirmations use an in-app dialog, never the browser's confirm().
9. Themes are light and dark, following the system by default. This departs from RefAI's single dark theme on purpose: the app is read on phones outdoors.

## Jev

Jev is a decision model, not a chat LLM. See `src/server/jev-harness.ts`. It's reached two ways: TypeSafe directly (`TYPESAFE_API_KEY`), or through OpenRouter (`OPENROUTER_API_KEY`, model `~typesafe/jev-latest`). Without either key, the app uses arithmetic only and says so.
