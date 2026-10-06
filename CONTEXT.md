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
- **Run**: one harness execution (`balance_runs`). There are at most 3 per matchday, and a new run is only allowed before anyone has voted. Only the admin can ask for a new run.
- **Lock**: ends voting. Only the admin can lock early (the game also locks itself at kick-off), and the proposal with the most votes wins. A tie goes to the lower position. Only the admin can unlock.
- **Result**: the winner (A, B or draw) is required, and the score is optional (a full score names the winner). Only the admin enters it, after the lock; everyone else sees it.
- **Balls**: someone takes the balls home after each game. The "Топки" tab shows who has them and who had them before. Anyone who has picked their name can say "I took them"; the holder or the admin can hand them to someone. On trust, like the sign-up list, and logged.

## Decisions (2026-09-26 grilling)

1. The roster is the 26 people in the Messenger group. BG and EN names are stored; the site is bilingual and BG is the default.
2. Ratings are given by the admin alone and are visible only to the admin. Other people see only the gap between teams and Jev's verdict, never the team totals.
3. Admin credentials live in Vercel env: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (scrypt) and `SESSION_SECRET`. There's no player login; a voter picks their name from the 12, on trust.
4. Anyone can create a game and vote (only the 12 playing). Since 2026-10-06 only the admin can lock, ask for new options, edit or cancel. These guards apply:
   - no new game while any game is still open (unlocked), whatever day it was made; "/" redirects to it
   - one game a day
   - new options only while there are 0 votes
   - Jev runs at most 3 times per game
   - locked games are frozen
5. There's an activity log of every action, refusals included, with IP and user agent. It's kept for 90 days and is admin-only.
6. Anyone can share to Messenger (share sheet or clipboard): the announcement before the lock, the teams after it.
7. There are no goalkeepers or positions. It's always 12 players; odd numbers and other sizes are out of scope.
8. Jev's trace ("How Jev decided") is shown only to the admin; the "decided by" model line is gone.
   Confirmations use an in-app dialog, never the browser's confirm().
9. Themes are light and dark, following the system by default. This departs from RefAI's single dark theme on purpose: the app is read on phones outdoors.
10. Look (2026-09-27): shadcn preset `b2qMGAMQi` (style `radix-rhea`) for components, plus the user's palette in `src/styles.css` (green primary, Outfit). Outfit has no Cyrillic, so Onest fills in the Bulgarian letters.

## Sign-up (2026-09-28 grilling)

- **Announcement**: day, time and place, plus an optional note. Anyone can announce, on trust, as the name picked on their phone. It can be at most 14 days ahead and never in the past. Only one game can be open at a time.
- **Venue**: a name and an optional Google Maps link. Anyone can add one while announcing; the admin edits or hides venues at /admin/venues.
- **Sign-up list**: the first 12 play and the rest are reserves. Guests can only be signed up in the last 24 hours before kick-off of an announced game (the admin can add one earlier; quick games have no such limit). From then on whoever signs up joins the back of the queue and nobody is pushed out (`src/domain/signup.ts`).
- **Adding and removing**: you can sign up yourself, another player, or a guest, and the list shows who added whom. A name can be removed by the player, by whoever added them, or by the admin.
- **Teams**: "Make teams" appears once 12 are in. If nobody presses it, the app makes them itself 2 hours before kick-off.
- **Dropouts**: before the lock, a reserve comes in, the teams are remade and the votes are cleared; these automatic re-dos don't use up the 3 tries. After the lock, the reserve takes the leaver's exact place. With no reserve, the page says "N more needed".
- **Kick-off**: sign-up and voting close, the game locks itself, and the result can be entered. A game without 12 players never locks itself.
- **Edit and cancel**: only the admin can do either (until 2026-10-06 the announcer could too). The page shows what changed. A cancelled game stays in the history and frees its day.
- **Quick pick**: still available when nothing is announced. Time and place are optional and pre-filled, and it never acts on its own.
- **No scheduler**: Vercel cron needs a paid plan, so the time-based steps run whenever someone opens the app (`repo.dueNow`, called from `getOpenMatch` and `getMatchday`).
- **Players** keep their real names; there are no nicknames.

## Jev

Jev is a decision model, not a chat LLM. See `src/server/jev-harness.ts`. It's reached two ways: TypeSafe directly (`TYPESAFE_API_KEY`), or through OpenRouter (`OPENROUTER_API_KEY`, model `~typesafe/jev-latest`). Without either key, the app uses arithmetic only and says so.
