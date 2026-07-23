import { schema } from "@cove/sync";
import { useConnectionState, ZeroProvider } from "@rocicorp/zero/react";
import { type ReactNode, useMemo } from "react";
import { useAuthMe } from "../../api/generated/cove-app.ts";

const cacheURL = import.meta.env.VITE_ZERO_CACHE_URL ?? "http://localhost:4848";

interface CoveSyncProviderProps {
  readonly children: ReactNode;
}

function DurableSyncStatus({ enabled }: { readonly enabled: boolean }) {
  const state = useConnectionState();
  if (!enabled || state.name === "connected") return null;

  const message =
    state.name === "connecting"
      ? "Reconnecting durable updates…"
      : state.name === "needs-auth"
        ? "Sign in again to resume durable updates."
        : "Durable updates are offline.";

  return (
    <p
      className="fixed top-3 left-1/2 z-100 -translate-x-1/2 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium shadow-lg"
      role="status"
    >
      {message}
    </p>
  );
}

export function CoveSyncProvider({ children }: CoveSyncProviderProps): ReactNode {
  const account = useAuthMe({ query: { retry: false } });
  const userID = account.data?.id;
  const context = useMemo(() => ({ userID: userID ?? "" }), [userID]);

  return (
    <ZeroProvider cacheURL={cacheURL} context={context} schema={schema} userID={userID}>
      <DurableSyncStatus enabled={userID !== undefined} />
      {children}
    </ZeroProvider>
  );
}
