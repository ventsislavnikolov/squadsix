-- Who plays with whom, quietly. Admin-only: nothing outside the admin's pages mentions
-- these, and Jev is never told. The balancer keeps every rule when it can, and breaks as
-- few as possible when it can't.
--   together  2–3 players always on one side. A player is in at most one such group.
--   apart     2 players never on one side. A player has at most two Apart partners.
-- The cross-row limits live in src/domain/rules.ts; the table only knows the shapes.
-- Players are never deleted, so the ids always resolve; a hidden one just never plays.
create table if not exists team_rules (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('together', 'apart')),
  players     uuid[] not null check (
                (kind = 'together' and cardinality(players) between 2 and 3) or
                (kind = 'apart' and cardinality(players) = 2)),
  created_at  timestamptz not null default now()
);
