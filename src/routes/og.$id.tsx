import { Resvg } from "@resvg/resvg-js";
import { createFileRoute } from "@tanstack/react-router";
import satori from "satori";
// Satori reads woff, not woff2, and wants static weights. Inlined into the server bundle
// so the function never has to find font files on disk.
import cyr500 from "@fontsource/onest/files/onest-cyrillic-500-normal.woff?inline";
import cyr700 from "@fontsource/onest/files/onest-cyrillic-700-normal.woff?inline";
import lat500 from "@fontsource/onest/files/onest-latin-500-normal.woff?inline";
import lat700 from "@fontsource/onest/files/onest-latin-700-normal.woff?inline";
import { matchPreview, type Preview } from "@/lib/preview";
import { getMatchday } from "@/server/repo";

const font = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
const FONTS = [
  { name: "Onest", data: font(cyr500), weight: 500 as const },
  { name: "Onest Latin", data: font(lat500), weight: 500 as const },
  { name: "Onest", data: font(cyr700), weight: 700 as const },
  { name: "Onest Latin", data: font(lat700), weight: 700 as const },
];

const UUID = /^[0-9a-f-]{36}$/i;

// The picture Messenger shows under a link to a game: what's happening, when, where,
// and how full the list is — readable at thumbnail size.
export const Route = createFileRoute("/og/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const day = UUID.test(params.id) ? await getMatchday(params.id, false) : null;
        if (!day) return new Response("Not found", { status: 404 });
        const svg = await satori(<Card p={matchPreview(day)} filled={Math.min(day.signups.length, 12)} />, {
          width: 1200,
          height: 630,
          fonts: FONTS,
        });
        const png = new Resvg(svg).render().asPng();
        return new Response(new Uint8Array(png), {
          headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, s-maxage=300" },
        });
      },
    },
  },
});

const TONE: Record<Preview["tone"], { bg: string; badge: string }> = {
  open: { bg: "#00894f", badge: "#ffffff" },
  full: { bg: "#0b6b43", badge: "#ffffff" },
  locked: { bg: "#1f2937", badge: "#6ee7b7" },
  cancelled: { bg: "#7f1d1d", badge: "#fecaca" },
};

function Card({ p, filled }: { p: Preview; filled: number }) {
  const tone = TONE[p.tone];
  const showDots = p.tone === "open" || (p.tone === "full" && p.badge === "Пълен");
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: tone.bg,
        color: "#ffffff",
        fontFamily: "Onest Latin, Onest",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 30, fontWeight: 500, opacity: 0.85 }}>
        {/* The app's mark: two halves of a pitch. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 60,
            height: 40,
            border: "3px solid rgba(255,255,255,0.7)",
            borderRadius: 6,
          }}
        >
          <div style={{ position: "absolute", left: 27, top: 0, width: 3, height: 34, background: "rgba(255,255,255,0.7)" }} />
          <div style={{ width: 14, height: 14, borderRadius: 7, border: "3px solid rgba(255,255,255,0.7)" }} />
        </div>
        Squad Six · 6 × 6
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 44, fontWeight: 700, color: tone.badge, textTransform: "uppercase", letterSpacing: 2 }}>
          {p.badge}
        </div>
        <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{p.when}</div>
        {p.venue && <div style={{ fontSize: 40, fontWeight: 500, opacity: 0.9 }}>{p.venue}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {showDots && (
          <div style={{ display: "flex", gap: 10 }}>
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  background: i < filled ? "#ffffff" : "rgba(255,255,255,0.22)",
                }}
              />
            ))}
          </div>
        )}
        <div style={{ fontSize: 40, fontWeight: 700 }}>{p.count}</div>
      </div>
    </div>
  );
}
