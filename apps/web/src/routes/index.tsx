import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactElement } from "react";
import {
  invalidateWorkspacesListWorkspaces,
  useAuthMe,
  useWorkspacesAcceptWorkspaceInvitation,
  useWorkspacesCreateWorkspace,
  useWorkspacesListWorkspaceInvitations,
  useWorkspacesListWorkspaces,
} from "../api/generated/cove-app.ts";
import { PageMessage } from "../components/page-message.tsx";
import { SignIn } from "../components/sign-in.tsx";
import { requiredFormValue } from "../form-data.ts";

interface HomeSearch {
  readonly left?: string;
}

interface WorkspaceInvitationSummary {
  readonly id: string;
  readonly requiresIdentityProfile: boolean;
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    left: typeof search.left === "string" ? search.left : undefined,
  }),
  component: Home,
});

function Home(): ReactElement {
  const { left } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const account = useAuthMe({ query: { retry: false } });
  const workspaces = useWorkspacesListWorkspaces({
    query: { enabled: account.isSuccess, retry: false },
  });
  const invitations = useWorkspacesListWorkspaceInvitations({
    query: { enabled: account.isSuccess, retry: false },
  });
  const createWorkspace = useWorkspacesCreateWorkspace();
  const acceptInvitation = useWorkspacesAcceptWorkspaceInvitation();

  if (account.isPending) return <PageMessage message="Opening Cove…" />;
  if (account.isError && account.error.status === 401) return <SignIn />;
  if (account.isError) return <PageMessage message="Cove could not load your account." />;
  if (workspaces.isPending) return <PageMessage message="Opening Cove…" />;
  if (workspaces.isError) {
    return <PageMessage message="Cove could not load your workspaces." />;
  }
  if (invitations.isPending) return <PageMessage message="Opening Cove…" />;
  if (invitations.isError) {
    return <PageMessage message="Cove could not load your Workspace invitations." />;
  }

  const identityDefaults = workspaces.data.workspaces[0]?.identity ?? {
    name: account.data.displayName,
    avatarUrl: "/avatars/default.svg",
  };

  const create = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = requiredFormValue(form, "workspaceName");
    const identityName = requiredFormValue(form, "identityName");
    const avatarUrl = requiredFormValue(form, "avatarUrl");
    createWorkspace.mutate(
      {
        data: {
          name,
          identity: { name: identityName, avatarUrl },
        },
      },
      {
        onSuccess: async (created) => {
          await invalidateWorkspacesListWorkspaces(queryClient);
          await navigate({
            to: "/workspaces/$workspaceId",
            params: { workspaceId: created.workspaceId },
          });
        },
      },
    );
  };

  const accept = (
    event: FormEvent<HTMLFormElement>,
    invitation: WorkspaceInvitationSummary,
  ): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = invitation.requiresIdentityProfile
      ? {
          initialIdentityProfile: {
            name: requiredFormValue(form, "identityName"),
            avatarUrl: requiredFormValue(form, "avatarUrl"),
          },
        }
      : {};
    acceptInvitation.mutate(
      { invitationId: invitation.id, data },
      {
        onSuccess: async (accepted) => {
          await Promise.all([invitations.refetch(), workspaces.refetch()]);
          await navigate({
            to: "/workspaces/$workspaceId",
            params: { workspaceId: accepted.workspaceId },
          });
        },
      },
    );
  };

  return (
    <main className="min-h-svh bg-muted/30 px-5 py-12 sm:px-8">
      <section className="mx-auto w-full max-w-4xl">
        <p className="font-heading text-sm font-semibold tracking-[0.22em] text-primary uppercase">
          Cove
        </p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Choose a workspace
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Your account gets you in. Each workspace keeps its own name, avatar, and role.
        </p>

        {left === undefined ? null : (
          <p
            className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"
            role="status"
          >
            Your access to {left} has ended.
          </p>
        )}

        {invitations.data.invitations.length === 0 ? null : (
          <section className="mt-8 rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
            <p className="font-heading text-sm font-semibold tracking-[0.16em] text-primary uppercase">
              Invitations
            </p>
            <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
              Join a Workspace as yourself
            </h2>
            <div className="mt-6 grid gap-4">
              {invitations.data.invitations.map((invitation) => (
                <form
                  className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2"
                  key={invitation.id}
                  onSubmit={(event) => accept(event, invitation)}
                >
                  <div className="sm:col-span-2">
                    <h3 className="font-heading text-lg font-semibold">
                      {invitation.workspace.name}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      You were invited as a Member.
                    </p>
                  </div>
                  {invitation.requiresIdentityProfile ? (
                    <>
                      <label className="text-sm font-medium">
                        Your name for {invitation.workspace.name}
                        <input
                          name="identityName"
                          required
                          defaultValue={identityDefaults.name}
                          className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                      </label>
                      <label className="text-sm font-medium">
                        Avatar URL for {invitation.workspace.name}
                        <input
                          name="avatarUrl"
                          required
                          defaultValue={identityDefaults.avatarUrl}
                          className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                      </label>
                    </>
                  ) : null}
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={acceptInvitation.isPending}>
                      {acceptInvitation.isPending
                        ? "Joining…"
                        : `Accept invitation to ${invitation.workspace.name}`}
                    </Button>
                    {acceptInvitation.isError ? (
                      <p className="mt-3 text-sm text-destructive" role="alert">
                        Cove could not accept this invitation. Refresh and try again.
                      </p>
                    ) : null}
                  </div>
                </form>
              ))}
            </div>
          </section>
        )}

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {workspaces.data.workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Link
                to="/workspaces/$workspaceId"
                params={{ workspaceId: workspace.id }}
                className="flex items-center justify-between rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span>
                  <span className="block font-heading text-lg font-semibold">{workspace.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground capitalize">
                    {workspace.membership.role}
                  </span>
                </span>
                <span className="text-sm font-medium text-primary">Enter {workspace.name}</span>
              </Link>
            </li>
          ))}
        </ul>

        {workspaces.data.workspaces.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            You do not currently have access to a workspace.
          </p>
        ) : null}

        <section className="mt-10 rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
          <p className="font-heading text-sm font-semibold tracking-[0.16em] text-primary uppercase">
            New workspace
          </p>
          <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
            Create a separate place to work
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Your current workspace identity is offered as a starting point. These values become an
            independent profile in the new workspace.
          </p>

          <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={create}>
            <label className="text-sm font-medium sm:col-span-2" htmlFor="workspaceName">
              Workspace name
              <input
                id="workspaceName"
                name="workspaceName"
                required
                className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Product Studio"
              />
            </label>
            <label className="text-sm font-medium" htmlFor="identityName">
              Your name in this workspace
              <input
                id="identityName"
                name="identityName"
                required
                defaultValue={identityDefaults.name}
                className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <label className="text-sm font-medium" htmlFor="avatarUrl">
              Avatar URL
              <input
                id="avatarUrl"
                name="avatarUrl"
                required
                defaultValue={identityDefaults.avatarUrl}
                className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={createWorkspace.isPending}>
                {createWorkspace.isPending ? "Creating…" : "Create workspace"}
              </Button>
              {createWorkspace.isError ? (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  Cove could not create this workspace. Check the profile values and try again.
                </p>
              ) : null}
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
