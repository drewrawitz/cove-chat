import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactElement } from "react";
import {
  invalidateAuthMe,
  invalidateWorkspacesListWorkspaceInvitations,
  invalidateWorkspacesListWorkspaces,
  useWorkspacesRedeemWorkspaceInvitation,
} from "../api/generated/cove-app.ts";
import { requiredFormValue } from "../form-data.ts";

interface RedeemWorkspaceInvitationSearch {
  readonly token?: string;
}

export const Route = createFileRoute("/workspace-invitations/redeem")({
  validateSearch: (search: Record<string, unknown>): RedeemWorkspaceInvitationSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: RedeemWorkspaceInvitation,
});

function RedeemWorkspaceInvitation(): ReactElement {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const redeem = useWorkspacesRedeemWorkspaceInvitation();

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (token === undefined) return;
    const form = new FormData(event.currentTarget);
    const name = requiredFormValue(form, "name");
    redeem.mutate(
      {
        data: {
          token,
          displayName: name,
          initialIdentityProfile: { name, avatarUrl: "/avatars/default.svg" },
        },
      },
      {
        onSuccess: async (accepted) => {
          await Promise.all([
            invalidateAuthMe(queryClient),
            invalidateWorkspacesListWorkspaces(queryClient),
            invalidateWorkspacesListWorkspaceInvitations(queryClient),
          ]);
          await navigate({
            to: "/workspaces/$workspaceId",
            params: { workspaceId: accepted.workspaceId },
            replace: true,
          });
        },
      },
    );
  };

  const unavailable = token === undefined || redeem.isError;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-5">
      <section className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-sm sm:p-10">
        <p className="font-heading text-sm font-semibold tracking-[0.22em] text-primary uppercase">
          Cove
        </p>
        <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight">
          Join your workspace
        </h1>
        <p className="mt-3 text-muted-foreground">
          Accepting this invitation signs you in and joins you to the Workspace.
        </p>

        {unavailable ? (
          <p className="mt-6 text-sm text-destructive" role="alert">
            This Workspace invitation is invalid, expired, or has already been accepted.
          </p>
        ) : (
          <form className="mt-8" onSubmit={submit}>
            <label className="text-sm font-medium" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              required
              className="mt-2 h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button className="mt-4 w-full" size="lg" type="submit" disabled={redeem.isPending}>
              {redeem.isPending ? "Joining…" : "Accept invitation"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
