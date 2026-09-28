import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { pickListQuery } from "@/lib/queries";
import { useMe } from "@/lib/use-voter";

/**
 * "Who are you?" — the whole list, one tap, remembered on this phone. Signing up,
 * announcing and voting all act as this person. On trust: there is no player login.
 */
export function WhoAmI({ compact = false }: { compact?: boolean }) {
  const { t, name } = useI18n();
  const [me, setMe] = useMe();
  const { data: players = [] } = useQuery(pickListQuery);
  const [choosing, setChoosing] = useState(false);
  const [filter, setFilter] = useState("");

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
            onClick={() => {
              setMe(p.id);
              setChoosing(false);
              setFilter("");
            }}
          >
            {name(p.name)}
          </Button>
        ))}
      </div>
    </div>
  );
}
