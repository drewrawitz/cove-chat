export type MessageCommandPhase = "pending" | "syncing" | "uncertain" | "rejected";

export type MessageCommandRejection =
  | "channel_unavailable"
  | "topic_unavailable"
  | "message_unavailable"
  | "mutation_forbidden"
  | "stale_version"
  | "conflict";

interface OverlayAuthor {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl: string;
}

export interface OverlayTopicMessage {
  readonly id: string;
  readonly body?: string;
  readonly position: number;
  readonly version: number;
  readonly producedByCommandId?: string;
  readonly createdAt: string;
  readonly edited: boolean;
  readonly deleted: boolean;
  readonly author: OverlayAuthor;
  readonly optimisticPhase?: Exclude<MessageCommandPhase, "rejected">;
}

interface OverlayCommandBase {
  readonly commandId: string;
  readonly phase: MessageCommandPhase;
  readonly reason?: MessageCommandRejection;
}

export interface CreateReplyOverlayCommand extends OverlayCommandBase {
  readonly kind: "create";
  readonly body: string;
  readonly author: OverlayAuthor;
  readonly createdAt: string;
}

export interface EditMessageOverlayCommand extends OverlayCommandBase {
  readonly kind: "edit";
  readonly messageId: string;
  readonly expectedVersion: number;
  readonly body: string;
}

export interface DeleteMessageOverlayCommand extends OverlayCommandBase {
  readonly kind: "delete";
  readonly messageId: string;
  readonly expectedVersion: number;
}

export type OverlayMessageCommand =
  | CreateReplyOverlayCommand
  | EditMessageOverlayCommand
  | DeleteMessageOverlayCommand;

type StartedMessageCommand =
  | Omit<CreateReplyOverlayCommand, "phase" | "reason">
  | Omit<EditMessageOverlayCommand, "phase" | "reason">
  | Omit<DeleteMessageOverlayCommand, "phase" | "reason">;

export interface MessageCommandOverlay {
  readonly commands: ReadonlyArray<OverlayMessageCommand>;
  readonly reconciledCommandIds: ReadonlyArray<string>;
}

export const emptyMessageCommandOverlay: MessageCommandOverlay = {
  commands: [],
  reconciledCommandIds: [],
};

export type MessageCommandOverlayEvent =
  | { readonly type: "started"; readonly command: StartedMessageCommand }
  | { readonly type: "accepted"; readonly commandId: string }
  | { readonly type: "uncertain"; readonly commandId: string }
  | { readonly type: "retried"; readonly commandId: string }
  | { readonly type: "dismissed"; readonly commandId: string }
  | {
      readonly type: "rejected";
      readonly commandId: string;
      readonly reason: MessageCommandRejection;
    }
  | {
      readonly type: "synchronized";
      readonly messages: ReadonlyArray<OverlayTopicMessage>;
    };

function updateCommand(
  state: MessageCommandOverlay,
  commandId: string,
  update: (command: OverlayMessageCommand) => OverlayMessageCommand,
): MessageCommandOverlay {
  const index = state.commands.findIndex((command) => command.commandId === commandId);
  if (index === -1) return state;

  const current = state.commands[index];
  if (current === undefined) return state;
  const updated = update(current);
  if (updated === current) return state;
  return {
    ...state,
    commands: state.commands.map((command, commandIndex) =>
      commandIndex === index ? updated : command,
    ),
  };
}

export function messageCommandOverlay(
  state: MessageCommandOverlay,
  event: MessageCommandOverlayEvent,
): MessageCommandOverlay {
  switch (event.type) {
    case "started": {
      if (
        state.reconciledCommandIds.includes(event.command.commandId) ||
        state.commands.some(({ commandId }) => commandId === event.command.commandId)
      ) {
        return state;
      }
      return {
        ...state,
        commands: [...state.commands, { ...event.command, phase: "pending" }],
      };
    }
    case "accepted":
      return updateCommand(state, event.commandId, (command) =>
        command.phase === "syncing" ? command : { ...command, phase: "syncing" },
      );
    case "uncertain":
      return updateCommand(state, event.commandId, (command) => ({
        ...command,
        phase: "uncertain",
      }));
    case "retried":
      return updateCommand(state, event.commandId, (command) => ({
        ...command,
        phase: "pending",
        reason: undefined,
      }));
    case "dismissed": {
      if (!state.commands.some(({ commandId }) => commandId === event.commandId)) {
        return state;
      }
      return {
        ...state,
        commands: state.commands.filter(({ commandId }) => commandId !== event.commandId),
      };
    }
    case "rejected":
      return updateCommand(state, event.commandId, (command) => ({
        ...command,
        phase: "rejected",
        reason: event.reason,
      }));
    case "synchronized": {
      const synchronizedCommandIds = new Set(producedCommandIds(event.messages));
      if (!state.commands.some(({ commandId }) => synchronizedCommandIds.has(commandId))) {
        return state;
      }
      return {
        commands: state.commands.filter(({ commandId }) => !synchronizedCommandIds.has(commandId)),
        reconciledCommandIds: [
          ...new Set([...state.reconciledCommandIds, ...synchronizedCommandIds]),
        ],
      };
    }
  }
}

function optimisticMessage(
  message: OverlayTopicMessage,
  command: EditMessageOverlayCommand | DeleteMessageOverlayCommand,
): OverlayTopicMessage {
  if (command.phase === "rejected") return message;
  if (command.kind === "edit") {
    return {
      ...message,
      body: command.body,
      version: command.expectedVersion + 1,
      producedByCommandId: command.commandId,
      edited: true,
      deleted: false,
      optimisticPhase: command.phase,
    };
  }
  return {
    id: message.id,
    position: message.position,
    version: command.expectedVersion + 1,
    producedByCommandId: command.commandId,
    createdAt: message.createdAt,
    edited: message.edited,
    deleted: true,
    author: message.author,
    optimisticPhase: command.phase,
  };
}

function producedCommandIds(messages: ReadonlyArray<OverlayTopicMessage>): ReadonlyArray<string> {
  return messages.flatMap(({ producedByCommandId }) =>
    producedByCommandId === undefined ? [] : [producedByCommandId],
  );
}

export function overlayTopicMessages(
  messages: ReadonlyArray<OverlayTopicMessage>,
  overlay: MessageCommandOverlay,
): ReadonlyArray<OverlayTopicMessage> {
  const synchronizedCommandIds = new Set(producedCommandIds(messages));
  let projected = [...messages];
  let nextPosition = projected.reduce((highest, message) => Math.max(highest, message.position), 0);

  for (const command of overlay.commands) {
    if (command.phase === "rejected" || synchronizedCommandIds.has(command.commandId)) {
      continue;
    }
    if (command.kind === "create") {
      nextPosition += 1;
      projected.push({
        id: `optimistic-${command.commandId}`,
        body: command.body,
        position: nextPosition,
        version: 1,
        producedByCommandId: command.commandId,
        createdAt: command.createdAt,
        edited: false,
        deleted: false,
        author: command.author,
        optimisticPhase: command.phase,
      });
      continue;
    }
    projected = projected.map((message) =>
      message.id === command.messageId ? optimisticMessage(message, command) : message,
    );
  }

  return projected;
}
