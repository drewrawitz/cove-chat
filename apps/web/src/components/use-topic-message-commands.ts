import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AccountConversationStorageUnavailableError } from "../account-conversation-state.ts";
import {
  useAccountConversationRuntime,
  useAccountConversationSnapshot,
} from "../account-conversation-state-context.tsx";
import {
  useTopicsAddMessage,
  useTopicsDeleteMessage,
  useTopicsEditMessage,
} from "../api/generated/cove-app.ts";
import { CoveApiError } from "../api/cove-fetch.ts";
import { requiredFormValue } from "../form-data.ts";
import {
  overlayTopicMessages,
  type MessageCommandRejection,
  type OverlayMessageCommand,
  type OverlayTopicMessage,
} from "../message-command-overlay.ts";
import { useSnackbar } from "./snackbar.tsx";

interface TopicMessageCommandOptions {
  readonly channelId: string;
  readonly currentIdentity: {
    readonly avatarUrl: string;
    readonly id: string;
    readonly name: string;
  };
  readonly messages: ReadonlyArray<OverlayTopicMessage>;
  readonly topicId: string;
  readonly workspaceId: string;
}

const rejectionFor = (error: unknown): MessageCommandRejection | undefined => {
  if (!(error instanceof CoveApiError) || error.status < 400 || error.status >= 500) {
    return undefined;
  }
  switch (error.info.code) {
    case "CHANNEL_UNAVAILABLE":
      return "channel_unavailable";
    case "TOPIC_UNAVAILABLE":
      return "topic_unavailable";
    case "MESSAGE_UNAVAILABLE":
      return "message_unavailable";
    case "MESSAGE_MUTATION_FORBIDDEN":
      return "mutation_forbidden";
    case "MESSAGE_VERSION_STALE":
      return "stale_version";
    case "MESSAGE_COMMAND_CONFLICT":
      return "conflict";
    default:
      return undefined;
  }
};

