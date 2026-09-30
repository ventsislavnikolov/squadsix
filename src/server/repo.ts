// Every query the app makes, in one place. Rows come back from Postgres as loose records
// (numerics as strings); this file is where they become typed values — and where ratings
// are dropped for anyone who is not the admin. Nothing above this layer decides that.

import { SQUAD_SIZE, type Player } from "@/domain/balance";
import { nameFromInput, shortNames, type PersonName, type ShortName } from "@/domain/names";
import { hasStarted, orderSignups, patchLockedTeams, splitSquad, teamsDue } from "@/domain/signup";
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

/* ----------------------------------------------------------------------- venues -- */

export type Venue = { id: string; name: string; mapUrl: string | null; hidden: boolean };

export async function listVenues(includeHidden: boolean): Promise<Venue[]> {
  const rows = await sql`
    select v.id, v.name, v.map_url, v.hidden
    from venues v
    where ${includeHidden} or not v.hidden
    order by (select max(m.created_at) from matchdays m where m.venue_id = v.id) desc nulls last,
             v.name`;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    mapUrl: (r.map_url as string | null) ?? null,
    hidden: Boolean(r.hidden),
  }));
}

/** A venue by name — the existing one (un-hidden) if the name is taken. */
export async function ensureVenue(name: string, mapUrl: string | null): Promise<string> {
  const [row] = await sql`
    insert into venues (name, map_url) values (${name}, ${mapUrl})
    on conflict (lower(name)) do update
      set hidden = false, map_url = coalesce(excluded.map_url, venues.map_url)
    returning id`;
  return String(row!.id);
}

