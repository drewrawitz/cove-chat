import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useRef } from "react";
import { CoveApiError } from "../api/cove-fetch.ts";
import {
  getWorkspacesGetWorkspaceQueryKey,
  invalidateWorkspacesListWorkspaces,
  useWorkspacesEndMembership,
  useWorkspacesGetWorkspace,
  useWorkspacesListWorkspaces,
  useWorkspacesUpdateWorkspaceIdentity,
} from "../api/generated/cove-app.ts";
import { requiredFormValue } from "../form-data.ts";
import {
  type PendingCommand,
  releaseCommandId,
  retainCommandId,
} from "../api/stable-command-id.ts";

export const Route = createFileRoute("/workspaces/$workspaceId")({ component: WorkspaceHome });

function WorkspaceHome() {
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspacesGetWorkspace(workspaceId, { query: { retry: false } });
  const workspaces = useWorkspacesListWorkspaces({ query: { retry: false } });
  const endMembership = useWorkspacesEndMembership();
  const updateIdentity = useWorkspacesUpdateWorkspaceIdentity();
  const identityCommand = useRef<PendingCommand>(undefined);
  const leaveCommand = useRef<PendingCommand>(undefined);

  if (workspace.isPending) {
    return <WorkspaceMessage message="Entering workspace…" />;
  }
  if (workspace.isError) {
    return (
      <WorkspaceMessage message="This workspace is not available to your account.">
        <Link className="mt-4 inline-block text-sm font-medium text-primary hover:underline" to="/">
          Return to workspaces
        </Link>
      </WorkspaceMessage>
    );
  }

  const saveIdentity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = requiredFormValue(form, "identityName");
    const avatarUrl = requiredFormValue(form, "avatarUrl");
    const pendingCommand = retainCommandId(
      identityCommand.current,
      JSON.stringify([workspaceId, name, avatarUrl]),
    );
    identityCommand.current = pendingCommand;
    updateIdentity.mutate(
      {
        workspaceId,
        data: {
          commandId: pendingCommand.commandId,
          name,
          avatarUrl,
        },
      },
      {
        onSuccess: async () => {
          identityCommand.current = releaseCommandId(
            identityCommand.current,
            pendingCommand.commandId,
          );
          await queryClient.invalidateQueries({
            queryKey: getWorkspacesGetWorkspaceQueryKey(workspaceId),
          });
          await invalidateWorkspacesListWorkspaces(queryClient);
        },
      },
    );
  };

  const leave = () => {
    const pendingCommand = retainCommandId(leaveCommand.current, workspaceId);
    leaveCommand.current = pendingCommand;
    endMembership.mutate(
      { workspaceId, data: { commandId: pendingCommand.commandId } },
      {
        onSuccess: async () => {
          leaveCommand.current = releaseCommandId(leaveCommand.current, pendingCommand.commandId);
          await invalidateWorkspacesListWorkspaces(queryClient);
          await navigate({
            to: "/",
            search: { left: workspace.data.workspace.name },
          });
          queryClient.removeQueries({ queryKey: getWorkspacesGetWorkspaceQueryKey(workspaceId) });
        },
      },
    );
  };

  return (
    <main className="min-h-svh bg-muted/30 p-5 sm:p-8">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-3xl border bg-card p-4 shadow-sm lg:sticky lg:top-8">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="font-heading text-sm font-semibold tracking-[0.16em] text-primary uppercase">
              Cove
            </p>
            <Link className="text-xs font-medium text-primary hover:underline" to="/">
              All workspaces
            </Link>
          </div>
          <nav className="mt-4" aria-label="Workspace switcher">
            {workspaces.isPending ? (
              <p className="px-3 py-2.5 text-sm text-muted-foreground" role="status">
                Loading workspaces…
              </p>
            ) : workspaces.isError ? (
              <p className="px-3 py-2.5 text-sm text-muted-foreground" role="alert">
                Workspace switcher unavailable.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {workspaces.data.workspaces.map((item) => (
                  <li key={item.id}>
                    <Link
                      to="/workspaces/$workspaceId"
                      params={{ workspaceId: item.id }}
                      aria-current={item.id === workspaceId ? "page" : undefined}
                      aria-label={`${item.name} ${roleLabel(item.membership.role)}`}
                      className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:bg-primary/10"
                    >
                      <span className="block truncate text-sm font-semibold">{item.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {roleLabel(item.membership.role)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </aside>

        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <header className="border-b bg-primary/5 p-6 sm:p-8">
            <p className="font-heading text-sm font-semibold tracking-[0.18em] text-primary uppercase">
              {workspace.data.workspace.name}
            </p>
            <div className="mt-6 flex items-center gap-4">
              <img
                className="size-20 rounded-2xl border bg-background object-cover"
                src={workspace.data.identity.avatarUrl}
                alt={workspace.data.identity.name}
              />
              <div>
                <h1 className="font-heading text-3xl font-semibold tracking-tight">
                  {workspace.data.identity.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground capitalize">
                  {workspace.data.membership.role} · Workspace Identity
                </p>
              </div>
            </div>
          </header>

          <div className="p-6 sm:p-8">
            <h2 className="font-heading text-xl font-semibold">You are inside the workspace.</h2>
            <p className="mt-2 max-w-xl text-muted-foreground">
              This name and avatar belong to this workspace. Your account only handles sign-in.
            </p>

            <form
              key={workspaceId}
              className="mt-10 grid gap-5 border-t pt-6 sm:grid-cols-2"
              onSubmit={saveIdentity}
            >
              <div className="sm:col-span-2">
                <h2 className="font-heading text-base font-semibold">Workspace Identity</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Changes stay inside {workspace.data.workspace.name}.
                </p>
              </div>
              <label className="text-sm font-medium" htmlFor="identityName">
                Your name in this workspace
                <input
                  id="identityName"
                  name="identityName"
                  required
                  defaultValue={workspace.data.identity.name}
                  className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
              <label className="text-sm font-medium" htmlFor="avatarUrl">
                Avatar URL
                <input
                  id="avatarUrl"
                  name="avatarUrl"
                  required
                  defaultValue={workspace.data.identity.avatarUrl}
                  className="mt-2 h-11 w-full rounded-xl border bg-background px-3 font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={updateIdentity.isPending}>
                  {updateIdentity.isPending ? "Saving…" : "Save workspace identity"}
                </Button>
                {updateIdentity.isSuccess ? (
                  <p className="mt-3 text-sm text-muted-foreground" role="status">
                    Workspace identity saved.
                  </p>
                ) : null}
                {updateIdentity.isError ? (
                  <p className="mt-3 text-sm text-destructive" role="alert">
                    Cove could not save this workspace identity. Try again.
                  </p>
                ) : null}
              </div>
            </form>

            <div className="mt-10 border-t pt-6">
              <h2 className="font-heading text-base font-semibold">Membership</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Leaving removes access. Your workspace identity remains for durable attribution.
              </p>
              <Button
                className="mt-4"
                variant="destructive"
                type="button"
                disabled={endMembership.isPending}
                onClick={leave}
              >
                {endMembership.isPending ? "Leaving…" : "Leave workspace"}
              </Button>
              {endMembership.error === null ? null : (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {leaveErrorMessage(endMembership.error)}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function leaveErrorMessage(error: unknown): string {
  if (!(error instanceof CoveApiError)) {
    return "We couldn't leave the workspace. Try again in a moment.";
  }

  switch (error.info.code) {
    case "LAST_WORKSPACE_OWNER":
      return "You are the last workspace owner. Promote another member before leaving.";
    case "UNAUTHENTICATED":
      return "Your session has expired. Sign in again, then try leaving the workspace.";
    case "CSRF_VALIDATION_FAILED":
      return "We couldn't verify your session. Refresh the page and try again.";
    default:
      return "We couldn't leave the workspace. Try again in a moment.";
  }
}

function WorkspaceMessage({
  children,
  message,
}: {
  readonly children?: React.ReactNode;
  readonly message: string;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-5 text-center">
      <div>
        <p className="text-muted-foreground" role="status">
          {message}
        </p>
        {children}
      </div>
    </main>
  );
}
