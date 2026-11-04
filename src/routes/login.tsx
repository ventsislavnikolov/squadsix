import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { PANE, PageHead } from "@/components/page";
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
  const { mutate } = submit;
  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      mutate();
    },
    [mutate]
  );
  const onEmail = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
    []
  );
  const onPassword = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value),
    []
  );

  return (
    <div className={cn(PANE, "max-w-md space-y-8 py-10")}>
      <PageHead lead={t.login.lead} title={t.login.title} />
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="eyebrow">{t.login.email}</span>
          <Input
            autoComplete="username"
            className="mt-2"
            onChange={onEmail}
            type="email"
            value={email}
          />
        </label>
        <label className="block">
          <span className="eyebrow">{t.login.password}</span>
          <Input
            autoComplete="current-password"
            className="mt-2"
            onChange={onPassword}
            type="password"
            value={password}
          />
        </label>
        {submit.isError ? (
          <p className="text-[13px] text-destructive">{error(submit.error)}</p>
        ) : null}
        <Button
          disabled={submit.isPending || !email || !password}
          type="submit"
        >
          {t.login.submit}
        </Button>
      </form>
    </div>
  );
}
