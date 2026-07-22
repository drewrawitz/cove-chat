import type { ReactElement } from "react";

export function ChannelLoading(): ReactElement {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:pt-24 xl:px-16"
      role="status"
      aria-label="Opening channel…"
    >
      <span className="sr-only">Opening channel…</span>
      <div className="motion-safe:animate-pulse" aria-hidden="true">
        <header className="flex flex-wrap items-start justify-between gap-6 pb-10">
          <div className="min-w-0 flex-1">
            <div className="h-12 w-56 max-w-full rounded-lg bg-muted/60" />
            <div className="mt-4 h-6 w-2/3 max-w-2xl rounded-md bg-muted/45" />
            <div className="mt-4 h-4 w-44 rounded-md bg-muted/35" />
          </div>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-muted/60" />
            <div className="h-10 w-20 rounded-lg bg-muted/45" />
          </div>
        </header>

        <div className="flex items-baseline justify-between gap-4 border-b pb-4">
          <div className="h-6 w-20 rounded-md bg-muted/50" />
          <div className="h-4 w-12 rounded-md bg-muted/35" />
        </div>
        <div className="flex min-h-72 flex-col items-center justify-center border-b px-6 py-16">
          <div className="size-12 rounded-full border border-border bg-muted/30" />
          <div className="mt-5 h-6 w-32 rounded-md bg-muted/45" />
          <div className="mt-3 h-4 w-72 max-w-full rounded-md bg-muted/35" />
        </div>
      </div>
    </div>
  );
}
