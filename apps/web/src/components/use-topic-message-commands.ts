import { type FormEvent, useEffect, useMemo, useReducer, useRef } from "react";
import {
  useTopicsAddMessage,
  useTopicsDeleteMessage,
  useTopicsEditMessage,
} from "../api/generated/cove-app.ts";
import { CoveApiError } from "../api/cove-fetch.ts";
import { requiredFormValue } from "../form-data.ts";
import {
  emptyMessageCommandOverlay,
  messageCommandOverlay,
  overlayTopicMessages,
  type MessageCommandRejection,
  type OverlayMessageCommand,
  type OverlayTopicMessage,
} from "../message-command-overlay.ts";

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
  const [overlay, dispatchOverlay] = useReducer(messageCommandOverlay, emptyMessageCommandOverlay);
  const projectedMessages = useMemo(
    () => overlayTopicMessages(messages, overlay),
    [messages, overlay],
  );

  useEffect(() => {
    dispatchOverlay({ type: "synchronized", messages });
  }, [messages]);

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
      dispatchOverlay({ type: "accepted", commandId: command.commandId });
      return "accepted";
    } catch (error) {
      const reason = rejectionFor(error);
      if (reason === undefined) {
        dispatchOverlay({ type: "uncertain", commandId: command.commandId });
        return "uncertain";
      }
      dispatchOverlay({ type: "rejected", commandId: command.commandId, reason });
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
        dispatchOverlay({ type: "dismissed", commandId: command.commandId });
      }
    }
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
    dispatchOverlay({ type: "started", command });
    if ((await send(command)) === "rejected") {
      scrollAfterMessageId.current = undefined;
      throw new Error("Message command was rejected.");
    }
  };

  const edit = (event: FormEvent<HTMLFormElement>, message: OverlayTopicMessage): void => {
    event.preventDefault();
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
    dispatchOverlay({ type: "started", command });
    void send(command);
  };

  const remove = (message: OverlayTopicMessage): void => {
    dismissRejected("delete", message.id);
    const command: OverlayMessageCommand = {
      kind: "delete",
      commandId: globalThis.crypto.randomUUID(),
      messageId: message.id,
      expectedVersion: message.version,
      phase: "pending",
    };
    dispatchOverlay({ type: "started", command });
    void send(command);
  };

  const retry = (command: OverlayMessageCommand): void => {
    dispatchOverlay({ type: "retried", commandId: command.commandId });
    void send(command);
  };

  const dismiss = (commandId: string): void => {
    dispatchOverlay({ type: "dismissed", commandId });
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

  return {
    add,
    deleteMutation,
    dismiss,
    edit,
    editMutation,
    isMessageEditSaving,
    isMessageMutationPending,
    overlay,
    projectedMessages,
    remove,
    retry,
    scrollAfterMessageId,
  };
}
