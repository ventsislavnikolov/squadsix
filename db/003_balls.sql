-- Who has the balls. Someone takes them home after every game; the newest row is where
-- they are now, the older rows are the trail.
create table if not exists ball_holders (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references players(id),
  since      timestamptz not null default now(),
  set_by     uuid references players(id)
);

create index if not exists ball_holders_since_idx on ball_holders (since desc);

-- They start with Венцислав.
insert into ball_holders (player_id)
select id from players
where first_bg = 'Венцислав' and last_bg = 'Николов'
  and not exists (select 1 from ball_holders);