export async function saveVenue(v: { id: string; name: string; mapUrl: string | null; hidden: boolean }) {
  await sql`
    update venues set name = ${v.name}, map_url = ${v.mapUrl}, hidden = ${v.hidden}
    where id = ${v.id}`;
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

export type Change = { field: "date" | "time" | "venue" | "note"; from: string; to: string };

export type SignupView = { playerId: string; addedBy: string | null; createdAt: string };

export type MatchdayView = {
  id: string;
  kind: "announced" | "quick";
  playedOn: string;
  startsAt: string | null;
  venue: { id: string; name: string; mapUrl: string | null } | null;
  note: string | null;
  createdBy: string | null;
  changes: Change[] | null;
  changedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  lockedAt: string | null;
  lockedProposalId: string | null;
  winner: "a" | "b" | "draw" | null;
  scoreA: number | null;
  scoreB: number | null;
  /** Everyone the page mentions: the list, reserves, and whoever added them. */
  players: RosterPlayer[];
  /** The whole list in playing order; the first twelve play. */
  signups: SignupView[];
  /** The twelve (or fewer) currently in. */
  squad: string[];
  run: RunView | null;
  /** Tries people used; the app's own re-dos don't count. */
  runsUsed: number;
  proposals: ProposalView[];
  votes: { playerId: string; proposalId: string }[];
};

export type MatchdaySummary = {
  id: string;
  kind: "announced" | "quick";
  playedOn: string;
  startsAt: string | null;
  venueName: string | null;
  locked: boolean;
  cancelled: boolean;
  winner: "a" | "b" | "draw" | null;
  scoreA: number | null;
  scoreB: number | null;
  voteCount: number;
  signupCount: number;
};

/**
 * The game people should be looking at: one not cancelled and still open (announced,
 * signing up, voting — whatever day), otherwise today's. While one is open, no new game.
 */
export async function openMatchdayId(): Promise<string | null> {
  const [row] = await sql`
    select id from matchdays
    where cancelled_at is null
      and (locked_at is null or played_on = (now() at time zone 'Europe/Sofia')::date)
    order by (locked_at is null) desc, created_at desc
    limit 1`;
  return row ? String(row.id) : null;
}

/** Announce a game. Refused (null) while another is open or that day already has one. */
export async function announce(a: {
  date: string;
  time: string;
  venueId: string;
  note: string | null;
  createdBy: string;
}): Promise<string | null> {
  const [row] = await sql`
    insert into matchdays (kind, played_on, starts_at, venue_id, note, created_by)
    select 'announced', ${a.date}::date,
           (${a.date}::date + ${a.time}::time) at time zone 'Europe/Sofia',
           ${a.venueId}, ${a.note}, ${a.createdBy}
    where not exists (select 1 from matchdays where locked_at is null and cancelled_at is null)
    on conflict (played_on) where cancelled_at is null do nothing
    returning id`;
  return row ? String(row.id) : null;
}

/** Twelve ticked on the spot. Time and place are optional; the list is the tick order. */
export async function createQuick(q: {
  playerIds: string[];
  time: string | null;
  venueId: string | null;
  createdBy: string | null;
}): Promise<string | null> {
  const [row] = await sql`
    insert into matchdays (kind, played_on, starts_at, venue_id, created_by)
    select 'quick', (now() at time zone 'Europe/Sofia')::date,
           case when ${q.time}::time is null then now()
                else ((now() at time zone 'Europe/Sofia')::date + ${q.time}::time) at time zone 'Europe/Sofia'
           end,
           ${q.venueId}, ${q.createdBy}
    where not exists (select 1 from matchdays where locked_at is null and cancelled_at is null)
    on conflict (played_on) where cancelled_at is null do nothing
    returning id`;
  if (!row) return null;
  const id = String(row.id);
  // Stagger the times so the list keeps the order people were ticked in.
  await sql`
    insert into signups (matchday_id, player_id, created_at)
    select ${id}::uuid, p.id, now() + (p.ord * interval '1 millisecond')
    from unnest(${q.playerIds}::uuid[]) with ordinality as p(id, ord)`;
  await setSquad(id, q.playerIds);
  return id;
}

/** Facts needed to decide whether someone may do something to a game. */
export async function matchInfo(id: string) {
  const [m] = await sql`
    select kind, starts_at::text, created_by, locked_at is not null as locked,
           cancelled_at is not null as cancelled, played_on::text,
           (select count(*) from votes v where v.matchday_id = m.id) as votes,
           (select count(*) from balance_runs r where r.matchday_id = m.id and r.trigger = 'manual') as runs,
           (select count(*) from matchday_players mp where mp.matchday_id = m.id) as squad,
           exists (select 1 from proposals p where p.matchday_id = m.id) as has_teams
    from matchdays m where id = ${id}`;
  if (!m) return null;
  return {
    kind: m.kind as "announced" | "quick",
    startsAt: (m.starts_at as string | null) ?? null,
    createdBy: (m.created_by as string | null) ?? null,
    locked: Boolean(m.locked),
    cancelled: Boolean(m.cancelled),
    votes: Number(m.votes),
    runs: Number(m.runs),
    squad: Number(m.squad),
    hasTeams: Boolean(m.has_teams),
  };
}

/** Edits date, time, place or note, and remembers what changed for the announcement. */
export async function editMatch(
  id: string,
  e: { date: string; time: string; venueId: string; note: string | null },
): Promise<Change[]> {
  const [cur] = await sql`
    select m.played_on::text as date,
           to_char(m.starts_at at time zone 'Europe/Sofia', 'HH24:MI') as time,
           m.venue_id, v.name as venue, coalesce(m.note, '') as note,
           (select name from venues where id = ${e.venueId}) as new_venue
    from matchdays m left join venues v on v.id = m.venue_id
    where m.id = ${id}`;
  if (!cur) return [];
  const changes: Change[] = [];
  if (cur.date !== e.date) changes.push({ field: "date", from: String(cur.date), to: e.date });
  if (cur.time !== e.time) changes.push({ field: "time", from: String(cur.time), to: e.time });
  if (cur.venue_id !== e.venueId)
    changes.push({ field: "venue", from: String(cur.venue ?? ""), to: String(cur.new_venue ?? "") });
  if (cur.note !== (e.note ?? "")) changes.push({ field: "note", from: String(cur.note), to: e.note ?? "" });
  if (!changes.length) return [];
  await sql`
    update matchdays
    set played_on = ${e.date}::date,
        starts_at = (${e.date}::date + ${e.time}::time) at time zone 'Europe/Sofia',
        venue_id = ${e.venueId}, note = ${e.note},
        changes = ${JSON.stringify(changes)}::jsonb, changed_at = now(),
        -- a new time means a new "two hours before"
        auto_teams_at = case when ${changes.some((c) => c.field !== "note")}::boolean then null else auto_teams_at end
    where id = ${id}`;
  return changes;
}

export async function cancelMatch(id: string, reason: string | null) {
  await sql`
    update matchdays set cancelled_at = now(), cancel_reason = ${reason}
    where id = ${id} and cancelled_at is null`;
}

/** Puts someone on the list. Returns false if they were already on it. */
export async function signUp(matchdayId: string, playerId: string, addedBy: string | null) {
  const rows = await sql`
    insert into signups (matchday_id, player_id, added_by)
    values (${matchdayId}, ${playerId}, ${addedBy === playerId ? null : addedBy})
    on conflict do nothing
    returning player_id`;
  return rows.length > 0;
}

export async function signupOf(matchdayId: string, playerId: string) {
  const [row] = await sql`
    select added_by from signups where matchday_id = ${matchdayId} and player_id = ${playerId}`;
  return row ? { addedBy: (row.added_by as string | null) ?? null } : null;
}

export async function withdraw(matchdayId: string, playerId: string) {
  await sql`delete from signups where matchday_id = ${matchdayId} and player_id = ${playerId}`;
  await sql`delete from votes where matchday_id = ${matchdayId} and player_id = ${playerId}`;
}

async function setSquad(matchdayId: string, ids: string[]) {
  await sql`
    delete from matchday_players
    where matchday_id = ${matchdayId} and not (player_id = any(${ids}::uuid[]))`;
  await sql`
    insert into matchday_players (matchday_id, player_id)
    select ${matchdayId}::uuid, unnest(${ids}::uuid[])
    on conflict do nothing`;
}

/**
 * After the list changes: work out the twelve again and bring everything else in line.
 *   before teams   the twelve just follow the list
 *   teams, open    the twelve changed → votes are void; a full twelve needs new teams
 *                  ("balance"), a short one drops the proposals ("cleared")
 *   locked         the teams are public: whoever came in takes the leaver's place
 */
export async function reconcile(
  matchdayId: string,
): Promise<"none" | "balance" | "cleared" | "patched"> {
  const [m] = await sql`
    select kind, starts_at::text, locked_at is not null as locked, locked_proposal_id,
           cancelled_at is not null as cancelled
    from matchdays where id = ${matchdayId}`;
  if (!m || m.cancelled) return "none";

  const rows = await sql`
    select s.player_id, s.created_at::text, p.is_guest
    from signups s join players p on p.id = s.player_id
    where s.matchday_id = ${matchdayId}`;
  const ordered = orderSignups(
    rows.map((r) => ({
      playerId: String(r.player_id),
      isGuest: Boolean(r.is_guest),
      createdAt: String(r.created_at),
    })),
    m.kind === "announced" ? ((m.starts_at as string | null) ?? null) : null,
  );
  const squad = splitSquad(ordered).squad.map((s) => s.playerId);

  if (m.locked) {
    const [p] = await sql`
      select team_a::text[] as team_a, team_b::text[] as team_b
      from proposals where id = ${m.locked_proposal_id}`;
    if (!p) return "none";
    const patched = patchLockedTeams(
      { teamA: p.team_a as string[], teamB: p.team_b as string[] },
      squad,
    );
    if (!patched.changed) return "none";
    await sql`
      update proposals set team_a = ${patched.teamA}::uuid[], team_b = ${patched.teamB}::uuid[]
      where id = ${m.locked_proposal_id}`;
    await setSquad(matchdayId, [...patched.teamA, ...patched.teamB]);
    return "patched";
  }

  const current = (
    await sql`select player_id from matchday_players where matchday_id = ${matchdayId}`
  ).map((r) => String(r.player_id));
  const same = current.length === squad.length && squad.every((id) => current.includes(id));
  if (same) return "none";

  await setSquad(matchdayId, squad);
  const [t] = await sql`select exists (select 1 from proposals where matchday_id = ${matchdayId}) as has`;
  if (!t?.has) return "none";
  await sql`delete from votes where matchday_id = ${matchdayId}`;
  if (squad.length === SQUAD_SIZE) return "balance";
  await sql`delete from proposals where matchday_id = ${matchdayId}`;
  await sql`update matchdays set auto_teams_at = null where id = ${matchdayId}`;
  return "cleared";
}

/**
 * What the clock asks for, for an announced game: teams two hours before kick-off if
 * nobody made them, and the vote closed at kick-off. There is no scheduler — this runs
 * whenever someone opens the app, which is exactly when the answer matters.
 */
export async function dueNow(matchdayId: string): Promise<"teams" | "lock" | null> {
  const info = await matchInfo(matchdayId);
  if (!info || info.kind !== "announced" || info.cancelled || info.locked || !info.startsAt) {
    return null;
  }
  if (info.hasTeams && hasStarted(info.startsAt)) return "lock";
  if (!info.hasTeams && info.squad === SQUAD_SIZE && teamsDue(info.startsAt)) {
    // Claim it, so two visitors at the same moment don't both make teams.
    const claimed = await sql`
      update matchdays set auto_teams_at = now()
      where id = ${matchdayId} and auto_teams_at is null
      returning id`;
    return claimed.length ? "teams" : null;
  }
  return null;
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

export async function saveRun(
  matchdayId: string,
  run: Omit<RunView, "trace"> & { trace: HarnessStep[]; trigger: "manual" | "auto" },
  proposals: { teamA: string[]; teamB: string[]; totalA: number; totalB: number; verdict: Verdict | null }[],
): Promise<void> {
  const [row] = await sql`
    insert into balance_runs (matchday_id, model, source, trace, error, duration_ms, trigger)
    values (${matchdayId}, ${run.model}, ${run.source}, ${JSON.stringify(run.trace)}::jsonb,
            ${run.error}, ${run.durationMs}, ${run.trigger})
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
    select m.id, m.kind, m.played_on::text, m.starts_at::text, m.note, m.created_by,
           m.changes, m.changed_at::text, m.cancelled_at::text, m.cancel_reason,
           m.locked_at::text, m.locked_proposal_id, m.winner, m.score_a, m.score_b,
           v.id as venue_id, v.name as venue_name, v.map_url as venue_map,
           (select count(*) from balance_runs r where r.matchday_id = m.id and r.trigger = 'manual') as runs
    from matchdays m left join venues v on v.id = m.venue_id
    where m.id = ${id}`;
  if (!day) return null;

  const [rows, squadIds, signupRows, runs, votes] = await Promise.all([
    playerRows(),
    sql`select player_id from matchday_players where matchday_id = ${id}`,
    sql`select player_id, added_by, created_at::text from signups where matchday_id = ${id}`,
    sql`
      select id, model, source, trace, error, duration_ms
      from balance_runs where matchday_id = ${id}
      order by created_at desc limit 1`,
    sql`select player_id, proposal_id from votes where matchday_id = ${id} order by created_at`,
  ]);

  const guest = new Map(rows.map((r) => [r.id, r.isGuest]));
  const startsAt = (day.starts_at as string | null) ?? null;
  const signups = orderSignups(
    signupRows.map((r) => ({
      playerId: String(r.player_id),
      addedBy: (r.added_by as string | null) ?? null,
      createdAt: String(r.created_at),
      isGuest: guest.get(String(r.player_id)) ?? false,
    })),
    day.kind === "announced" ? startsAt : null,
  ).map(({ playerId, addedBy, createdAt }) => ({ playerId, addedBy, createdAt }));

  const squad = squadIds.map((r) => String(r.player_id));
  const mentioned = new Set([
    ...(day.created_by ? [String(day.created_by)] : []),
    ...squad,
    ...signups.flatMap((s) => (s.addedBy ? [s.playerId, s.addedBy] : [s.playerId])),
  ]);
  const players = toRoster(rows, admin).filter((p) => mentioned.has(p.id));

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
    kind: day.kind as MatchdayView["kind"],
    playedOn: String(day.played_on),
    startsAt,
    venue: day.venue_id
      ? {
          id: String(day.venue_id),
          name: String(day.venue_name),
          mapUrl: (day.venue_map as string | null) ?? null,
        }
      : null,
    note: (day.note as string | null) ?? null,
    createdBy: (day.created_by as string | null) ?? null,
    changes: (day.changes as Change[] | null) ?? null,
    changedAt: (day.changed_at as string | null) ?? null,
    cancelledAt: (day.cancelled_at as string | null) ?? null,
    cancelReason: (day.cancel_reason as string | null) ?? null,
    lockedAt: (day.locked_at as string | null) ?? null,
    lockedProposalId: (day.locked_proposal_id as string | null) ?? null,
    winner: (day.winner as MatchdayView["winner"]) ?? null,
    scoreA: day.score_a === null ? null : Number(day.score_a),
    scoreB: day.score_b === null ? null : Number(day.score_b),
    players,
    signups,
    squad,
    run,
    runsUsed: Number(day.runs),
    proposals,
    votes: votes.map((v) => ({ playerId: String(v.player_id), proposalId: String(v.proposal_id) })),
  };
}

/** Records a vote. Returns false when refused (locked, started, not in the squad, stale). */
export async function castVote(matchdayId: string, playerId: string, proposalId: string) {
  const rows = await sql`
    insert into votes (matchday_id, player_id, proposal_id)
    select ${matchdayId}, ${playerId}, p.id
    from proposals p
    join matchdays m on m.id = p.matchday_id
      and m.locked_at is null and m.cancelled_at is null
      and (m.kind = 'quick' or m.starts_at is null or m.starts_at > now())
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
 * higher (lower position). Returns the chosen proposal, or null if it can't be locked.
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
    where id = ${id} and locked_at is null and cancelled_at is null
      and exists (select 1 from chosen)
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
    where id = ${id} and locked_at is not null and cancelled_at is null
      and (starts_at is null or starts_at <= now() or kind = 'quick')
    returning id`;
  return rows.length > 0;
}

export async function listMatchdays(): Promise<MatchdaySummary[]> {
  const rows = await sql`
    select m.id, m.kind, m.played_on::text, m.starts_at::text, v.name as venue_name,
           m.locked_at is not null as locked, m.cancelled_at is not null as cancelled,
           m.winner, m.score_a, m.score_b,
           (select count(*) from votes x where x.matchday_id = m.id) as vote_count,
           (select count(*) from signups s where s.matchday_id = m.id) as signup_count
    from matchdays m left join venues v on v.id = m.venue_id
    order by m.played_on desc, m.created_at desc
    limit 30`;
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind as MatchdaySummary["kind"],
    playedOn: String(r.played_on),
    startsAt: (r.starts_at as string | null) ?? null,
    venueName: (r.venue_name as string | null) ?? null,
    locked: Boolean(r.locked),
    cancelled: Boolean(r.cancelled),
    winner: (r.winner as MatchdaySummary["winner"]) ?? null,
    scoreA: r.score_a === null ? null : Number(r.score_a),
    scoreB: r.score_b === null ? null : Number(r.score_b),
    voteCount: Number(r.vote_count),
    signupCount: Number(r.signup_count),
  }));
}

