import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  getWorkspacesGetWorkspaceQueryKey,
  invalidateWorkspacesListWorkspaces,
  useWorkspacesEndMembership,
  useWorkspacesGetWorkspace,
} from "../api/generated/cove-app.ts";

export const Route = createFileRoute("/workspaces/$workspaceId")({ component: WorkspaceHome });

function WorkspaceHome() {
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspacesGetWorkspace(workspaceId, { query: { retry: false } });
  const endMembership = useWorkspacesEndMembership();

  if (workspace.isPending) return <WorkspaceMessage message="Entering workspace…" />;
  if (workspace.isError) {
    return (
      <WorkspaceMessage message="This workspace is not available to your account.">
        <Link className="mt-4 inline-block text-sm font-medium text-primary hover:underline" to="/">
          Return to workspaces
        </Link>
      </WorkspaceMessage>
    );
  }

  const leave = () => {
    endMembership.mutate(
      { workspaceId },
      {
        onSuccess: async () => {
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
      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border bg-card shadow-sm">
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
                {workspace.data.role} · Workspace Identity
              </p>
            </div>
          </div>
        </header>

        <div className="p-6 sm:p-8">
          <h2 className="font-heading text-xl font-semibold">You are inside the workspace.</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            This name and avatar belong to this workspace. Your account only handles sign-in.
          </p>

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
          </div>
        </div>
      </section>
    </main>
  );
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
