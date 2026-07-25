import { describe, expect, it } from "vite-plus/test";
import {
  emptyMessageCommandOverlay,
  messageCommandOverlay,
  overlayTopicMessages,
  type OverlayTopicMessage,
} from "./message-command-overlay.ts";

const author = {
  id: "identity-1",
  name: "Bob in Cove",
  avatarUrl: "/avatars/bob.svg",
};

const committed: OverlayTopicMessage = {
  id: "message-1",
  body: "Committed body.",
  position: 1,
  version: 1,
  createdAt: "2026-07-25T12:00:00.000Z",
  edited: false,
  deleted: false,
  author,
};

describe("Message command overlay", () => {
  it("shows a new Reply as pending, then syncing until Zero exposes its command ID", () => {
    const pending = messageCommandOverlay(emptyMessageCommandOverlay, {
      type: "started",
      command: {
        kind: "create",
        commandId: "create-command",
        body: "Optimistic Reply.",
        author,
        createdAt: "2026-07-25T12:01:00.000Z",
      },
    });
    expect(overlayTopicMessages([committed], pending)).toEqual([
      committed,
      expect.objectContaining({
        body: "Optimistic Reply.",
        optimisticPhase: "pending",
      }),
    ]);

    const syncing = messageCommandOverlay(pending, {
      type: "accepted",
      commandId: "create-command",
    });
    expect(overlayTopicMessages([committed], syncing)[1]).toMatchObject({
      optimisticPhase: "syncing",
    });

    const reconciled = messageCommandOverlay(syncing, {
      type: "synchronized",
      messages: [
        committed,
        {
          ...committed,
          id: "message-2",
          body: "Optimistic Reply.",
          position: 2,
          producedByCommandId: "create-command",
        },
      ],
    });
    expect(reconciled.commands).toEqual([]);
    expect(overlayTopicMessages([committed], reconciled)).toEqual([committed]);
  });

  it("reconciles Zero-first delivery once and ignores the later HTTP acceptance", () => {
    const pending = messageCommandOverlay(emptyMessageCommandOverlay, {
      type: "started",
      command: {
        kind: "edit",
        commandId: "edit-command",
        messageId: committed.id,
        expectedVersion: committed.version,
        body: "Optimistic edit.",
      },
    });
    const synchronized = messageCommandOverlay(pending, {
      type: "synchronized",
      messages: [
        {
          ...committed,
          body: "Optimistic edit.",
          version: 2,
          producedByCommandId: "edit-command",
        },
      ],
    });
    const accepted = messageCommandOverlay(synchronized, {
      type: "accepted",
      commandId: "edit-command",
    });

    expect(synchronized.commands).toEqual([]);
    expect(accepted).toBe(synchronized);
  });

  it("rolls back rejection while retaining stale edit text for review", () => {
    const pending = messageCommandOverlay(emptyMessageCommandOverlay, {
      type: "started",
      command: {
        kind: "edit",
        commandId: "stale-command",
        messageId: committed.id,
        expectedVersion: committed.version,
        body: "Text worth retaining.",
      },
    });
    const rejected = messageCommandOverlay(pending, {
      type: "rejected",
      commandId: "stale-command",
      reason: "stale_version",
    });

    expect(overlayTopicMessages([committed], rejected)).toEqual([committed]);
    expect(rejected.commands).toEqual([
      expect.objectContaining({
        phase: "rejected",
        body: "Text worth retaining.",
        reason: "stale_version",
      }),
    ]);
  });

  it("keeps uncertain optimistic state and retries the original command ID explicitly", () => {
    const pending = messageCommandOverlay(emptyMessageCommandOverlay, {
      type: "started",
      command: {
        kind: "delete",
        commandId: "delete-command",
        messageId: committed.id,
        expectedVersion: committed.version,
      },
    });
    const uncertain = messageCommandOverlay(pending, {
      type: "uncertain",
      commandId: "delete-command",
    });
    const retried = messageCommandOverlay(uncertain, {
      type: "retried",
      commandId: "delete-command",
    });

    expect(overlayTopicMessages([committed], uncertain)[0]).toMatchObject({
      deleted: true,
      optimisticPhase: "uncertain",
    });
    expect(retried.commands).toEqual([
      expect.objectContaining({
        commandId: "delete-command",
        phase: "pending",
      }),
    ]);
  });
});
