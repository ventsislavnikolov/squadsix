// Where a pasted Google Maps link points. A full link carries its coordinates; a short
// one (maps.app.goo.gl) has to be followed to the full link it stands for. Server-only: the browser can't
// follow Google's redirects, and we only ever fetch Google's own hosts.

import { type Coords, parseCoords } from "@/lib/weather";

const GOOGLE = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.|maps\.)?google\.[a-z.]{2,6})$/;
const MAX_HOPS = 5;

const known = new Map<string, Coords | null>();

function isGoogleMaps(url: URL): boolean {
  if (url.protocol !== "https:" || !GOOGLE.test(url.hostname)) return false;
  // The old general-purpose shortener could point anywhere; only its maps links count.
  return url.hostname !== "goo.gl" || url.pathname.startsWith("/maps");
}

export async function resolveCoords(mapUrl: string | null): Promise<Coords | null> {
  if (!mapUrl) return null;
  const direct = parseCoords(mapUrl);
  if (direct) return direct;
  if (known.has(mapUrl)) return known.get(mapUrl)!;

  let found: Coords | null = null;
  try {
    let url = new URL(mapUrl);
    for (let hop = 0; hop < MAX_HOPS && isGoogleMaps(url); hop++) {
      const res = await fetch(url, {
        redirect: "manual",
        // Without these Google sends a European visitor to its consent page first.
        headers: { "user-agent": "Mozilla/5.0", cookie: "SOCS=CAI; CONSENT=YES+" },
        signal: AbortSignal.timeout(4000),
      });
      const next = res.headers.get("location");
      // Only a redirect can tell us more. The page a link ends on does hold coordinates,
      // but they are where Google points the camera for the visitor, not where the place is.
      if (res.status < 300 || res.status >= 400 || !next) break;
      url = new URL(next, url);
      found = parseCoords(url.href);
      if (found) break;
    }
  } catch {
    // An unreadable link just means the city-wide forecast.
  }
  known.set(mapUrl, found);
  return found;
}