export function useTopicMessageCommands({
  channelId,
  currentIdentity,
  messages,
  topicId,
  workspaceId,
}: TopicMessageCommandOptions) {
  const addMutation = useTopicsAddMessage();
  const editMutation = useTopicsEditMessage();
  const deleteMutation = useTopicsDeleteMessage();
  const scrollAfterMessageId = useRef<string | undefined>(undefined);
  const {
    repairZeroCache,
    state: conversationState,
    zeroRecoveryState,
  } = useAccountConversationRuntime();
  const conversationSnapshot = useAccountConversationSnapshot();
  const { showSnackbar } = useSnackbar();
  const [clock, setClock] = useState(Date.now());
  const scope = useMemo(
    () => ({ workspaceId, channelId, topicId }),
    [channelId, topicId, workspaceId],
  );
  const overlay = useMemo(
    () => ({
      commands: conversationSnapshot.commands.filter(
        (command) =>
          command.workspaceId === scope.workspaceId &&
          command.channelId === scope.channelId &&
          command.topicId === scope.topicId,
      ),
      reconciledCommandIds: [],
    }),
    [conversationSnapshot.commands, scope],
  );
  const projectedMessages = useMemo(
    () => overlayTopicMessages(messages, overlay),
    [messages, overlay],
  );
  const conversationStorageAvailable = conversationSnapshot.storageHealth !== "unavailable";

  useEffect(() => {
    conversationState.reconcileCommands(
      messages.flatMap(({ producedByCommandId }) =>
        producedByCommandId === undefined ? [] : [producedByCommandId],
      ),
    );
  }, [conversationState, messages]);

  useEffect(() => {
    const nextRepairAt = overlay.commands.reduce<number | undefined>((earliest, command) => {
      if (command.phase !== "syncing" || command.acceptedAt === undefined) return earliest;
      const repairAt = Date.parse(command.acceptedAt) + 30_000;
      if (repairAt <= clock) return earliest;
      return earliest === undefined ? repairAt : Math.min(earliest, repairAt);
    }, undefined);
    if (nextRepairAt === undefined) return;
    const timer = window.setTimeout(() => setClock(Date.now()), nextRepairAt - clock);
    return () => window.clearTimeout(timer);
  }, [clock, overlay.commands]);

  const send = async (
    command: OverlayMessageCommand,
  ): Promise<"accepted" | "rejected" | "uncertain"> => {
    try {
      switch (command.kind) {
        case "create":
          await addMutation.mutateAsync({
            workspaceId,
            channelId,
            topicId,
            data: { commandId: command.commandId, body: command.body },
          });
          break;
        case "edit":
          await editMutation.mutateAsync({
            workspaceId,
            channelId,
            topicId,
            messageId: command.messageId,
            data: {
              commandId: command.commandId,
              expectedVersion: command.expectedVersion,
              body: command.body,
            },
          });
          break;
        case "delete":
          await deleteMutation.mutateAsync({
            workspaceId,
            channelId,
            topicId,
            messageId: command.messageId,
            params: {
              commandId: command.commandId,
              expectedVersion: String(command.expectedVersion),
            },
          });
          break;
      }
      conversationState.markCommandAccepted(command.commandId);
      return "accepted";
    } catch (error) {
      const reason = rejectionFor(error);
      if (reason === undefined) {
        conversationState.markCommandUncertain(command.commandId);
        return "uncertain";
      }
      conversationState.markCommandRejected(command.commandId, reason);
      return "rejected";
    }
  };

  const dismissRejected = (kind: OverlayMessageCommand["kind"], messageId?: string): void => {
    for (const command of overlay.commands) {
      if (
        command.phase === "rejected" &&
        command.kind === kind &&
        (messageId === undefined || ("messageId" in command && command.messageId === messageId))
      ) {
        conversationState.dismissCommand(command.commandId);
      }
    }
  };
  const handleCommandStorageError = (error: unknown): void => {
    if (!(error instanceof AccountConversationStorageUnavailableError)) throw error;
    showSnackbar("Browser storage is unavailable. Cove could not save this change.");
  };

  const add = async (body: string): Promise<void> => {
    dismissRejected("create");
    const commandId = globalThis.crypto.randomUUID();
    const command: OverlayMessageCommand = {
      kind: "create",
      commandId,
      body,
      author: currentIdentity,
      createdAt: new Date().toISOString(),
      phase: "pending",
    };
    scrollAfterMessageId.current = `optimistic-${commandId}`;
    try {
      conversationState.startCommand(scope, command);
    } catch (error) {
      scrollAfterMessageId.current = undefined;
      throw error;
    }
    if ((await send(command)) !== "accepted") {
      scrollAfterMessageId.current = undefined;
      throw new Error("Message command was not accepted.");
    }
  };

  const edit = (event: FormEvent<HTMLFormElement>, message: OverlayTopicMessage): void => {
    event.preventDefault();
    if (!conversationStorageAvailable) return;
    const form = new FormData(event.currentTarget);
    dismissRejected("edit", message.id);
    const command: OverlayMessageCommand = {
      kind: "edit",
      commandId: globalThis.crypto.randomUUID(),
      messageId: message.id,
      expectedVersion: message.version,
      body: requiredFormValue(form, "messageBody"),
      phase: "pending",
    };
    try {
      conversationState.startCommand(scope, command);
    } catch (error) {
      handleCommandStorageError(error);
      return;
    }
    void send(command);
  };

  const remove = (message: OverlayTopicMessage): void => {
    if (!conversationStorageAvailable) return;
    dismissRejected("delete", message.id);
    const command: OverlayMessageCommand = {
      kind: "delete",
      commandId: globalThis.crypto.randomUUID(),
      messageId: message.id,
      expectedVersion: message.version,
      phase: "pending",
    };
    try {
      conversationState.startCommand(scope, command);
    } catch (error) {
      handleCommandStorageError(error);
      return;
    }
    void send(command);
  };

  const retry = (command: OverlayMessageCommand): void => {
    if (!conversationStorageAvailable || !conversationState.ownsCommand(command.commandId)) return;
    if (!conversationState.markCommandRetried(command.commandId)) return;
    void send(command);
  };

  const dismiss = (commandId: string): void => {
    conversationState.dismissCommand(commandId);
  };

  const isMessageMutationPending = (messageId: string): boolean =>
    overlay.commands.some(
      (command) =>
        command.kind !== "create" &&
        command.messageId === messageId &&
        command.phase !== "rejected",
    );

  const isMessageEditSaving = (messageId: string): boolean =>
    overlay.commands.some(
      (command) =>
        command.kind === "edit" && command.messageId === messageId && command.phase === "pending",
    );

  const canRepairSynchronization = (commandId: string): boolean =>
    overlay.commands.some(
      (command) =>
        command.commandId === commandId &&
        command.phase === "syncing" &&
        command.acceptedAt !== undefined &&
        clock - Date.parse(command.acceptedAt) >= 30_000,
    );
  const canRetryCommand = (commandId: string): boolean =>
    conversationStorageAvailable && conversationState.ownsCommand(commandId);

  return {
    add,
    canRepairSynchronization,
    canRetryCommand,
    clearDraft: () => conversationState.clearDraft(scope),
    conversationStorageAvailable,
    deleteMutation,
    dismiss,
    edit,
    editMutation,
    isMessageEditSaving,
    isMessageMutationPending,
    overlay,
    draft:
      conversationSnapshot.drafts.find(
        (draft) =>
          draft.workspaceId === scope.workspaceId &&
          draft.channelId === scope.channelId &&
          draft.topicId === scope.topicId,
      )?.body ?? "",
    projectedMessages,
    remove,
    repairSynchronization: () => void repairZeroCache(),
    retry,
    setDraft: (draft: string) => conversationState.writeDraft(scope, draft),
    scrollAfterMessageId,
    zeroRecoveryState,
  };
}