/** Is this date/time (Sofia) in the future, and how many days from today is it? */
export async function checkWhen(date: string, time: string) {
  const [row] = await sql`
    select ((${date}::date + ${time}::time) at time zone 'Europe/Sofia') > now() as future,
           ${date}::date - (now() at time zone 'Europe/Sofia')::date as days`;
  return { future: Boolean(row!.future), days: Number(row!.days) };
}

// ---------------------------------------------------------------------------------------
// The balls: someone takes them home after each game.

export type BallHandover = { playerId: string; since: string; setBy: string | null };

/** Newest first: the first entry is where the balls are now. */
export async function ballTrail(limit = 12): Promise<BallHandover[]> {
  const rows = await sql`
    select player_id, since::text, set_by from ball_holders order by since desc, id desc limit ${limit}`;
  return rows.map((r) => ({
    playerId: String(r.player_id),
    since: String(r.since),
    setBy: (r.set_by as string | null) ?? null,
  }));
}

/** Hand the balls to someone. False when they already have them. */
export async function passBalls(playerId: string, setBy: string | null): Promise<boolean> {
  const rows = await sql`
    insert into ball_holders (player_id, set_by)
    select ${playerId}, ${setBy}
    where ${playerId}::uuid is distinct from
          (select player_id from ball_holders order by since desc, id desc limit 1)
    returning id`;
  return rows.length > 0;
}
