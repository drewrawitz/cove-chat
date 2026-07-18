import { Button } from "@cove/ui/components/button";
import { type FormEvent, useState } from "react";
import { useAuthLogin } from "../api/generated/cove-app.ts";

export function SignIn() {
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
