import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import {
  invalidateAuthMe,
  invalidateWorkspacesListWorkspaces,
  useAuthVerifyMagicLink,
} from "../api/generated/cove-app.ts";

interface VerifySearch {
  readonly token?: string;
}

export const Route = createFileRoute("/auth/verify")({
  validateSearch: (search: Record<string, unknown>): VerifySearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: VerifyMagicLink,
});

function VerifyMagicLink() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const attemptedToken = useRef<string | undefined>(undefined);
  const verify = useAuthVerifyMagicLink({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          invalidateAuthMe(queryClient),
          invalidateWorkspacesListWorkspaces(queryClient),
        ]);
        await navigate({ to: "/", search: {}, replace: true });
      },
    },
  });
  const verifyMagicLink = verify.mutate;

  useEffect(() => {
    if (token === undefined || attemptedToken.current === token) return;
    attemptedToken.current = token;
    verifyMagicLink({ data: { token } });
  }, [token, verifyMagicLink]);

  const failed = token === undefined || verify.isError;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-5">
      <section className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-sm">
        <h1 className="font-heading text-2xl font-semibold">
          {failed ? "That sign-in link is not available." : "Signing you in…"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {failed
            ? "Request a new one-time link from the Cove sign-in page."
            : "Your workspace list will be ready in a moment."}
        </p>
      </section>
    </main>
  );
}
