import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { rememberMe, type Session } from "@/server/functions";
import { sessionQuery } from "./queries";

// Who is holding this phone: a player id, remembered per browser. There is no sign-in for
// players in v1 — picking your name is on trust, and the log records every vote.
//
// It's kept twice: in localStorage, and in a cookie the server sets (`session.me`).
// Messenger's in-app browser forgets localStorage between opens but keeps the cookie, so
// the cookie is the fallback, and whichever copy survived restores the other.

const KEY = "s6-me";
const listeners = new Set<() => void>();
let synced = false;

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function write(playerId: string) {
  try {
    if (playerId) {
      localStorage.setItem(KEY, playerId);
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    /* private mode — the cookie still remembers */
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// The cookie copy is a convenience: the browser keeps the choice either way, so a failed
// save on the server changes nothing the player sees.
const ignoreRememberFailure = () => undefined;

export function useMe(): [string, (playerId: string) => void] {
  const qc = useQueryClient();
  const { data: session } = useSuspenseQuery(sessionQuery);
  const cookie = session.me;
  const me = useSyncExternalStore(
    subscribe,
    () => read() || cookie,
    () => cookie
  );

  // Once per page load, copy whichever store still has the choice into the other one.
  useEffect(() => {
    if (synced) {
      return;
    }
    synced = true;
    const local = read();
    if (!local && cookie) {
      write(cookie);
    } else if (local && local !== cookie) {
      rememberMe({ data: { playerId: local } }).catch(ignoreRememberFailure);
    }
  }, [cookie]);

  const setMe = useCallback(
    (playerId: string) => {
      write(playerId);
      qc.setQueryData<Session>(sessionQuery.queryKey, (s) =>
        s ? { ...s, me: playerId } : s
      );
      rememberMe({ data: { playerId } }).catch(ignoreRememberFailure);
      for (const listener of listeners) {
        listener();
      }
    },
    [qc]
  );
  return [me, setMe];
}
