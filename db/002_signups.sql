-- 002: announcements, sign-ups and venues (2026-09-28 grilling). Idempotent.

create table if not exists venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  map_url     text,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index if not exists venues_name_idx on venues (lower(name));

-- A game is either announced (date, time, place; people sign up) or quick (twelve ticked
-- on the spot). Quick games never lock or make teams on their own.
alter table matchdays add column if not exists kind text not null default 'quick';
alter table matchdays drop constraint if exists matchdays_kind_check;
alter table matchdays add constraint matchdays_kind_check check (kind in ('announced', 'quick'));
alter table matchdays add column if not exists starts_at timestamptz;
alter table matchdays add column if not exists venue_id uuid references venues(id);
alter table matchdays add column if not exists note text;
alter table matchdays add column if not exists created_by uuid references players(id);
-- The latest edit, shown on the announcement: [{ field, from, to }].
alter table matchdays add column if not exists changes jsonb;
alter table matchdays add column if not exists changed_at timestamptz;
alter table matchdays add column if not exists cancelled_at timestamptz;
alter table matchdays add column if not exists cancel_reason text;
-- Set once, when the automatic "teams two hours before" has been claimed.
alter table matchdays add column if not exists auto_teams_at timestamptz;

-- One game a day — but a cancelled one no longer holds its day.
alter table matchdays drop constraint if exists matchdays_played_on_key;
create unique index if not exists matchdays_one_per_day on matchdays (played_on) where cancelled_at is null;

-- The list. Order is computed (see src/domain/signup.ts); matchday_players holds the
-- twelve currently in.
create table if not exists signups (
  matchday_id  uuid not null references matchdays(id) on delete cascade,
  player_id    uuid not null references players(id),
  added_by     uuid references players(id),
  created_at   timestamptz not null default now(),
  primary key (matchday_id, player_id)
);

-- Re-dos the app does by itself (someone dropped out, teams two hours before) don't use
-- up the three tries people get.
alter table balance_runs add column if not exists trigger text not null default 'manual';
alter table balance_runs drop constraint if exists balance_runs_trigger_check;
alter table balance_runs add constraint balance_runs_trigger_check check (trigger in ('manual', 'auto'));

-- Existing games: their twelve become their sign-up list.
insert into signups (matchday_id, player_id, created_at)
select mp.matchday_id, mp.player_id, m.created_at
from matchday_players mp join matchdays m on m.id = mp.matchday_id
on conflict do nothing;
