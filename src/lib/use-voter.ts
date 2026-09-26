import { useCallback, useSyncExternalStore } from "react";

// Who is holding this phone: a player id, remembered per browser. There is no sign-in for
// players in v1 — picking your name is on trust, and the log records every vote.

const KEY = "s6-me";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useMe(): [string, (playerId: string) => void] {
  const me = useSyncExternalStore(subscribe, read, () => "");
  const setMe = useCallback((playerId: string) => {
    try {
      if (playerId) localStorage.setItem(KEY, playerId);
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode — the choice just won't be remembered */
    }
    listeners.forEach((l) => l());
  }, []);
  return [me, setMe];
}
