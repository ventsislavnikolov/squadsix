// Every query the app makes, in one place. Rows come back from Postgres as loose records
// (numerics as strings); this file is where they become domain types.

import type { Player } from "@/domain/balance";
import type { HarnessStep, Verdict } from "./jev-harness";
import { sql } from "./db";

export type Proposal = {
  id: string;
  position: number;
  teamA: string[];
  teamB: string[];
  totalA: number;
  totalB: number;
  rationale: string;
  verdict: Verdict | null;
};

export type BalanceRun = {
  id: string;
  model: string;
  source: "jev" | "fallback";
  trace: HarnessStep[];
  error: string | null;
  durationMs: number;
  createdAt: string;
};

export type Vote = { voter: string; proposalId: string };

export type Matchday = {
  id: string;
  playedOn: string;
  players: Player[];
  run: BalanceRun | null;
  proposals: Proposal[];
  votes: Vote[];
};

export type MatchdaySummary = {
  id: string;
  playedOn: string;
  playerCount: number;
  voteCount: number;
};

function toPlayer(r: Record<string, unknown>): Player {
  return {
    id: String(r.id),
    name: String(r.name),
    rating: r.rating === null ? null : Number(r.rating),
    isGuest: Boolean(r.is_guest),
  };
}

export async function listPlayers(): Promise<Player[]> {
  const rows = await sql`
    select id, name, rating, is_guest from players
    where active
    order by is_guest, name`;
  return rows.map(toPlayer);
}

/** Adds an unrated guest, or returns the existing one with that name. */
export async function addGuest(name: string): Promise<Player> {
  const [row] = await sql`
    insert into players (name, rating, is_guest) values (${name}, null, true)
    on conflict (name) do update set active = true
    returning id, name, rating, is_guest`;
  return toPlayer(row!);
}

export async function createMatchday(playerIds: string[]): Promise<string> {
  const [row] = await sql`insert into matchdays default values returning id`;
  const id = String(row!.id);
  await sql`
    insert into matchday_players (matchday_id, player_id)
    select ${id}::uuid, unnest(${playerIds}::uuid[])`;
  return id;
}

export async function getSquad(matchdayId: string): Promise<Player[]> {
  const rows = await sql`
    select p.id, p.name, p.rating, p.is_guest
    from matchday_players mp join players p on p.id = mp.player_id
    where mp.matchday_id = ${matchdayId}
    order by p.rating desc nulls last, p.name`;
  return rows.map(toPlayer);
}

export async function saveRun(
  matchdayId: string,
  run: Omit<BalanceRun, "id" | "createdAt">,
  proposals: Omit<Proposal, "id">[],
): Promise<void> {
  const [row] = await sql`
    insert into balance_runs (matchday_id, model, source, trace, error, duration_ms)
    values (${matchdayId}, ${run.model}, ${run.source}, ${JSON.stringify(run.trace)}::jsonb,
            ${run.error}, ${run.durationMs})
    returning id`;
  const runId = String(row!.id);
  for (const p of proposals) {
    await sql`
      insert into proposals
        (run_id, matchday_id, position, team_a, team_b, total_a, total_b, rationale, verdict)
      values (${runId}, ${matchdayId}, ${p.position}, ${p.teamA}::uuid[], ${p.teamB}::uuid[],
              ${p.totalA}, ${p.totalB}, ${p.rationale},
              ${p.verdict ? JSON.stringify(p.verdict) : null}::jsonb)`;
  }
  // A new set of proposals makes old votes meaningless.
  await sql`delete from votes where matchday_id = ${matchdayId}`;
}

export async function getMatchday(id: string): Promise<Matchday | null> {
  const [day] = await sql`select id, played_on::text from matchdays where id = ${id}`;
  if (!day) return null;

  const [players, runs, votes] = await Promise.all([
    getSquad(id),
    sql`
      select id, model, source, trace, error, duration_ms, created_at::text
      from balance_runs where matchday_id = ${id}
      order by created_at desc limit 1`,
    sql`select voter, proposal_id from votes where matchday_id = ${id} order by created_at`,
  ]);

  const r = runs[0];
  const run: BalanceRun | null = r
    ? {
        id: String(r.id),
        model: String(r.model),
        source: r.source as BalanceRun["source"],
        trace: r.trace as HarnessStep[],
        error: (r.error as string | null) ?? null,
        durationMs: Number(r.duration_ms),
        createdAt: String(r.created_at),
      }
    : null;

  const proposals = run
    ? (
        await sql`
          select id, position, team_a::text[] as team_a, team_b::text[] as team_b,
                 total_a, total_b, rationale, verdict
          from proposals where run_id = ${run.id} order by position`
      ).map((p) => ({
        id: String(p.id),
        position: Number(p.position),
        teamA: p.team_a as string[],
        teamB: p.team_b as string[],
        totalA: Number(p.total_a),
        totalB: Number(p.total_b),
        rationale: String(p.rationale),
        verdict: (p.verdict as Verdict | null) ?? null,
      }))
    : [];

  return {
    id: String(day.id),
    playedOn: String(day.played_on),
    players,
    run,
    proposals,
    votes: votes.map((v) => ({ voter: String(v.voter), proposalId: String(v.proposal_id) })),
  };
}

export async function castVote(matchdayId: string, voter: string, proposalId: string) {
  await sql`
    insert into votes (matchday_id, voter, proposal_id)
    select ${matchdayId}, ${voter}, id from proposals
    where id = ${proposalId} and matchday_id = ${matchdayId}
    on conflict (matchday_id, voter)
    do update set proposal_id = excluded.proposal_id, created_at = now()`;
}

export async function listMatchdays(): Promise<MatchdaySummary[]> {
  const rows = await sql`
    select m.id, m.played_on::text,
           (select count(*) from matchday_players mp where mp.matchday_id = m.id) as player_count,
           (select count(*) from votes v where v.matchday_id = m.id) as vote_count
    from matchdays m
    order by m.created_at desc
    limit 20`;
  return rows.map((r) => ({
    id: String(r.id),
    playedOn: String(r.played_on),
    playerCount: Number(r.player_count),
    voteCount: Number(r.vote_count),
  }));
}
