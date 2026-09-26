import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { sessionQuery } from "@/lib/queries";

// Everything under /admin needs the admin session. This redirect is a courtesy for the
// person reading; the server functions behind these pages check the session themselves.
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session.isAdmin) throw redirect({ to: "/login" });
  },
  component: Outlet,
});
