import { Button, buttonVariants } from "@cove/ui/components/button";
import {
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@cove/ui/components/dialog";
import {
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuTrigger,
} from "@cove/ui/components/menu";
import { type FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import {
  useTopicsAddMessage,
  useTopicsDeleteMessage,
  useTopicsEditMessage,
} from "../api/generated/cove-app.ts";
import { requiredFormValue } from "../form-data.ts";
import { topicMessageKind, topicMessageKindLabel } from "../topic-message-kind.ts";
import { LocalTimestamp } from "./local-timestamp.tsx";
import { useSnackbar } from "./snackbar.tsx";
import { TopicMessageEditor } from "./topic-message-editor.tsx";
import { TopicReplyComposer } from "./topic-reply-composer.tsx";

interface TopicMessage {
  readonly id: string;
  readonly body?: string;
  readonly position: number;
  readonly createdAt: string;
  readonly edited: boolean;
  readonly deleted: boolean;
  readonly author: {
    readonly id: string;
    readonly name: string;
    readonly avatarUrl: string;
  };
}

interface TopicMessagesProps {
  readonly canReply: boolean;
  readonly channelId: string;
  readonly currentIdentity: {
    readonly avatarUrl: string;
    readonly id: string;
    readonly name: string;
  };
  readonly messages: ReadonlyArray<TopicMessage>;
  readonly topicId: string;
  readonly workspaceId: string;
}

const messageExcerpt = (body: string | undefined): string => {
  const normalized = body?.replaceAll(/\s+/g, " ").trim() ?? "";
  return normalized.length > 60 ? `${normalized.slice(0, 59)}…` : normalized;
};

export function TopicMessages({
  canReply,
  channelId,
  messages,
  currentIdentity,
  topicId,
  workspaceId,
}: TopicMessagesProps): ReactElement {
  const addMessage = useTopicsAddMessage();
  const editMessage = useTopicsEditMessage();
  const deleteMessage = useTopicsDeleteMessage();
  const { showSnackbar } = useSnackbar();
  const initiallyPositionedTopicId = useRef<string | undefined>(undefined);
  const scrollAfterMessageId = useRef<string | undefined>(undefined);
  const [editingId, setEditingId] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const deletingMessage = messages.find((message) => message.id === deletingId);
  const deletingMessageKind =
    deletingMessage === undefined ? undefined : topicMessageKind(deletingMessage.position);
  const mutationPending = addMessage.isPending || editMessage.isPending || deleteMessage.isPending;

  useEffect(() => {
    if (initiallyPositionedTopicId.current === topicId) return;

    const frame = window.requestAnimationFrame(() => {
      initiallyPositionedTopicId.current = topicId;
      window.scrollTo({
        top: messages.length > 1 ? document.documentElement.scrollHeight : 0,
        behavior: "auto",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, topicId]);

  useEffect(() => {
    const messageId = scrollAfterMessageId.current;
    if (messageId === undefined) {
      return;
    }

    const messageElement = document.getElementById(`topic-message-${messageId}`);
    if (messageElement === null) {
      return;
    }

    scrollAfterMessageId.current = undefined;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    messageElement.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [messages]);

  const add = async (body: string): Promise<void> => {
    try {
      const createdMessage = await addMessage.mutateAsync({
        workspaceId,
        channelId,
        topicId,
        data: { body },
      });
      scrollAfterMessageId.current = createdMessage.id;
    } catch (error) {
      scrollAfterMessageId.current = undefined;
      throw error;
    }
  };

  const edit = (event: FormEvent<HTMLFormElement>, messageId: string): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    editMessage.mutate(
      {
        workspaceId,
        channelId,
        topicId,
        messageId,
        data: { body: requiredFormValue(form, "messageBody") },
      },
      {
        onSuccess: () => {
          setEditingId(undefined);
        },
      },
    );
  };

  const remove = (message: TopicMessage): void => {
    deleteMessage.mutate(
      { workspaceId, channelId, topicId, messageId: message.id },
      {
        onSuccess: () => {
          setDeletingId(undefined);
          showSnackbar(`${topicMessageKindLabel(message.position)} deleted.`);
        },
      },
    );
  };

  return (
    <>
      <ol className="divide-y" aria-label="Topic messages">
        {messages.map((message) => {
          const kind = topicMessageKind(message.position);
          const kindLabel = topicMessageKindLabel(message.position);
          const actionKind = kind === "reply" ? `${kind} ${message.position - 1}` : kind;
          const excerpt = messageExcerpt(message.body);
          const isAuthor = message.author.id === currentIdentity.id;
          const canChange = canReply && isAuthor && !message.deleted;
          const isEditing = editingId === message.id;

          return (
            <li key={message.id} id={`topic-message-${message.id}`} className="message-row py-5">
              <article
                aria-label={isEditing ? `Edit ${kind} by ${message.author.name}` : undefined}
                aria-labelledby={isEditing ? undefined : `message-${message.id}`}
              >
                {isEditing ? (
                  <TopicMessageEditor
                    authorAvatarUrl={message.author.avatarUrl}
                    defaultBody={message.body}
                    editorId={`edit-message-${message.id}`}
                    editorLabel={`Edit ${kind}`}
                    hasError={editMessage.isError}
                    isDisabled={mutationPending}
                    isSaving={editMessage.isPending}
                    onCancel={() => setEditingId(undefined)}
                    onSubmit={(event) => edit(event, message.id)}
                  />
                ) : (
                  <div className="flex items-start gap-3">
                    <img
                      className="size-10 shrink-0 rounded-full border border-border bg-muted object-cover"
                      src={message.author.avatarUrl}
                      alt=""
                    />
                    <div className="min-w-0 flex-1">
                      <header className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                          <h3
                            id={`message-${message.id}`}
                            className="truncate font-semibold leading-5"
                          >
                            {message.author.name}
                          </h3>
                          <p className="shrink-0 text-sm leading-5 text-muted-foreground">
                            <LocalTimestamp mode="message" value={message.createdAt} />
                            {message.edited && !message.deleted ? (
                              <>
                                {" "}
                                <span aria-hidden="true">·</span> <span>Edited</span>
                              </>
                            ) : null}
                          </p>
                        </div>

                        {canChange ? (
                          <MenuRoot>
                            <MenuTrigger
                              className={buttonVariants({
                                variant: "ghost",
                                size: "icon-sm",
                                className: "message-actions",
                              })}
                              aria-label={`More actions for ${actionKind} by ${message.author.name}: ${excerpt}`}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                                className="size-4"
                              >
                                <circle cx="5" cy="12" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="19" cy="12" r="1.5" />
                              </svg>
                            </MenuTrigger>
                            <MenuPortal>
                              <MenuPositioner side="bottom" align="end">
                                <MenuPopup>
                                  <MenuItem
                                    onClick={() => {
                                      editMessage.reset();
                                      setEditingId(message.id);
                                    }}
                                  >
                                    Edit {kind}
                                  </MenuItem>
                                  <MenuItem
                                    className="text-destructive data-highlighted:text-destructive"
                                    onClick={() => {
                                      deleteMessage.reset();
                                      setDeletingId(message.id);
                                    }}
                                  >
                                    Delete {kind}
                                  </MenuItem>
                                </MenuPopup>
                              </MenuPositioner>
                            </MenuPortal>
                          </MenuRoot>
                        ) : null}
                      </header>

                      {message.deleted ? (
                        <p className="mt-1 text-sm leading-6 italic text-muted-foreground">
                          {kindLabel} deleted
                        </p>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-base leading-6 text-foreground/90">
                          {message.body}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>

      {canReply ? (
        <>
          <div className="h-24" aria-hidden="true" />
          <TopicReplyComposer
            identity={currentIdentity}
            hasError={addMessage.isError}
            isPending={mutationPending}
            onPost={add}
          />
        </>
      ) : null}

      {deletingMessage === undefined ? null : (
        <DialogRoot
          open
          onOpenChange={(open) => {
            if (!open && !deleteMessage.isPending) {
              setDeletingId(undefined);
            }
          }}
        >
          <DialogPortal>
            <DialogBackdrop />
            <DialogPopup className="max-w-md p-6 sm:p-7">
              <DialogTitle>Delete {deletingMessageKind}?</DialogTitle>
              <DialogDescription className="mt-2 leading-6">
                This removes the text but keeps its place in the Topic.
              </DialogDescription>
              {deleteMessage.isError ? (
                <p className="mt-4 text-sm text-destructive" role="alert">
                  Cove could not delete this {deletingMessageKind}. Refresh and try again.
                </p>
              ) : null}
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={deleteMessage.isPending}
                  onClick={() => setDeletingId(undefined)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteMessage.isPending}
                  onClick={() => remove(deletingMessage)}
                >
                  {deleteMessage.isPending ? "Deleting…" : `Delete ${deletingMessageKind}`}
                </Button>
              </div>
            </DialogPopup>
          </DialogPortal>
        </DialogRoot>
      )}
    </>
  );
}
