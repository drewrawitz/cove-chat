import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  createAccountConversationState,
  AccountConversationStorageUnavailableError,
  readActiveConversationAccountId,
  type AccountConversationScope,
} from "./account-conversation-state.ts";
import { BroadcastHub, MemoryStorage } from "./test-support/account-conversation-state.ts";

const scope: AccountConversationScope = {
  workspaceId: "workspace-1",
  channelId: "channel-1",
  topicId: "topic-1",
};

class FailingStorage extends MemoryStorage {
  failRemovals = false;
  failWrites = false;

  override removeItem(key: string): void {
    if (this.failRemovals) throw new DOMException("Storage unavailable");
    super.removeItem(key);
  }

  override setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException("Storage unavailable");
    super.setItem(key, value);
  }
}

const stores: Array<ReturnType<typeof createAccountConversationState>> = [];

afterEach(() => {
  for (const store of stores) store.destroy();
  stores.length = 0;
});

const makeStore = (
  accountId: string,
  storage: Storage,
  hub = new BroadcastHub(),
  now: () => number = () => Date.parse("2026-07-25T12:00:00.000Z"),
  sourceStorage: Storage = new MemoryStorage(),
) => {
  const store = createAccountConversationState({
    accountId,
    storage,
    sourceStorage,
    createBroadcastChannel: hub.create,
    now,
  });
  stores.push(store);
  return store;
};

