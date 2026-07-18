import { Button } from "@cove/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [clickCount, setClickCount] = useState(0);

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-8">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-8 shadow-sm">
        <p className="mb-3 text-sm font-medium text-primary">@cove/ui</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          The shared UI package is connected.
        </h1>
        <p className="mt-3 text-muted-foreground">
          This Button comes from the new shadcn package and uses the generated preset theme.
        </p>

        <div className="mt-6 flex items-center gap-4">
          <Button type="button" onClick={() => setClickCount((count) => count + 1)}>
            Test shared Button
          </Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Clicked {clickCount} {clickCount === 1 ? "time" : "times"}
          </span>
        </div>
      </section>
    </main>
  );
}
