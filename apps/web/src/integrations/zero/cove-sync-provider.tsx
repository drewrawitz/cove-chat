import { schema } from "@cove/sync";
import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Zero } from "@rocicorp/zero";
import { useConnectionState, ZeroProvider } from "@rocicorp/zero/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccountConversationStateProvider,
  type ZeroRecoveryState,
  useAccountConversationRuntime,
} from "../../account-conversation-state-context.tsx";
import {
  createAccountConversationState,
  readActiveConversationAccountId,
} from "../../account-conversation-state.ts";
import { COVE_INVALID_SESSION_EVENT, CoveApiError } from "../../api/cove-fetch.ts";
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

function AccountZeroLifecycle(): null {
  const connection = useConnectionState();
  const navigate = useNavigate();
  const { clearAccountConversationState } = useAccountConversationRuntime();
  const handleConnectionState = useEffectEvent((): void => {
    if (connection.name === "needs-auth") {
      void clearAccountConversationState()
        .then(() => navigate({ to: "/", replace: true }))
        .catch(() => undefined);
    }
  });

  useEffect(() => {
    handleConnectionState();
  }, [connection]);

  return null;
}

function ZeroRecoveryNotice({
  repair,
  state,
}: {
  readonly repair: () => Promise<void>;
  readonly state: ZeroRecoveryState;
}): ReactNode {
  if (state === "ready") return null;
  if (state === "repairing") {
    return (
      <p
        className="fixed inset-x-4 top-16 z-100 mx-auto max-w-lg rounded-xl border border-border bg-background px-4 py-3 text-sm shadow-lg"
        role="status"
      >
        Rebuilding synchronized conversation data…
      </p>
    );
  }

  return (
    <section
      className="fixed inset-x-4 top-16 z-100 mx-auto max-w-lg rounded-xl border border-destructive/40 bg-background p-4 shadow-lg"
      aria-label="Synchronization recovery"
    >
      <p className="text-sm">
        Cove could not rebuild synchronized conversation data automatically. Your drafts and
        unresolved Messages are still safe.
      </p>
      <Button className="mt-3" type="button" size="sm" onClick={() => void repair()}>
        Reset synchronized cache
      </Button>
    </section>
  );
}

