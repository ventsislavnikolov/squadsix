import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { pickListQuery } from "@/lib/queries";
import { useMe } from "@/lib/use-voter";

/**
 * "Who are you?" — the whole list, remembered on this phone. Signing up, announcing and
 * voting all act as this person. On trust: there is no player login.
 *
 * Two guards against becoming someone else by accident:
 *   - nothing renders until the page is hydrated. The server can't read localStorage, so
 *     it would otherwise paint the chooser for a moment, and a tap landing in that moment
 *     (React replays it after hydration) picked whoever was first on the list.
 *   - picking a name asks "Is that you?" before it sticks.
 */
export function WhoAmI({ compact = false }: { compact?: boolean }) {
  const { t, name } = useI18n();
  const [me, setMe] = useMe();
  const { data: players = [], isPending } = useQuery(pickListQuery);
  const [hydrated, setHydrated] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => setHydrated(true), []);

  if (!hydrated || isPending) return null;

  const self = players.find((p) => p.id === me);
  if (self && !choosing) {
    return (
      <p className="text-[13px] text-fg/55">
        {t.who.as(name(self.name))}{" "}
        <button
          type="button"
          className="underline underline-offset-4 hover:text-fg"
          onClick={() => setChoosing(true)}
        >
          {t.who.change}
        </button>
      </p>
    );
  }

  const picked = candidate ? players.find((p) => p.id === candidate) : undefined;
  if (picked) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
        <p className="text-[14px] font-medium">{t.who.confirm(name(picked.name))}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              setMe(picked.id);
              setCandidate(null);
              setChoosing(false);
              setFilter("");
            }}
          >
            {t.who.yes}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCandidate(null)}>
            {t.who.no}
          </Button>
        </div>
      </div>
    );
  }

  const q = filter.trim().toLocaleLowerCase();
  const shown = players.filter(
    (p) => !q || p.name.bg.toLocaleLowerCase().includes(q) || p.name.en.toLowerCase().includes(q),
  );

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
      <p className="text-[14px] font-medium">{t.who.title}</p>
      {!compact && <p className="mt-1 text-[13px] text-fg/55">{t.who.note}</p>}
      <Input
        className="mt-3 max-w-xs"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t.who.search}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {shown.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={p.id === me ? "default" : "outline"}
            onClick={() => setCandidate(p.id)}
          >
            {name(p.name)}
          </Button>
        ))}
      </div>
      {self && (
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => setChoosing(false)}>
          {t.common.cancel}
        </Button>
      )}
    </div>
  );
}
