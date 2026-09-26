-- Squad Six schema. Applied by hand (Neon console / MCP) — small enough not to need a
-- migration tool yet. Each statement is idempotent so the file can be re-run.

create extension if not exists pgcrypto;

-- Everyone who has ever played. Office regulars carry a rating from 1.0 to 5.0 in half
-- steps. Guests ("other") have no rating: NULL means "unknown", and the balancer reads
-- it as 2.5 while the UI shows "?".
create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  rating      numeric(2,1) check (rating is null or (rating between 1 and 5 and rating * 2 = floor(rating * 2))),
  is_guest    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (is_guest or rating is not null)
);

-- One game day: who turned up, the proposals Jev made, the votes on them.
create table if not exists matchdays (
  id          uuid primary key default gen_random_uuid(),
  played_on   date not null default current_date,
  created_at  timestamptz not null default now()
);

create table if not exists matchday_players (
  matchday_id uuid not null references matchdays(id) on delete cascade,
  player_id   uuid not null references players(id),
  primary key (matchday_id, player_id)
);

-- One Jev run per "make teams" click: the whole harness trace is kept so you can read
-- how the model got to its answer.
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
  position     smallint not null check (position between 1 and 3),
  team_a       uuid[] not null,
  team_b       uuid[] not null,
  total_a      numeric(4,1) not null,
  total_b      numeric(4,1) not null,
  rationale    text not null,
  -- Jev's answers about this split (null when the fallback made it).
  verdict      jsonb,
  created_at   timestamptz not null default now()
);
alter table proposals add column if not exists verdict jsonb;

-- One vote per person per game day; voting again moves the vote.
create table if not exists votes (
  matchday_id  uuid not null references matchdays(id) on delete cascade,
  voter        text not null,
  proposal_id  uuid not null references proposals(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (matchday_id, voter)
);

create index if not exists proposals_matchday_idx on proposals (matchday_id, created_at desc);
