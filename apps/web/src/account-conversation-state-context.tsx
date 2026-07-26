import {
  createContext,
  useEffect,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type {
  AccountConversationSnapshot,
  AccountConversationState,
} from "./account-conversation-state.ts";
import { topicsGetMessageCommandStatus } from "./api/generated/cove-app.ts";

export type ZeroRecoveryState = "ready" | "repairing" | "manual-recovery-required";

interface AccountConversationRuntime {
  readonly state: AccountConversationState;
  readonly clearAccountConversationState: () => Promise<void>;
  readonly repairZeroCache: () => Promise<void>;
  readonly reportZeroStorageFailure: () => void;
  readonly restartZero: () => void;
  readonly zeroRecoveryState: ZeroRecoveryState;
}

interface AccountConversationStateProviderProps {
  readonly children: ReactNode;
  readonly clearAccountConversationState?: () => Promise<void>;
  readonly repairZeroCache: () => Promise<void>;
  readonly reportZeroStorageFailure?: () => void;
  readonly restartZero: () => void;
  readonly state: AccountConversationState;
  readonly zeroRecoveryState?: ZeroRecoveryState;
}

const AccountConversationContext = createContext<AccountConversationRuntime | undefined>(undefined);
const RECEIPT_CHECK_DELAY_MS = 10_000;
const noAccountCleanup = async (): Promise<void> => undefined;
const ignoreZeroStorageFailure = (): void => undefined;

function DelayedCommandReconciliation({
  restartZero,
  state,
}: {
  readonly restartZero: () => void;
  readonly state: AccountConversationState;
}): null {
  const snapshot = useSyncExternalStore(
    (listener) => state.subscribe(listener),
    () => state.getSnapshot(),
    () => state.getSnapshot(),
  );

  useEffect(() => {
    const timers = snapshot.commands.flatMap((command) => {
      if (
        command.phase !== "syncing" ||
        command.acceptedAt === undefined ||
        command.receiptCheckStartedAt !== undefined
      ) {
        return [];
      }
      const delay = Math.max(
        0,
        Date.parse(command.acceptedAt) + RECEIPT_CHECK_DELAY_MS - Date.now(),
      );
      return [
        window.setTimeout(() => {
          const reconcile = async (): Promise<void> => {
            state.refreshFromStorage();
            const claimed = state.claimReceiptCheck(command.commandId);
            if (claimed === undefined) return;
            try {
              const status = await topicsGetMessageCommandStatus(
                claimed.workspaceId,
                claimed.commandId,
              );
              if (status.status === "rejected") {
                state.markCommandRejected(claimed.commandId, status.rejection);
                return;
              }
              if (state.claimZeroRestart(claimed.commandId) !== undefined) {
                restartZero();
              }
            } catch {
              // A receipt check is deliberately attempted only once.
            }
          };
          const lockManager =
            typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator.locks;
          if (lockManager === undefined) {
            void reconcile();
            return;
          }
          void lockManager
            .request(
              `cove:account-conversation:${encodeURIComponent(state.accountId)}:receipt`,
              reconcile,
            )
            .catch(() => undefined);
        }, delay),
      ];
    });

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [restartZero, snapshot.commands, state]);

  return null;
}

export function AccountConversationStateProvider({
  children,
  clearAccountConversationState = noAccountCleanup,
  repairZeroCache,
  reportZeroStorageFailure = ignoreZeroStorageFailure,
  restartZero,
  state,
  zeroRecoveryState = "ready",
}: AccountConversationStateProviderProps): ReactNode {
  const runtime = useMemo(
    () => ({
      state,
      clearAccountConversationState,
      repairZeroCache,
      reportZeroStorageFailure,
      restartZero,
      zeroRecoveryState,
    }),
    [
      clearAccountConversationState,
      repairZeroCache,
      reportZeroStorageFailure,
      restartZero,
      state,
      zeroRecoveryState,
    ],
  );

  return (
    <AccountConversationContext value={runtime}>
      <DelayedCommandReconciliation restartZero={restartZero} state={state} />
      {children}
    </AccountConversationContext>
  );
}

export function useAccountConversationRuntime(): AccountConversationRuntime {
  const runtime = useContext(AccountConversationContext);
  if (runtime === undefined) {
    throw new Error(
      "useAccountConversationRuntime must be used within AccountConversationStateProvider.",
    );
  }
  return runtime;
}

export function useAccountConversationSnapshot(): AccountConversationSnapshot {
  const { state } = useAccountConversationRuntime();
  return useSyncExternalStore(
    (listener) => state.subscribe(listener),
    () => state.getSnapshot(),
    () => state.getSnapshot(),
  );
}
