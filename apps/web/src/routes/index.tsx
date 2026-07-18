import { Button } from "@cove/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useAuthLogin, useAuthMe, useWorkspacesListWorkspaces } from "../api/generated/cove-app.ts";

interface HomeSearch {
  readonly left?: string;
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    left: typeof search.left === "string" ? search.left : undefined,
  }),
  component: Home,
});

function Home() {
  const { left } = Route.useSearch();
  const account = useAuthMe({ query: { retry: false } });
  const workspaces = useWorkspacesListWorkspaces({
    query: { enabled: account.isSuccess, retry: false },
  });

  if (account.isPending) return <PageMessage message="Opening Cove…" />;
  if (account.isError && account.error.status === 401) return <SignIn />;
  if (account.isError) return <PageMessage message="Cove could not load your account." />;
  if (workspaces.isPending) return <PageMessage message="Opening Cove…" />;
  if (workspaces.isError) {
    return <PageMessage message="Cove could not load your workspaces." />;
  }

  return (
    <main className="min-h-svh bg-muted/30 px-5 py-12 sm:px-8">
      <section className="mx-auto w-full max-w-2xl">
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

        <ul className="mt-8 grid gap-3">
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
                    {workspace.role}
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
      </section>
    </main>
  );
}

function SignIn() {
  const [message, setMessage] = useState<string>();
  const login = useAuthLogin();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const emailValue = form.get("email");
    const email = typeof emailValue === "string" ? emailValue : "";
    setMessage(undefined);
    login.mutate(
      { data: { email } },
      {
        onSuccess: () => setMessage("Check your email for a one-time sign-in link."),
        onError: () => setMessage("Cove could not send the sign-in link. Please try again."),
      },
    );
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-5">
      <section className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-sm sm:p-10">
        <p className="font-heading text-sm font-semibold tracking-[0.22em] text-primary uppercase">
          Cove
        </p>
        <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight">
          Calm work starts here.
        </h1>
        <p className="mt-3 text-muted-foreground">
          Sign in with a one-time link. No password to remember.
        </p>

        <form className="mt-8" onSubmit={submit}>
          <label className="text-sm font-medium" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-2 h-11 w-full rounded-xl border bg-background px-3 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="you@example.com"
          />
          <Button className="mt-4 w-full" size="lg" type="submit" disabled={login.isPending}>
            {login.isPending ? "Sending…" : "Send magic link"}
          </Button>
        </form>

        {message === undefined ? null : (
          <p className="mt-5 text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}

function PageMessage({ message }: { readonly message: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-5">
      <p className="text-muted-foreground" role="status">
        {message}
      </p>
    </main>
  );
}
