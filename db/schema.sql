-- Squad Six schema. Applied by hand (Neon console / MCP). Safe to re-run on an empty
-- database; `db/reset.sql` drops everything first.

create extension if not exists pgcrypto;

-- Everyone who can play. Names are kept in both scripts because the site is bilingual:
-- the Bulgarian page says "Венцислав", the English one "Ventsislav". What is shown is the
-- first name, plus the surname's initial when two active players share a first name —
-- that is computed, never stored.
--
-- rating: 1.0–5.0 in half steps, set by the admin. NULL = not rated yet (a new guest, or a
-- regular the admin has not scored) and is counted as 2.5. Ratings never leave the
-- server unless the admin is signed in.
create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  first_bg    text not null,
  last_bg     text not null default '',
  first_en    text not null,
  last_en     text not null default '',
  rating      numeric(2,1) check (rating is null or (rating between 1 and 5 and rating * 2 = floor(rating * 2))),
  is_guest    boolean not null default false,
  -- Hidden players are not offered for selection but keep their place in old games.
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- One game day. At most one per calendar day (Sofia time) — opening the app again the
-- same day finds the existing game instead of starting a second.
create table if not exists matchdays (
  id                  uuid primary key default gen_random_uuid(),
  played_on           date not null unique default (now() at time zone 'Europe/Sofia')::date,
  locked_at           timestamptz,
  locked_proposal_id  uuid,
  winner              text check (winner in ('a', 'b', 'draw')),
  score_a             smallint check (score_a >= 0),
  score_b             smallint check (score_b >= 0),
  created_at          timestamptz not null default now()
);

create table if not exists matchday_players (
  matchday_id uuid not null references matchdays(id) on delete cascade,
  player_id   uuid not null references players(id),
  primary key (matchday_id, player_id)
);

-- One harness run per "make teams". Capped at three per game day in the app.
create table if not exists balance_runs (
  id           uuid primary key default gen_random_uuid(),
  matchday_id  uuid not null references matchdays(id) on delete cascade,
  model        text not null,
  source       text not null check (source in ('jev', 'fallback')),
  trace        jsonb not null default '[]',
  error        text,
  duration_ms  integer not null,
  created_at   timestamptz not null default now()
);

create table if not exists proposals (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references balance_runs(id) on delete cascade,
  matchday_id  uuid not null references matchdays(id) on delete cascade,
  -- 1 = Jev's first choice. Also the tie-break when votes are level.
  position     smallint not null check (position between 1 and 3),
  team_a       uuid[] not null,
  team_b       uuid[] not null,
  total_a      numeric(4,1) not null,
  total_b      numeric(4,1) not null,
  verdict      jsonb,
  created_at   timestamptz not null default now()
);

alter table matchdays drop constraint if exists matchdays_locked_proposal_fk;
alter table matchdays add constraint matchdays_locked_proposal_fk
  foreign key (locked_proposal_id) references proposals(id) on delete set null;

-- Only the twelve playing vote, one vote each; voting again moves the vote.
create table if not exists votes (
  matchday_id  uuid not null references matchdays(id) on delete cascade,
  player_id    uuid not null references players(id),
  proposal_id  uuid not null references proposals(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (matchday_id, player_id)
);

-- Everything anyone does, including refusals. Admin-only; trimmed to 90 days.
create table if not exists activity_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  action       text not null,
  ok           boolean not null default true,
  actor        text,
  matchday_id  uuid,
  detail       jsonb,
  ip           text,
  user_agent   text
);

create index if not exists proposals_matchday_idx on proposals (matchday_id, created_at desc);
create index if not exists activity_log_at_idx on activity_log (at desc);
