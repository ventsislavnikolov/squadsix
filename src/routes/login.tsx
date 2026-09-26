import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHead, PANE } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { login } from "@/server/functions";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { t, error } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = useMutation({
    mutationFn: () => login({ data: { email, password } }),
    onSuccess: async () => {
      // Ratings are now visible — everything cached without them is stale.
      await qc.invalidateQueries();
      await navigate({ to: "/admin" });
    },
  });

  return (
    <div className={cn(PANE, "max-w-md space-y-8 py-10")}>
      <PageHead title={t.login.title} lead={t.login.lead} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <label className="block">
          <span className="eyebrow">{t.login.email}</span>
          <Input
            className="mt-2"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="eyebrow">{t.login.password}</span>
          <Input
            className="mt-2"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {submit.isError && <p className="text-[13px] text-destructive">{error(submit.error)}</p>}
        <Button type="submit" disabled={submit.isPending || !email || !password}>
          {t.login.submit}
        </Button>
      </form>
    </div>
  );
}