describe("Account conversation state", () => {
  it("isolates drafts and unresolved Message commands by Account", () => {
    const storage = new MemoryStorage();
    const alice = makeStore("alice", storage);
    const bob = makeStore("bob", storage);

    alice.writeDraft(scope, "Alice's unsent Reply");
    alice.startCommand(scope, {
      kind: "create",
      commandId: "command-1",
      body: "Alice's pending Reply",
      author: {
        id: "alice-identity",
        name: "Alice in Cove",
        avatarUrl: "/avatars/alice.svg",
      },
      createdAt: "2026-07-25T12:00:00.000Z",
    });

    expect(alice.readDraft(scope)).toBe("Alice's unsent Reply");
    expect(alice.commandsFor(scope)).toHaveLength(1);
    expect(bob.readDraft(scope)).toBe("");
    expect(bob.commandsFor(scope)).toEqual([]);
  });

  it("remembers only the active Account and removes its marker when clearing", () => {
    const storage = new MemoryStorage();
    const alice = makeStore("alice", storage);

    expect(readActiveConversationAccountId(storage)).toBe("alice");

    alice.clearAccount();

    expect(readActiveConversationAccountId(storage)).toBeUndefined();
  });

  it("expires drafts lazily after 30 days without editing", () => {
    let currentTime = Date.parse("2026-07-01T00:00:00.000Z");
    const store = makeStore("alice", new MemoryStorage(), new BroadcastHub(), () => currentTime);

    store.writeDraft(scope, "Still useful");
    currentTime += 30 * 24 * 60 * 60 * 1_000;
    expect(store.readDraft(scope)).toBe("Still useful");

    currentTime += 1;
    expect(store.readDraft(scope)).toBe("");
  });

  it("prunes expired drafts while writing in another Topic", () => {
    let currentTime = Date.parse("2026-07-01T00:00:00.000Z");
    const store = makeStore("alice", new MemoryStorage(), new BroadcastHub(), () => currentTime);
    store.writeDraft(scope, "Expired draft");
    currentTime += 30 * 24 * 60 * 60 * 1_000 + 1;

    store.writeDraft({ ...scope, topicId: "topic-2" }, "Fresh draft");

    expect(store.getSnapshot().drafts).toMatchObject([{ topicId: "topic-2", body: "Fresh draft" }]);
  });

  it("restores unresolved commands without dispatching them and shares one journal across tabs", () => {
    const storage = new MemoryStorage();
    const hub = new BroadcastHub();
    const sourceStorage = new MemoryStorage();
    const sourceTab = makeStore("alice", storage, hub, undefined, sourceStorage);
    const otherTab = makeStore("alice", storage, hub, undefined, new MemoryStorage());

    sourceTab.startCommand(scope, {
      kind: "create",
      commandId: "command-1",
      body: "One shared overlay",
      author: {
        id: "alice-identity",
        name: "Alice in Cove",
        avatarUrl: "/avatars/alice.svg",
      },
      createdAt: "2026-07-25T12:00:00.000Z",
    });
    sourceTab.markCommandAccepted("command-1");

    expect(sourceTab.ownsCommand("command-1")).toBe(true);
    expect(otherTab.ownsCommand("command-1")).toBe(false);
    expect(otherTab.commandsFor(scope)).toMatchObject([
      {
        commandId: "command-1",
        phase: "syncing",
      },
    ]);

    const reloadedTab = makeStore("alice", storage, hub, undefined, sourceStorage);
    expect(reloadedTab.ownsCommand("command-1")).toBe(true);
    expect(reloadedTab.commandsFor(scope)).toMatchObject([
      {
        commandId: "command-1",
        phase: "syncing",
      },
    ]);
  });

  it("clears drafts, commands, and the whole Account independently", () => {
    const storage = new MemoryStorage();
    const store = makeStore("alice", storage);

    store.writeDraft(scope, "Unsent");
    store.startCommand(scope, {
      kind: "delete",
      commandId: "command-1",
      messageId: "message-1",
      expectedVersion: 1,
    });

    store.clearDrafts();
    expect(store.readDraft(scope)).toBe("");
    expect(store.commandsFor(scope)).toHaveLength(1);

    store.writeDraft(scope, "Unsent again");
    store.clearCommands();
    expect(store.readDraft(scope)).toBe("Unsent again");
    expect(store.commandsFor(scope)).toEqual([]);

    store.startCommand(scope, {
      kind: "delete",
      commandId: "command-2",
      messageId: "message-1",
      expectedVersion: 1,
    });
    store.markAutomaticZeroRepairAttempted();
    store.clearAccount();

    expect(store.readDraft(scope)).toBe("");
    expect(store.commandsFor(scope)).toEqual([]);
    expect(store.hasAutomaticZeroRepairAttempted()).toBe(false);
  });

  it("propagates Account clearing to other tabs without touching another Account", () => {
    const storage = new MemoryStorage();
    const hub = new BroadcastHub();
    const sourceTab = makeStore("alice", storage, hub);
    const otherTab = makeStore("alice", storage, hub);
    const bob = makeStore("bob", storage, hub);
    let otherTabWasDeactivated = false;
    otherTab.subscribeAccountClearStarted(() => {
      otherTabWasDeactivated = true;
    });
    sourceTab.writeDraft(scope, "Alice's private draft");
    bob.writeDraft(scope, "Bob's private draft");

    sourceTab.clearAccount();

    expect(otherTabWasDeactivated).toBe(true);
    expect(otherTab.readDraft(scope)).toBe("");
    expect(bob.readDraft(scope)).toBe("Bob's private draft");
  });

  it("removes every Topic draft in a Channel after access loss", () => {
    const store = makeStore("alice", new MemoryStorage());
    store.writeDraft(scope, "Private draft");
    store.writeDraft({ ...scope, topicId: "topic-2" }, "Another private draft");
    store.writeDraft({ ...scope, channelId: "channel-2" }, "Unrelated Channel draft");

    store.clearChannelDrafts(scope.workspaceId, scope.channelId);

    expect(store.readDraft(scope)).toBe("");
    expect(store.readDraft({ ...scope, topicId: "topic-2" })).toBe("");
    expect(store.readDraft({ ...scope, channelId: "channel-2" })).toBe("Unrelated Channel draft");
  });

  it("discards malformed browser data instead of exposing corrupt conversation state", () => {
    const storage: Storage = {
      length: 1,
      clear: () => undefined,
      getItem: () => "{not-json",
      key: () => "corrupt",
      removeItem: () => undefined,
      setItem: () => undefined,
    };

    const store = makeStore("alice", storage);

    expect(store.readDraft(scope)).toBe("");
    expect(store.commandsFor(scope)).toEqual([]);
    expect(store.getSnapshot().storageHealth).toBe("recovered");
  });

  it("validates persisted draft timestamps and size before exposing them", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "cove:account-conversation:alice:drafts",
      JSON.stringify({
        version: 1,
        drafts: [{ ...scope, body: "x".repeat(8 * 1_024 + 1), updatedAt: "not-a-date" }],
      }),
    );

    const store = makeStore("alice", storage);

    expect(store.readDraft(scope)).toBe("");
    expect(store.getSnapshot().storageHealth).toBe("recovered");
    expect(() => store.writeDraft(scope, "x".repeat(8 * 1_024 + 1))).toThrow(RangeError);
  });

  it("rejects corrupt command phases and versions before restoring overlays", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "cove:account-conversation:alice:commands",
      JSON.stringify({
        version: 1,
        commands: [
          {
            ...scope,
            commandId: "command-1",
            kind: "delete",
            messageId: "message-1",
            expectedVersion: -1,
            phase: "rejected",
            reason: "invented_rejection",
            startedAt: "2026-07-25T12:00:00.000Z",
          },
        ],
      }),
    );

    const store = makeStore("alice", storage);

    expect(store.commandsFor(scope)).toEqual([]);
    expect(store.getSnapshot().storageHealth).toBe("recovered");
  });

  it("reports unavailable storage and refuses work that could not survive reload", () => {
    const storage: Storage = {
      length: 0,
      clear: () => undefined,
      getItem: () => null,
      key: () => null,
      removeItem: () => {
        throw new DOMException("Storage unavailable");
      },
      setItem: () => {
        throw new DOMException("Storage unavailable");
      },
    };
    const store = makeStore("alice", storage);

    expect(store.getSnapshot().storageHealth).toBe("unavailable");
    expect(() => store.writeDraft(scope, "Cannot persist")).toThrow(
      AccountConversationStorageUnavailableError,
    );
    expect(() =>
      store.startCommand(scope, {
        kind: "delete",
        commandId: "command-1",
        messageId: "message-1",
        expectedVersion: 1,
      }),
    ).toThrow(AccountConversationStorageUnavailableError);
    expect(store.commandsFor(scope)).toEqual([]);
  });

  it("retries draft and command persistence after browser storage recovers", () => {
    const storage = new FailingStorage();
    const store = makeStore("alice", storage);
    storage.failWrites = true;

    expect(() => store.writeDraft(scope, "Recovered draft")).toThrow(
      AccountConversationStorageUnavailableError,
    );
    expect(() =>
      store.startCommand(scope, {
        kind: "delete",
        commandId: "command-1",
        messageId: "message-1",
        expectedVersion: 1,
      }),
    ).toThrow(AccountConversationStorageUnavailableError);

    storage.failWrites = false;
    store.writeDraft(scope, "Recovered draft");
    store.startCommand(scope, {
      kind: "delete",
      commandId: "command-1",
      messageId: "message-1",
      expectedVersion: 1,
    });

    expect(store.readDraft(scope)).toBe("Recovered draft");
    expect(store.commandsFor(scope)).toHaveLength(1);
    expect(store.getSnapshot().storageHealth).toBe("recovered");
  });

  it("restores commands when dismissal or reconciliation cannot be persisted", () => {
    const storage = new FailingStorage();
    const store = makeStore("alice", storage);
    for (const commandId of ["command-1", "command-2"]) {
      store.startCommand(scope, {
        kind: "delete",
        commandId,
        messageId: `message-${commandId}`,
        expectedVersion: 1,
      });
    }
    storage.failWrites = true;

    store.dismissCommand("command-1");
    expect(store.commandsFor(scope).map(({ commandId }) => commandId)).toEqual([
      "command-1",
      "command-2",
    ]);

    store.reconcileCommands(["command-2"]);
    expect(store.commandsFor(scope).map(({ commandId }) => commandId)).toEqual([
      "command-1",
      "command-2",
    ]);
  });

  it("deactivates other tabs before Account erasure and surfaces failures for retry", () => {
    const storage = new FailingStorage();
    const hub = new BroadcastHub();
    const sourceTab = makeStore("alice", storage, hub);
    const otherTab = makeStore("alice", storage, hub);
    let otherTabDeactivationCount = 0;
    otherTab.subscribeAccountClearStarted(() => {
      otherTabDeactivationCount += 1;
    });
    sourceTab.writeDraft(scope, "Must be erased");
    storage.failRemovals = true;

    expect(() => sourceTab.clearAccount()).toThrow(AccountConversationStorageUnavailableError);
    expect(otherTabDeactivationCount).toBe(1);
    expect(storage.values.has("cove:account-conversation:alice:drafts")).toBe(true);
    expect(readActiveConversationAccountId(storage)).toBe("alice");

    storage.failRemovals = false;
    sourceTab.clearAccount();

    expect(otherTabDeactivationCount).toBe(2);
    expect(storage.values.has("cove:account-conversation:alice:drafts")).toBe(false);
  });

  it("surfaces targeted draft erasure failures so access-loss cleanup can be retried", () => {
    const storage = new FailingStorage();
    const store = makeStore("alice", storage);
    store.writeDraft(scope, "Must be erased");
    storage.failWrites = true;

    expect(() => store.clearDraft(scope)).toThrow(AccountConversationStorageUnavailableError);
    expect(store.readDraft(scope)).toBe("Must be erased");

    storage.failWrites = false;
    store.clearDraft(scope);

    expect(store.readDraft(scope)).toBe("");
    expect(store.getSnapshot().storageHealth).toBe("recovered");
  });
});
