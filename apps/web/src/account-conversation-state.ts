import { messageBodyValidity } from "./content-bounds.ts";
import type { MessageCommandRejection, OverlayMessageCommand } from "./message-command-overlay.ts";

const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const STORAGE_VERSION = 1;
const ACTIVE_ACCOUNT_KEY = "cove:account-conversation:active-account";

export interface AccountConversationScope {
  readonly workspaceId: string;
  readonly channelId: string;
  readonly topicId: string;
}

type StartedMessageCommand = OverlayMessageCommand extends infer Command
  ? Command extends OverlayMessageCommand
    ? Omit<Command, "phase" | "reason">
    : never
  : never;

export type StoredMessageCommand = OverlayMessageCommand extends infer Command
  ? Command extends OverlayMessageCommand
    ? Command &
        AccountConversationScope & {
          readonly startedAt: string;
          readonly sourceInstanceId: string;
          readonly acceptedAt?: string;
          readonly receiptCheckStartedAt?: string;
          readonly zeroRestartedAt?: string;
        }
    : never
  : never;

interface StoredDraft extends AccountConversationScope {
  readonly body: string;
  readonly updatedAt: string;
}

interface DraftEnvelope {
  readonly version: typeof STORAGE_VERSION;
  readonly drafts: ReadonlyArray<StoredDraft>;
}

interface CommandEnvelope {
  readonly version: typeof STORAGE_VERSION;
  readonly commands: ReadonlyArray<StoredMessageCommand>;
}

interface RecoveryEnvelope {
  readonly version: typeof STORAGE_VERSION;
  readonly automaticZeroRepairAttempted: boolean;
}

export type AccountConversationStorageHealth = "healthy" | "recovered" | "unavailable";

export class AccountConversationStorageUnavailableError extends Error {
  constructor() {
    super("Account conversation storage is unavailable.");
    this.name = "AccountConversationStorageUnavailableError";
  }
}

export interface AccountConversationSnapshot {
  readonly commands: ReadonlyArray<StoredMessageCommand>;
  readonly drafts: ReadonlyArray<StoredDraft>;
  readonly automaticZeroRepairAttempted: boolean;
  readonly storageHealth: AccountConversationStorageHealth;
}

type BroadcastEvent =
  | { readonly type: "state-changed" }
  | { readonly type: "account-clear-started" }
  | { readonly type: "account-cleared" };

type BroadcastListener = (event: MessageEvent<unknown>) => void;

export interface AccountConversationBroadcast {
  addEventListener(type: "message", listener: BroadcastListener): void;
  close(): void;
  postMessage(message: BroadcastEvent): void;
  removeEventListener(type: "message", listener: BroadcastListener): void;
}

export interface CreateAccountConversationStateOptions {
  readonly accountId: string;
  readonly storage?: Storage;
  readonly sourceStorage?: Storage;
  readonly createBroadcastChannel?: (name: string) => AccountConversationBroadcast;
  readonly now?: () => number;
}

export interface AccountConversationState {
  readonly accountId: string;
  clearAccount(): void;
  clearChannelDrafts(workspaceId: string, channelId: string): void;
  clearCommands(): void;
  clearDraft(scope: AccountConversationScope): void;
  clearDrafts(): void;
  commandsFor(scope: AccountConversationScope): ReadonlyArray<StoredMessageCommand>;
  allCommands(): ReadonlyArray<StoredMessageCommand>;
  destroy(): void;
  dismissCommand(commandId: string): void;
  getSnapshot(): AccountConversationSnapshot;
  hasAutomaticZeroRepairAttempted(): boolean;
  markAutomaticZeroRepairAttempted(): void;
  markCommandAccepted(commandId: string): void;
  markCommandRejected(commandId: string, reason: MessageCommandRejection): void;
  markCommandRetried(commandId: string): boolean;
  markCommandUncertain(commandId: string): void;
  ownsCommand(commandId: string): boolean;
  claimReceiptCheck(commandId: string): StoredMessageCommand | undefined;
  claimZeroRestart(commandId: string): StoredMessageCommand | undefined;
  readDraft(scope: AccountConversationScope): string;
  refreshFromStorage(): void;
  reconcileCommands(producedCommandIds: ReadonlyArray<string>): void;
  startCommand(scope: AccountConversationScope, command: StartedMessageCommand): void;
  subscribe(listener: () => void): () => void;
  subscribeAccountClearStarted(listener: () => void): () => void;
  writeDraft(scope: AccountConversationScope, body: string): void;
}

