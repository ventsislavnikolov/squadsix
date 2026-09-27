// Every query the app makes, in one place. Rows come back from Postgres as loose records
// (numerics as strings); this file is where they become typed values — and where ratings
// are dropped for anyone who is not the admin. Nothing above this layer decides that.

import type { Player } from "@/domain/balance";
import { nameFromInput, shortNames, type PersonName, type ShortName } from "@/domain/names";
import { sql } from "./db";
import type { HarnessStep, Verdict } from "./jev-harness";

/** A guest who hasn't played for this long drops off the pick list (not deleted). */
const GUEST_FRESH_DAYS = 60;
export const MAX_RUNS_PER_MATCHDAY = 3;

/* ---------------------------------------------------------------------- players -- */

type PlayerRow = PersonName & {
  id: string;
  rating: number | null;
  isGuest: boolean;
  hidden: boolean;
  createdAt: string;
  lastPlayed: string | null;
};

export type RosterPlayer = {
  id: string;
  name: ShortName;
  isGuest: boolean;
  hidden: boolean;
  lastPlayed: string | null;
  /** Present only for the admin. `null` = not rated yet. */
  rating?: number | null;
  /** Present only for the admin — the full name in both scripts, for editing. */
  full?: PersonName;
};

async function playerRows(): Promise<PlayerRow[]> {
  const rows = await sql`
    select p.id, p.first_bg, p.last_bg, p.first_en, p.last_en, p.rating, p.is_guest, p.hidden,
           p.created_at::text,
           (select max(m.played_on)::text from matchday_players mp
              join matchdays m on m.id = mp.matchday_id
            where mp.player_id = p.id) as last_played
    from players p`;
  return rows.map((r) => ({
    id: String(r.id),
    firstBg: String(r.first_bg),
    lastBg: String(r.last_bg),
    firstEn: String(r.first_en),
    lastEn: String(r.last_en),
    rating: r.rating === null ? null : Number(r.rating),
    isGuest: Boolean(r.is_guest),
    hidden: Boolean(r.hidden),
    createdAt: String(r.created_at),
    lastPlayed: (r.last_played as string | null) ?? null,
  }));
}

function toRoster(rows: PlayerRow[], admin: boolean): RosterPlayer[] {
  // Short names are deduplicated across everyone, hidden included, so a name never
  // changes just because someone was hidden or came back.
  const names = shortNames(rows);
  return rows
    .map((r) => {
      const view: RosterPlayer = {
        id: r.id,
        name: names.get(r.id)!,
        isGuest: r.isGuest,
        hidden: r.hidden,
        lastPlayed: r.lastPlayed,
      };
      if (admin) {
        view.rating = r.rating;
        view.full = { firstBg: r.firstBg, lastBg: r.lastBg, firstEn: r.firstEn, lastEn: r.lastEn };
      }
      return view;
    })
    .sort((a, b) => Number(a.isGuest) - Number(b.isGuest) || a.name.bg.localeCompare(b.name.bg, "bg"));
}

/** Who can be picked today: visible regulars, and guests seen in the last 60 days. */
export async function pickList(admin: boolean): Promise<RosterPlayer[]> {
  const rows = await playerRows();
  const cutoff = Date.now() - GUEST_FRESH_DAYS * 86_400_000;
  const all = toRoster(rows, admin);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return all.filter((p) => {
    if (p.hidden) return false;
    if (!p.isGuest) return true;
    const row = byId.get(p.id)!;
    const seen = Date.parse(row.lastPlayed ?? row.createdAt);
    return seen >= cutoff;
  });
}

/** Everyone, hidden included — the admin screen. */
export async function fullRoster(): Promise<RosterPlayer[]> {
  return toRoster(await playerRows(), true);
}

