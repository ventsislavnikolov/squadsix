// The activity log: one row per thing anyone does, refusals included, so spam or a
// mistake can be traced to when, what and from where. Only the admin reads it.

import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { sql } from "./db";
import type { Json } from "./jev-harness";

export type Action =
  | "matchday.create"
  | "matchday.announce"
  | "matchday.edit"
  | "matchday.cancel"
  | "signup.add"
  | "signup.remove"
  | "signup.reconcile"
  | "admin.venue.save"
  | "matchday.lock"
  | "matchday.unlock"
  | "matchday.result"
  | "balance.run"
  | "guest.add"
  | "vote.cast"
  | "admin.login"
  | "admin.logout"
  | "admin.player.save"
  | "balls.pass";

export type LogEntry = {
  id: string;
  at: string;
  action: Action;
  ok: boolean;
  actor: string | null;
  matchdayId: string | null;
  detail: { [key: string]: Json } | null;
  ip: string | null;
  userAgent: string | null;
};

const RETENTION_DAYS = 90;

export async function logAction(entry: {
  action: Action;
  ok?: boolean;
  actor?: string | null;
  matchdayId?: string | null;
  detail?: Record<string, unknown>;
}) {
  // A failed log write must never break the action it describes.
  try {
    await sql`
      insert into activity_log (action, ok, actor, matchday_id, detail, ip, user_agent)
      values (${entry.action}, ${entry.ok ?? true}, ${entry.actor ?? null},
              ${entry.matchdayId ?? null}, ${entry.detail ? JSON.stringify(entry.detail) : null}::jsonb,
              ${getRequestIP({ xForwardedFor: true }) ?? null},
              ${getRequestHeader("user-agent")?.slice(0, 300) ?? null})`;
  } catch (err) {
    console.error("activity_log write failed", err);
  }
}

export async function readLog(limit = 300): Promise<LogEntry[]> {
  await sql`delete from activity_log where at < now() - make_interval(days => ${RETENTION_DAYS})`;
  const rows = await sql`
    select id::text, at::text, action, ok, actor, matchday_id::text, detail, ip, user_agent
    from activity_log order by at desc limit ${limit}`;
  return rows.map((r) => ({
    id: String(r.id),
    at: String(r.at),
    action: r.action as Action,
    ok: Boolean(r.ok),
    actor: (r.actor as string | null) ?? null,
    matchdayId: (r.matchday_id as string | null) ?? null,
    detail: (r.detail as { [key: string]: Json } | null) ?? null,
    ip: (r.ip as string | null) ?? null,
    userAgent: (r.user_agent as string | null) ?? null,
  }));
}