const unavailableStorage: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => {
    throw new AccountConversationStorageUnavailableError();
  },
  setItem: () => {
    throw new AccountConversationStorageUnavailableError();
  },
};

const defaultStorage = (): Storage => {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? unavailableStorage
      : globalThis.localStorage;
  } catch {
    return unavailableStorage;
  }
};

const defaultSourceStorage = (): Storage => {
  try {
    return typeof globalThis.sessionStorage === "undefined"
      ? unavailableStorage
      : globalThis.sessionStorage;
  } catch {
    return unavailableStorage;
  }
};

export function readActiveConversationAccountId(
  storage: Storage = defaultStorage(),
): string | undefined {
  try {
    const accountId = storage.getItem(ACTIVE_ACCOUNT_KEY);
    return accountId === null || accountId.length === 0 ? undefined : accountId;
  } catch {
    return undefined;
  }
}

const defaultBroadcastFactory = (name: string): AccountConversationBroadcast =>
  typeof globalThis.BroadcastChannel === "undefined"
    ? {
        addEventListener: () => undefined,
        close: () => undefined,
        postMessage: () => undefined,
        removeEventListener: () => undefined,
      }
    : new BroadcastChannel(name);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isTimestamp = (value: unknown): value is string =>
  isString(value) && Number.isFinite(Date.parse(value));

const isOptionalTimestamp = (value: unknown): value is string | undefined =>
  value === undefined || isTimestamp(value);

const isScope = (value: unknown): value is AccountConversationScope =>
  isObject(value) &&
  isString(value.workspaceId) &&
  isString(value.channelId) &&
  isString(value.topicId);

const isDraft = (value: unknown): value is StoredDraft => {
  if (!isObject(value)) return false;
  return (
    isScope(value) &&
    isString(value.body) &&
    value.body.length > 0 &&
    messageBodyValidity(value.body).length === 0 &&
    isTimestamp(value.updatedAt)
  );
};

const isAuthor = (value: unknown): boolean =>
  isObject(value) && isString(value.id) && isString(value.name) && isString(value.avatarUrl);

const commandRejections: ReadonlyArray<MessageCommandRejection> = [
  "channel_unavailable",
  "topic_unavailable",
  "message_unavailable",
  "mutation_forbidden",
  "stale_version",
  "conflict",
];

const hasValidCommandPhase = (value: Record<string, unknown>): boolean =>
  value.phase === "rejected"
    ? isString(value.reason) && commandRejections.includes(value.reason as MessageCommandRejection)
    : value.reason === undefined;

const isMessageVersion = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isCommand = (value: unknown): value is StoredMessageCommand => {
  if (!isObject(value)) return false;
  if (
    !isScope(value) ||
    !isString(value.kind) ||
    !isString(value.commandId) ||
    !["pending", "syncing", "uncertain", "rejected"].includes(String(value.phase)) ||
    !isTimestamp(value.startedAt) ||
    !isString(value.sourceInstanceId) ||
    !isOptionalTimestamp(value.acceptedAt) ||
    !isOptionalTimestamp(value.receiptCheckStartedAt) ||
    !isOptionalTimestamp(value.zeroRestartedAt) ||
    !hasValidCommandPhase(value)
  ) {
    return false;
  }
  if (value.kind === "create") {
    return (
      isString(value.body) &&
      messageBodyValidity(value.body).length === 0 &&
      isTimestamp(value.createdAt) &&
      isAuthor(value.author)
    );
  }
  if (value.kind === "edit") {
    return (
      isString(value.messageId) &&
      isMessageVersion(value.expectedVersion) &&
      isString(value.body) &&
      messageBodyValidity(value.body).length === 0
    );
  }
  return (
    value.kind === "delete" && isString(value.messageId) && isMessageVersion(value.expectedVersion)
  );
};

const isDraftEnvelope = (value: unknown): value is DraftEnvelope =>
  isObject(value) &&
  value.version === STORAGE_VERSION &&
  Array.isArray(value.drafts) &&
  value.drafts.every(isDraft);

const isCommandEnvelope = (value: unknown): value is CommandEnvelope =>
  isObject(value) &&
  value.version === STORAGE_VERSION &&
  Array.isArray(value.commands) &&
  value.commands.every(isCommand);

const isRecoveryEnvelope = (value: unknown): value is RecoveryEnvelope =>
  isObject(value) &&
  value.version === STORAGE_VERSION &&
  typeof value.automaticZeroRepairAttempted === "boolean";