/** A guest's name, typed once in either script. Reuses (and un-hides) a guest of the same name. */
export async function addGuest(input: string): Promise<{ id: string }> {
  const n = nameFromInput(input);
  const [existing] = await sql`
    update players set hidden = false
    where is_guest and lower(first_en) = lower(${n.firstEn}) and lower(last_en) = lower(${n.lastEn})
    returning id`;
  if (existing) return { id: String(existing.id) };
  const [row] = await sql`
    insert into players (first_bg, last_bg, first_en, last_en, rating, is_guest)
    values (${n.firstBg}, ${n.lastBg}, ${n.firstEn}, ${n.lastEn}, null, true)
    returning id`;
  return { id: String(row!.id) };
}

export type PlayerInput = PersonName & {
  id?: string;
  rating: number | null;
  isGuest: boolean;
  hidden: boolean;
};

export async function savePlayer(p: PlayerInput): Promise<{ id: string }> {
  if (p.id) {
    await sql`
      update players set first_bg = ${p.firstBg}, last_bg = ${p.lastBg}, first_en = ${p.firstEn},
             last_en = ${p.lastEn}, rating = ${p.rating}, is_guest = ${p.isGuest}, hidden = ${p.hidden}
      where id = ${p.id}`;
    return { id: p.id };
  }
  const [row] = await sql`
    insert into players (first_bg, last_bg, first_en, last_en, rating, is_guest, hidden)
    values (${p.firstBg}, ${p.lastBg}, ${p.firstEn}, ${p.lastEn}, ${p.rating}, ${p.isGuest}, ${p.hidden})
    returning id`;
  return { id: String(row!.id) };
}

/** "Иво Иванов" — for the activity log, which only the admin reads. */
export async function playerLabel(id: string): Promise<string> {
  const [row] = await sql`select first_bg, last_bg from players where id = ${id}`;
  return row ? `${row.first_bg} ${row.last_bg}`.trim() : id;
}

/* -------------------------------------------------------------------- matchdays -- */

export type ProposalView = {
  id: string;
  /** 1 = Jev's first choice; also the tie-break. */
  position: number;
  teamA: string[];
  teamB: string[];
  /** |total A − total B|. Safe to show: one number says little about any one person. */
  gap: number;
  /** Admin only. */
  totals?: { a: number; b: number };
  verdict: Verdict | null;
};

export type RunView = {
  model: string;
  source: "jev" | "fallback";
  error: string | null;
  durationMs: number;
  trace: HarnessStep[];
};

export type MatchdayView = {
  id: string;
  playedOn: string;
  lockedAt: string | null;
  lockedProposalId: string | null;
  winner: "a" | "b" | "draw" | null;
  scoreA: number | null;
  scoreB: number | null;
  players: RosterPlayer[];
  run: RunView | null;
  runsUsed: number;
  proposals: ProposalView[];
  votes: { playerId: string; proposalId: string }[];
};

export type MatchdaySummary = {
  id: string;
  playedOn: string;
  locked: boolean;
  winner: "a" | "b" | "draw" | null;
  scoreA: number | null;
  scoreB: number | null;
  voteCount: number;
};

/**
 * The game people should be looking at: one still open for voting (whatever day it was
 * made), otherwise today's. While there is one, no new game can be started.
 */
export async function openMatchdayId(): Promise<string | null> {
  const [row] = await sql`
    select id from matchdays
    where locked_at is null or played_on = (now() at time zone 'Europe/Sofia')::date
    order by (locked_at is null) desc, created_at desc
    limit 1`;
  return row ? String(row.id) : null;
}

/** Creates today's game — unless one is still open or today already has one. */
export async function createMatchday(
  playerIds: string[],
): Promise<{ id: string; created: boolean }> {
  const [row] = await sql`
    insert into matchdays (played_on)
    select (now() at time zone 'Europe/Sofia')::date
    where not exists (select 1 from matchdays where locked_at is null)
    on conflict (played_on) do nothing
    returning id`;
  if (!row) return { id: (await openMatchdayId())!, created: false };
  const id = String(row.id);
  await sql`
    insert into matchday_players (matchday_id, player_id)
    select ${id}::uuid, unnest(${playerIds}::uuid[])`;
  return { id, created: true };
}

