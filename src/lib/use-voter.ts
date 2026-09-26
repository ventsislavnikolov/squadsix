import { useCallback, useSyncExternalStore } from "react";

// Who is voting on this device. There is no sign-in in v1, so the name is remembered per
// browser; voting again from the same name moves the vote rather than adding one.

const KEY = "squad-six.voter";
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

export function useVoter(): [string, (name: string) => void] {
  const voter = useSyncExternalStore(subscribe, read, () => "");
  const setVoter = useCallback((name: string) => {
    try {
      localStorage.setItem(KEY, name.trim());
    } catch {
      /* private mode — the name just won't be remembered */
    }
    listeners.forEach((l) => l());
  }, []);
  return [voter, setVoter];
}