const sameScope = (left: AccountConversationScope, right: AccountConversationScope): boolean =>
  left.workspaceId === right.workspaceId &&
  left.channelId === right.channelId &&
  left.topicId === right.topicId;

export function createAccountConversationState({
  accountId,
  storage = defaultStorage(),
  sourceStorage = defaultSourceStorage(),
  createBroadcastChannel = defaultBroadcastFactory,
  now = Date.now,
}: CreateAccountConversationStateOptions): AccountConversationState {
  const namespace = `cove:account-conversation:${encodeURIComponent(accountId)}`;
  const newInstanceId = (): string =>
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${now()}-${Math.random()}`;
  const sourceInstanceKey = `${namespace}:source-instance`;
  const instanceId = (() => {
    try {
      const current = sourceStorage.getItem(sourceInstanceKey);
      if (current !== null && current.length > 0) return current;
      const created = newInstanceId();
      sourceStorage.setItem(sourceInstanceKey, created);
      return created;
    } catch {
      return newInstanceId();
    }
  })();
  const draftKey = `${namespace}:drafts`;
  const commandKey = `${namespace}:commands`;
  const recoveryKey = `${namespace}:zero-recovery`;
  const broadcast = createBroadcastChannel(namespace);
  const listeners = new Set<() => void>();
  const accountClearStartedListeners = new Set<() => void>();
  let health: AccountConversationStorageHealth = "healthy";
  try {
    storage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
  } catch {
    health = "unavailable";
  }

  const read = <Value>(
    key: string,
    validate: (input: unknown) => input is Value,
    fallback: Value,
  ): Value => {
    try {
      const stored = storage.getItem(key);
      if (stored === null) return fallback;
      const parsed: unknown = JSON.parse(stored);
      if (validate(parsed)) return parsed;
      health = "recovered";
      storage.removeItem(key);
      return fallback;
    } catch {
      health = "recovered";
      try {
        storage.removeItem(key);
      } catch {
        health = "unavailable";
      }
      return fallback;
    }
  };

  let drafts = read<DraftEnvelope>(draftKey, isDraftEnvelope, {
    version: STORAGE_VERSION,
    drafts: [],
  }).drafts;
  let commands = read<CommandEnvelope>(commandKey, isCommandEnvelope, {
    version: STORAGE_VERSION,
    commands: [],
  }).commands;
  let recovery = read<RecoveryEnvelope>(recoveryKey, isRecoveryEnvelope, {
    version: STORAGE_VERSION,
    automaticZeroRepairAttempted: false,
  });
  let snapshot: AccountConversationSnapshot = {
    drafts,
    commands,
    automaticZeroRepairAttempted: recovery.automaticZeroRepairAttempted,
    storageHealth: health,
  };

  const refreshSnapshot = (): void => {
    snapshot = {
      drafts,
      commands,
      automaticZeroRepairAttempted: recovery.automaticZeroRepairAttempted,
      storageHealth: health,
    };
  };

  const notify = (): void => {
    refreshSnapshot();
    for (const listener of listeners) listener();
  };

  const persist = (key: string, value: unknown): boolean => {
    try {
      storage.setItem(key, JSON.stringify(value));
      if (health === "unavailable") health = "recovered";
      return true;
    } catch {
      health = "unavailable";
      return false;
    }
  };

  const announceChange = (): void => {
    notify();
    broadcast.postMessage({ type: "state-changed" });
  };

  const persistDrafts = (): boolean => {
    const persisted = persist(draftKey, {
      version: STORAGE_VERSION,
      drafts,
    } satisfies DraftEnvelope);
    if (persisted) announceChange();
    else notify();
    return persisted;
  };

  const persistCommands = (): boolean => {
    const persisted = persist(commandKey, {
      version: STORAGE_VERSION,
      commands,
    } satisfies CommandEnvelope);
    if (persisted) announceChange();
    else notify();
    return persisted;
  };

  const persistRecovery = (): void => {
    persist(recoveryKey, recovery);
    announceChange();
  };

  const pruneExpiredDrafts = (): void => {
    const freshDrafts = drafts.filter(
      ({ updatedAt }) => now() - Date.parse(updatedAt) <= DRAFT_MAX_AGE_MS,
    );
    if (freshDrafts.length === drafts.length) return;
    drafts = freshDrafts;
    persistDrafts();
  };

  const reload = (): void => {
    drafts = read<DraftEnvelope>(draftKey, isDraftEnvelope, {
      version: STORAGE_VERSION,
      drafts: [],
    }).drafts;
    commands = read<CommandEnvelope>(commandKey, isCommandEnvelope, {
      version: STORAGE_VERSION,
      commands: [],
    }).commands;
    recovery = read<RecoveryEnvelope>(recoveryKey, isRecoveryEnvelope, {
      version: STORAGE_VERSION,
      automaticZeroRepairAttempted: false,
    });
    pruneExpiredDrafts();
    notify();
  };

  const onBroadcast = (event: MessageEvent<unknown>): void => {
    if (!isObject(event.data) || !isString(event.data.type)) return;
    if (event.data.type === "state-changed") {
      reload();
      return;
    }
    if (event.data.type === "account-clear-started") {
      for (const listener of accountClearStartedListeners) listener();
      return;
    }
    if (event.data.type === "account-cleared") {
      reload();
    }
  };
  broadcast.addEventListener("message", onBroadcast);

  const updateCommand = (
    commandId: string,
    update: (command: StoredMessageCommand) => StoredMessageCommand,
  ): StoredMessageCommand | undefined => {
    const current = commands.find((command) => command.commandId === commandId);
    if (current === undefined) return undefined;
    const updated = update(current);
    const previous = commands;
    commands = commands.map((command) => (command.commandId === commandId ? updated : command));
    if (!persistCommands()) {
      commands = previous;
      notify();
      return undefined;
    }
    return updated;
  };

  const removeStoredValue = (key: string): boolean => {
    try {
      storage.removeItem(key);
      return storage.getItem(key) === null;
    } catch {
      return false;
    }
  };

  pruneExpiredDrafts();

  return {
    accountId,
    allCommands: () => commands,
    claimReceiptCheck: (commandId) => {
      const current = commands.find((command) => command.commandId === commandId);
      if (
        current === undefined ||
        current.phase !== "syncing" ||
        current.receiptCheckStartedAt !== undefined
      ) {
        return undefined;
      }
      return updateCommand(commandId, (command) => ({
        ...command,
        receiptCheckStartedAt: new Date(now()).toISOString(),
      }));
    },
    claimZeroRestart: (commandId) => {
      const current = commands.find((command) => command.commandId === commandId);
      if (
        current === undefined ||
        current.phase !== "syncing" ||
        current.zeroRestartedAt !== undefined
      ) {
        return undefined;
      }
      return updateCommand(commandId, (command) => ({
        ...command,
        zeroRestartedAt: new Date(now()).toISOString(),
      }));
    },
    clearAccount: () => {
      broadcast.postMessage({ type: "account-clear-started" });
      const accountValuesRemoved = [draftKey, commandKey, recoveryKey]
        .map(removeStoredValue)
        .every(Boolean);
      let activeMarkerRemoved = true;
      if (accountValuesRemoved) {
        try {
          if (storage.getItem(ACTIVE_ACCOUNT_KEY) === accountId) {
            activeMarkerRemoved = removeStoredValue(ACTIVE_ACCOUNT_KEY);
          }
        } catch {
          activeMarkerRemoved = false;
        }
      }
      if (!accountValuesRemoved || !activeMarkerRemoved) {
        health = "unavailable";
        notify();
        throw new AccountConversationStorageUnavailableError();
      }
      drafts = [];
      commands = [];
      recovery = { version: STORAGE_VERSION, automaticZeroRepairAttempted: false };
      notify();
      broadcast.postMessage({ type: "account-cleared" });
    },
    clearChannelDrafts: (workspaceId, channelId) => {
      const remaining = drafts.filter(
        (draft) => draft.workspaceId !== workspaceId || draft.channelId !== channelId,
      );
      if (remaining.length === drafts.length) return;
      const previous = drafts;
      drafts = remaining;
      if (!persistDrafts()) {
        drafts = previous;
        notify();
        throw new AccountConversationStorageUnavailableError();
      }
    },
    clearCommands: () => {
      const previous = commands;
      commands = [];
      if (!removeStoredValue(commandKey)) {
        commands = previous;
        health = "unavailable";
        notify();
        throw new AccountConversationStorageUnavailableError();
      }
      announceChange();
    },
    clearDraft: (scope) => {
      const remaining = drafts.filter((draft) => !sameScope(draft, scope));
      if (remaining.length === drafts.length) return;
      const previous = drafts;
      drafts = remaining;
      if (!persistDrafts()) {
        drafts = previous;
        notify();
        throw new AccountConversationStorageUnavailableError();
      }
    },
    clearDrafts: () => {
      const previous = drafts;
      drafts = [];
      if (!removeStoredValue(draftKey)) {
        drafts = previous;
        health = "unavailable";
        notify();
        throw new AccountConversationStorageUnavailableError();
      }
      announceChange();
    },
    commandsFor: (scope) => commands.filter((command) => sameScope(command, scope)),
    destroy: () => {
      broadcast.removeEventListener("message", onBroadcast);
      broadcast.close();
      listeners.clear();
      accountClearStartedListeners.clear();
    },
    dismissCommand: (commandId) => {
      const remaining = commands.filter((command) => command.commandId !== commandId);
      if (remaining.length === commands.length) return;
      commands = remaining;
      persistCommands();
    },
    getSnapshot: () => snapshot,
    hasAutomaticZeroRepairAttempted: () => recovery.automaticZeroRepairAttempted,
    markAutomaticZeroRepairAttempted: () => {
      if (recovery.automaticZeroRepairAttempted) return;
      recovery = { version: STORAGE_VERSION, automaticZeroRepairAttempted: true };
      persistRecovery();
    },
    markCommandAccepted: (commandId) => {
      updateCommand(commandId, (command) => ({
        ...command,
        phase: "syncing",
        acceptedAt: command.acceptedAt ?? new Date(now()).toISOString(),
        reason: undefined,
      }));
    },
    markCommandRejected: (commandId, reason) => {
      updateCommand(commandId, (command) => ({ ...command, phase: "rejected", reason }));
    },
    markCommandRetried: (commandId) => {
      return (
        updateCommand(commandId, (command) => ({
          ...command,
          phase: "pending",
          reason: undefined,
        })) !== undefined
      );
    },
    markCommandUncertain: (commandId) => {
      updateCommand(commandId, (command) => ({
        ...command,
        phase: "uncertain",
        reason: undefined,
      }));
    },
    ownsCommand: (commandId) =>
      commands.some(
        (command) => command.commandId === commandId && command.sourceInstanceId === instanceId,
      ),
    readDraft: (scope) => {
      pruneExpiredDrafts();
      return drafts.find((draft) => sameScope(draft, scope))?.body ?? "";
    },
    refreshFromStorage: reload,
    reconcileCommands: (producedCommandIds) => {
      const reconciled = new Set(producedCommandIds);
      const remaining = commands.filter(({ commandId }) => !reconciled.has(commandId));
      if (remaining.length === commands.length) return;
      commands = remaining;
      persistCommands();
    },
    startCommand: (scope, command) => {
      if (commands.some(({ commandId }) => commandId === command.commandId)) return;
      if (health === "unavailable") {
        throw new AccountConversationStorageUnavailableError();
      }
      if ("body" in command) {
        const validationMessage = messageBodyValidity(command.body);
        if (validationMessage.length > 0) throw new RangeError(validationMessage);
      }
      const previous = commands;
      commands = [
        ...commands,
        {
          ...scope,
          ...command,
          phase: "pending",
          sourceInstanceId: instanceId,
          startedAt: new Date(now()).toISOString(),
        } as StoredMessageCommand,
      ];
      if (!persistCommands()) {
        commands = previous;
        notify();
        throw new AccountConversationStorageUnavailableError();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeAccountClearStarted: (listener) => {
      accountClearStartedListeners.add(listener);
      return () => accountClearStartedListeners.delete(listener);
    },
    writeDraft: (scope, body) => {
      pruneExpiredDrafts();
      if (health === "unavailable") {
        throw new AccountConversationStorageUnavailableError();
      }
      if (body.length === 0) {
        const remaining = drafts.filter((draft) => !sameScope(draft, scope));
        if (remaining.length === drafts.length) return;
        const previous = drafts;
        drafts = remaining;
        if (!persistDrafts()) {
          drafts = previous;
          notify();
          throw new AccountConversationStorageUnavailableError();
        }
        return;
      }
      const validationMessage = messageBodyValidity(body);
      if (validationMessage.length > 0) throw new RangeError(validationMessage);
      const draft: StoredDraft = {
        ...scope,
        body,
        updatedAt: new Date(now()).toISOString(),
      };
      const previous = drafts;
      drafts = [...drafts.filter((existing) => !sameScope(existing, scope)), draft];
      if (!persistDrafts()) {
        drafts = previous;
        notify();
        throw new AccountConversationStorageUnavailableError();
      }
    },
  };
}