/** The squad with ratings, and English short names — for the harness. Server-only. */
export async function squadForBalance(
  matchdayId: string,
): Promise<{ squad: Player[]; namesEn: Map<string, string> }> {
  const [rows, ids] = await Promise.all([
    playerRows(),
    sql`select player_id from matchday_players where matchday_id = ${matchdayId}`,
  ]);
  const inSquad = new Set(ids.map((r) => String(r.player_id)));
  const names = shortNames(rows);
  const squad = rows
    .filter((r) => inSquad.has(r.id))
    .map((r) => ({ id: r.id, rating: r.rating, isGuest: r.isGuest }));
  return { squad, namesEn: new Map(squad.map((p) => [p.id, names.get(p.id)!.en])) };
}

export async function matchdayState(id: string) {
  const [row] = await sql`
    select m.locked_at is not null as locked,
           (select count(*) from balance_runs r where r.matchday_id = m.id) as runs,
           (select count(*) from votes v where v.matchday_id = m.id) as votes
    from matchdays m where m.id = ${id}`;
  if (!row) return null;
  return { locked: Boolean(row.locked), runs: Number(row.runs), votes: Number(row.votes) };
}

export async function saveRun(
  matchdayId: string,
  run: Omit<RunView, "trace"> & { trace: HarnessStep[] },
  proposals: { teamA: string[]; teamB: string[]; totalA: number; totalB: number; verdict: Verdict | null }[],
): Promise<void> {
  const [row] = await sql`
    insert into balance_runs (matchday_id, model, source, trace, error, duration_ms)
    values (${matchdayId}, ${run.model}, ${run.source}, ${JSON.stringify(run.trace)}::jsonb,
            ${run.error}, ${run.durationMs})
    returning id`;
  const runId = String(row!.id);
  for (const [i, p] of proposals.entries()) {
    await sql`
      insert into proposals (run_id, matchday_id, position, team_a, team_b, total_a, total_b, verdict)
      values (${runId}, ${matchdayId}, ${i + 1}, ${p.teamA}::uuid[], ${p.teamB}::uuid[],
              ${p.totalA}, ${p.totalB}, ${p.verdict ? JSON.stringify(p.verdict) : null}::jsonb)`;
  }
}

export async function getMatchday(id: string, admin: boolean): Promise<MatchdayView | null> {
  const [day] = await sql`
    select id, played_on::text, locked_at::text, locked_proposal_id, winner, score_a, score_b,
           (select count(*) from balance_runs r where r.matchday_id = m.id) as runs
    from matchdays m where id = ${id}`;
  if (!day) return null;

  const [rows, squadIds, runs, votes] = await Promise.all([
    playerRows(),
    sql`select player_id from matchday_players where matchday_id = ${id}`,
    sql`
      select id, model, source, trace, error, duration_ms
      from balance_runs where matchday_id = ${id}
      order by created_at desc limit 1`,
    sql`select player_id, proposal_id from votes where matchday_id = ${id} order by created_at`,
  ]);

  const inSquad = new Set(squadIds.map((r) => String(r.player_id)));
  const players = toRoster(rows, admin).filter((p) => inSquad.has(p.id));

  const r = runs[0];
  const trace = (r?.trace ?? []) as HarnessStep[];
  const run: RunView | null = r
    ? {
        model: String(r.model),
        source: r.source as RunView["source"],
        error: (r.error as string | null) ?? null,
        durationMs: Number(r.duration_ms),
        trace: admin ? trace : [],
      }
    : null;

  const proposals: ProposalView[] = r
    ? (
        await sql`
          select id, position, team_a::text[] as team_a, team_b::text[] as team_b,
                 total_a, total_b, verdict
          from proposals where run_id = ${r.id} order by position`
      ).map((p) => {
        const a = Number(p.total_a);
        const b = Number(p.total_b);
        const view: ProposalView = {
          id: String(p.id),
          position: Number(p.position),
          teamA: p.team_a as string[],
          teamB: p.team_b as string[],
          gap: Math.round(Math.abs(a - b) * 10) / 10,
          verdict: (p.verdict as Verdict | null) ?? null,
        };
        if (admin) view.totals = { a, b };
        return view;
      })
    : [];

  return {
    id: String(day.id),
    playedOn: String(day.played_on),
    lockedAt: (day.locked_at as string | null) ?? null,
    lockedProposalId: (day.locked_proposal_id as string | null) ?? null,
    winner: (day.winner as MatchdayView["winner"]) ?? null,
    scoreA: day.score_a === null ? null : Number(day.score_a),
    scoreB: day.score_b === null ? null : Number(day.score_b),
    players,
    run,
    runsUsed: Number(day.runs),
    proposals,
    votes: votes.map((v) => ({ playerId: String(v.player_id), proposalId: String(v.proposal_id) })),
  };
}