function AccountSyncProvider({
  accountId,
  children,
}: {
  readonly accountId: string;
  readonly children: ReactNode;
}): ReactNode {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const conversationState = useMemo(
    () => createAccountConversationState({ accountId }),
    [accountId],
  );
  const context = useMemo(() => ({ userID: accountId }), [accountId]);
  const zero = useRef<Zero | undefined>(undefined);
  const repairInProgress = useRef<Promise<void> | undefined>(undefined);
  const clearInProgress = useRef<Promise<void> | undefined>(undefined);
  const [generation, setGeneration] = useState(0);
  const [accountActive, setAccountActive] = useState(true);
  const [accountClearFailed, setAccountClearFailed] = useState(false);
  const [zeroRecoveryState, setZeroRecoveryState] = useState<ZeroRecoveryState>("ready");

  useEffect(() => () => conversationState.destroy(), [conversationState]);

  const restartZero = useCallback((): void => {
    setGeneration((current) => current + 1);
  }, []);
  const initZero = useCallback((instance: Zero): void => {
    zero.current = instance;
  }, []);

  const repairZeroCache = useCallback((): Promise<void> => {
    if (repairInProgress.current !== undefined) return repairInProgress.current;
    const repair = (async (): Promise<void> => {
      setZeroRecoveryState("repairing");
      const current = zero.current;
      try {
        if (current !== undefined) {
          const result = await current.delete();
          if (result.errors.length > 0) {
            throw new AggregateError(result.errors, "Zero cache deletion failed.");
          }
        }
        if (zero.current === current) zero.current = undefined;
        setGeneration((value) => value + 1);
        setZeroRecoveryState("ready");
      } catch {
        setZeroRecoveryState("manual-recovery-required");
      } finally {
        repairInProgress.current = undefined;
      }
    })();
    repairInProgress.current = repair;
    return repair;
  }, []);

  const reportZeroStorageFailure = useCallback((): void => {
    if (conversationState.hasAutomaticZeroRepairAttempted()) {
      setZeroRecoveryState("manual-recovery-required");
      return;
    }
    conversationState.markAutomaticZeroRepairAttempted();
    void repairZeroCache();
  }, [conversationState, repairZeroCache]);

  const clearAccountConversationState = useCallback(
    (broadcast = true): Promise<void> => {
      if (clearInProgress.current !== undefined) return clearInProgress.current;
      const clear = (async (): Promise<void> => {
        setAccountActive(false);
        setAccountClearFailed(false);
        try {
          if (broadcast) conversationState.clearAccount();
          const current = zero.current;
          if (current !== undefined) {
            const result = await current.delete();
            if (result.errors.length > 0) {
              throw new AggregateError(result.errors, "Zero cache deletion failed.");
            }
          }
          if (zero.current === current) zero.current = undefined;
          await queryClient.cancelQueries();
          queryClient.clear();
          setAccountClearFailed(false);
        } catch (error) {
          setAccountClearFailed(true);
          throw error;
        }
      })().finally(() => {
        clearInProgress.current = undefined;
      });
      clearInProgress.current = clear;
      return clear;
    },
    [conversationState, queryClient],
  );

  const leaveClearedAccount = useCallback((): void => {
    void clearAccountConversationState(false)
      .then(() => navigate({ to: "/", replace: true }))
      .catch(() => undefined);
  }, [clearAccountConversationState, navigate]);

  useEffect(
    () => conversationState.subscribeAccountClearStarted(leaveClearedAccount),
    [conversationState, leaveClearedAccount],
  );

  const clearInvalidSession = useEffectEvent((): void => {
    void clearAccountConversationState()
      .then(() => navigate({ to: "/", replace: true }))
      .catch(() => undefined);
  });
  useEffect(() => {
    const onInvalidSession = (): void => clearInvalidSession();
    window.addEventListener(COVE_INVALID_SESSION_EVENT, onInvalidSession);
    return () => window.removeEventListener(COVE_INVALID_SESSION_EVENT, onInvalidSession);
  }, []);

  if (!accountActive) {
    return (
      <section className="p-6 text-sm text-muted-foreground" aria-label="Account data removal">
        <p role="status">
          {accountClearFailed
            ? "Cove could not remove all synchronized conversation data."
            : "Removing this Account’s conversation data…"}
        </p>
        {accountClearFailed ? (
          <Button
            className="mt-3"
            type="button"
            size="sm"
            onClick={() =>
              void clearAccountConversationState()
                .then(() => navigate({ to: "/", replace: true }))
                .catch(() => undefined)
            }
          >
            Retry removing conversation data
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <AccountConversationStateProvider
      clearAccountConversationState={clearAccountConversationState}
      repairZeroCache={repairZeroCache}
      reportZeroStorageFailure={reportZeroStorageFailure}
      restartZero={restartZero}
      state={conversationState}
      zeroRecoveryState={zeroRecoveryState}
    >
      <ZeroProvider
        key={generation}
        cacheURL={cacheURL}
        context={context}
        init={initZero}
        onClientStateNotFound={reportZeroStorageFailure}
        schema={schema}
        storageKey="cove"
        userID={accountId}
      >
        <AccountZeroLifecycle />
        <DurableSyncStatus enabled />
        <ZeroRecoveryNotice repair={repairZeroCache} state={zeroRecoveryState} />
        {children}
      </ZeroProvider>
    </AccountConversationStateProvider>
  );
}

function AnonymousSyncProvider({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <ZeroProvider cacheURL={cacheURL} context={{ userID: "" }} schema={schema}>
      <DurableSyncStatus enabled={false} />
      {children}
    </ZeroProvider>
  );
}

function ExpiredAccountCleanup({
  accountId,
  children,
}: {
  readonly accountId: string;
  readonly children: ReactNode;
}): ReactNode {
  const queryClient = useQueryClient();
  const conversationState = useMemo(
    () => createAccountConversationState({ accountId }),
    [accountId],
  );
  const cleanup = useRef<Promise<void> | undefined>(undefined);
  const zero = useRef<Zero | undefined>(undefined);
  const [complete, setComplete] = useState(false);
  const [failed, setFailed] = useState(false);
  const context = useMemo(() => ({ userID: accountId }), [accountId]);

  useEffect(() => () => conversationState.destroy(), [conversationState]);

  const eraseZeroCache = useCallback(
    (instance: Zero): void => {
      if (cleanup.current !== undefined) return;
      zero.current = instance;
      setFailed(false);
      const running = (async (): Promise<void> => {
        try {
          conversationState.clearAccount();
          const result = await instance.delete();
          if (result.errors.length > 0) {
            throw new AggregateError(result.errors, "Zero cache deletion failed.");
          }
          zero.current = undefined;
          queryClient.clear();
          setFailed(false);
          setComplete(true);
        } catch {
          setFailed(true);
        }
      })().finally(() => {
        cleanup.current = undefined;
      });
      cleanup.current = running;
    },
    [conversationState, queryClient],
  );

  if (complete) return <AnonymousSyncProvider>{children}</AnonymousSyncProvider>;

  return (
    <ZeroProvider
      cacheURL={cacheURL}
      context={context}
      init={eraseZeroCache}
      schema={schema}
      storageKey="cove"
      userID={accountId}
    >
      <section className="p-6 text-sm text-muted-foreground" aria-label="Account data removal">
        <p role="status">
          {failed
            ? "Cove could not remove all synchronized conversation data."
            : "Removing this Account’s conversation data…"}
        </p>
        {failed ? (
          <Button
            className="mt-3"
            type="button"
            size="sm"
            onClick={() => {
              if (zero.current !== undefined) eraseZeroCache(zero.current);
            }}
          >
            Retry removing conversation data
          </Button>
        ) : null}
      </section>
    </ZeroProvider>
  );
}

export function CoveSyncProvider({ children }: CoveSyncProviderProps): ReactNode {
  const account = useAuthMe({ query: { retry: false } });
  const accountId = account.data?.id;
  if (accountId !== undefined) {
    return <AccountSyncProvider accountId={accountId}>{children}</AccountSyncProvider>;
  }
  if (account.isPending) {
    return (
      <p className="p-6 text-sm text-muted-foreground" role="status">
        Opening Cove…
      </p>
    );
  }
  const expiredAccountId =
    account.isError && account.error instanceof CoveApiError && account.error.status === 401
      ? readActiveConversationAccountId()
      : undefined;
  return expiredAccountId === undefined ? (
    <AnonymousSyncProvider>{children}</AnonymousSyncProvider>
  ) : (
    <ExpiredAccountCleanup accountId={expiredAccountId}>{children}</ExpiredAccountCleanup>
  );
}
