import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
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
  const startChoosing = useCallback(() => setChoosing(true), []);
  const stopChoosing = useCallback(() => setChoosing(false), []);
  const reject = useCallback(() => setCandidate(null), []);
  const confirm = useCallback(() => {
    if (candidate) {
      setMe(candidate);
    }
    setCandidate(null);
    setChoosing(false);
    setFilter("");
  }, [candidate, setMe]);
  const changeFilter = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value),
    []
  );

  if (!hydrated || isPending) {
    return null;
  }

  const self = players.find((p) => p.id === me);
  if (self && !choosing) {
    return (
      <p className="text-[13px] text-fg/55">
        {t.who.as(name(self.name))}{" "}
        <button
          className="underline underline-offset-4 hover:text-fg"
          onClick={startChoosing}
          type="button"
        >
          {t.who.change}
        </button>
      </p>
    );
  }

  const picked = candidate
    ? players.find((p) => p.id === candidate)
    : undefined;
  if (picked) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
        <p className="text-[14px] font-medium">
          {t.who.confirm(name(picked.name))}
        </p>
        <div className="flex gap-2">
          <Button onClick={confirm} size="sm">
            {t.who.yes}
          </Button>
          <Button onClick={reject} size="sm" variant="ghost">
            {t.who.no}
          </Button>
        </div>
      </div>
    );
  }

  const q = filter.trim().toLocaleLowerCase();
  const shown = players.filter(
    (p) =>
      !q ||
      p.name.bg.toLocaleLowerCase().includes(q) ||
      p.name.en.toLowerCase().includes(q)
  );

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
      <p className="text-[14px] font-medium">{t.who.title}</p>
      {compact ? null : (
        <p className="mt-1 text-[13px] text-fg/55">{t.who.note}</p>
      )}
      <Input
        className="mt-3 max-w-xs"
        onChange={changeFilter}
        placeholder={t.who.search}
        value={filter}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {shown.map((p) => (
          <PlayerChoice
            current={p.id === me}
            id={p.id}
            key={p.id}
            label={name(p.name)}
            onPick={setCandidate}
          />
        ))}
      </div>
      {self ? (
        <Button
          className="mt-3"
          onClick={stopChoosing}
          size="sm"
          variant="ghost"
        >
          {t.common.cancel}
        </Button>
      ) : null}
    </div>
  );
}

function PlayerChoice({
  id,
  label,
  current,
  onPick,
}: {
  id: string;
  label: string;
  current: boolean;
  onPick: (id: string) => void;
}) {
  const pick = useCallback(() => onPick(id), [id, onPick]);
  return (
    <Button onClick={pick} size="sm" variant={current ? "default" : "outline"}>
      {label}
    </Button>
  );
}