/** Records a vote. Returns false when refused (locked, not in the squad, stale proposal). */
export async function castVote(matchdayId: string, playerId: string, proposalId: string) {
  const rows = await sql`
    insert into votes (matchday_id, player_id, proposal_id)
    select ${matchdayId}, ${playerId}, p.id
    from proposals p
    join matchdays m on m.id = p.matchday_id and m.locked_at is null
    where p.id = ${proposalId} and p.matchday_id = ${matchdayId}
      and exists (select 1 from matchday_players mp
                  where mp.matchday_id = ${matchdayId} and mp.player_id = ${playerId})
      and p.run_id = (select id from balance_runs where matchday_id = ${matchdayId}
                      order by created_at desc limit 1)
    on conflict (matchday_id, player_id)
    do update set proposal_id = excluded.proposal_id, created_at = now()
    returning proposal_id`;
  return rows.length > 0;
}

/**
 * Locks the game on the proposal with the most votes; a tie goes to the one Jev ranked
 * higher (lower position). Returns the chosen proposal, or null if already locked.
 */
export async function lockMatchday(id: string): Promise<string | null> {
  const [row] = await sql`
    with latest as (
      select id from balance_runs where matchday_id = ${id} order by created_at desc limit 1
    ), chosen as (
      select p.id
      from proposals p left join votes v on v.proposal_id = p.id
      where p.run_id = (select id from latest)
      group by p.id, p.position
      order by count(v.proposal_id) desc, p.position asc
      limit 1
    )
    update matchdays set locked_at = now(), locked_proposal_id = (select id from chosen)
    where id = ${id} and locked_at is null and exists (select 1 from chosen)
    returning locked_proposal_id`;
  return row ? String(row.locked_proposal_id) : null;
}

export async function unlockMatchday(id: string) {
  await sql`
    update matchdays
    set locked_at = null, locked_proposal_id = null, winner = null, score_a = null, score_b = null
    where id = ${id}`;
}

export async function setResult(
  id: string,
  winner: "a" | "b" | "draw",
  scoreA: number | null,
  scoreB: number | null,
): Promise<boolean> {
  const rows = await sql`
    update matchdays set winner = ${winner}, score_a = ${scoreA}, score_b = ${scoreB}
    where id = ${id} and locked_at is not null
    returning id`;
  return rows.length > 0;
}

export async function listMatchdays(): Promise<MatchdaySummary[]> {
  const rows = await sql`
    select m.id, m.played_on::text, m.locked_at is not null as locked, m.winner, m.score_a, m.score_b,
           (select count(*) from votes v where v.matchday_id = m.id) as vote_count
    from matchdays m
    order by m.played_on desc
    limit 30`;
  return rows.map((r) => ({
    id: String(r.id),
    playedOn: String(r.played_on),
    locked: Boolean(r.locked),
    winner: (r.winner as MatchdaySummary["winner"]) ?? null,
    scoreA: r.score_a === null ? null : Number(r.score_a),
    scoreB: r.score_b === null ? null : Number(r.score_b),
    voteCount: Number(r.vote_count),
  }));
}
