import { type ReactElement, useSyncExternalStore } from "react";
import { compactRelativeTime, fullLocalTimestamp, messageTimestampLabel } from "./local-time.ts";

interface LocalTimestampProps {
  readonly className?: string;
  readonly mode: "message" | "relative";
  readonly value: string;
}

const listeners = new Set<() => void>();
let currentTime = Date.now();
let clockInterval: number | undefined;

const updateClock = (): void => {
  currentTime = Date.now();
  for (const listener of listeners) listener();
};

const subscribeToClock = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    currentTime = Date.now();
    clockInterval = window.setInterval(updateClock, 30_000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && clockInterval !== undefined) {
      window.clearInterval(clockInterval);
      clockInterval = undefined;
    }
  };
};

const clockSnapshot = (): number => currentTime;
const serverClockSnapshot = (): number => 0;

export function LocalTimestamp({ className, mode, value }: LocalTimestampProps): ReactElement {
  const now = useSyncExternalStore(subscribeToClock, clockSnapshot, serverClockSnapshot);
  const timestamp = new Date(value);
  const hydrated = now !== 0;
  const label = hydrated
    ? mode === "relative"
      ? compactRelativeTime(timestamp, new Date(now))
      : messageTimestampLabel(timestamp, new Date(now))
    : "…";

  return (
    <time
      className={className}
      dateTime={timestamp.toISOString()}
      title={hydrated ? fullLocalTimestamp(timestamp) : undefined}
      suppressHydrationWarning
    >
      {label}
    </time>
  );
}
