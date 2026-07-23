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
import { type FormEvent, type ReactElement, useState } from "react";
import {
  useTopicsAddMessage,
  useTopicsDeleteMessage,
  useTopicsEditMessage,
} from "../api/generated/cove-app.ts";
import { requiredFormValue } from "../form-data.ts";
import { topicMessageKind, topicMessageKindLabel } from "../topic-message-kind.ts";
import { LocalTimestamp } from "./local-timestamp.tsx";
import { useSnackbar } from "./snackbar.tsx";

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
  readonly messages: ReadonlyArray<TopicMessage>;
  readonly currentIdentityId: string;
  readonly refresh: () => Promise<void>;
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
  currentIdentityId,
  refresh,
  topicId,
  workspaceId,
}: TopicMessagesProps): ReactElement {
  const addMessage = useTopicsAddMessage();
  const editMessage = useTopicsEditMessage();
  const deleteMessage = useTopicsDeleteMessage();
  const { showSnackbar } = useSnackbar();
  const [editingId, setEditingId] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const deletingMessage = messages.find((message) => message.id === deletingId);
  const deletingMessageKind =
    deletingMessage === undefined ? undefined : topicMessageKind(deletingMessage.position);
  const mutationPending = addMessage.isPending || editMessage.isPending || deleteMessage.isPending;

  const add = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    addMessage.mutate(
      {
        workspaceId,
        channelId,
        topicId,
        data: { body: requiredFormValue(form, "messageBody") },
      },
      {
        onSuccess: async () => {
          formElement.reset();
          await refresh();
        },
      },
    );
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
        onSuccess: async () => {
          setEditingId(undefined);
          await refresh();
        },
      },
    );
  };

  const remove = (message: TopicMessage): void => {
    deleteMessage.mutate(
      { workspaceId, channelId, topicId, messageId: message.id },
      {
        onSuccess: async () => {
          setDeletingId(undefined);
          showSnackbar(`${topicMessageKindLabel(message.position)} deleted.`);
          await refresh();
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
          const isAuthor = message.author.id === currentIdentityId;
          const canChange = canReply && isAuthor && !message.deleted;
          const isEditing = editingId === message.id;

          return (
            <li key={message.id} className="message-row py-8">
              <article aria-labelledby={`message-${message.id}`}>
                <header className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img
                      className="size-10 rounded-full border border-border bg-muted object-cover"
                      src={message.author.avatarUrl}
                      alt=""
                    />
                    <div>
                      <h3 id={`message-${message.id}`} className="font-semibold">
                        {message.author.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        <LocalTimestamp mode="message" value={message.createdAt} />
                        {message.edited && !message.deleted ? (
                          <>
                            {" "}
                            <span aria-hidden="true">·</span> <span>Edited</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  {canChange && !isEditing ? (
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
                  <p className="mt-5 text-sm italic text-muted-foreground">{kindLabel} deleted</p>
                ) : isEditing ? (
                  <form className="mt-5" onSubmit={(event) => edit(event, message.id)}>
                    <label className="sr-only" htmlFor={`edit-message-${message.id}`}>
                      Edit {kind}
                    </label>
                    <textarea
                      id={`edit-message-${message.id}`}
                      name="messageBody"
                      defaultValue={message.body}
                      required
                      rows={5}
                      className="w-full resize-y rounded-lg border bg-background px-4 py-3 leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                    {editMessage.isError ? (
                      <p className="mt-2 text-sm text-destructive" role="alert">
                        Cove could not save this edit. Refresh and try again.
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2">
                      <Button type="submit" disabled={mutationPending}>
                        {editMessage.isPending ? "Saving…" : "Save edit"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={mutationPending}
                        onClick={() => setEditingId(undefined)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="mt-5 whitespace-pre-wrap text-base leading-7 text-foreground/90">
                    {message.body}
                  </p>
                )}
              </article>
            </li>
          );
        })}
      </ol>

      {canReply ? (
        <form className="border-t pt-8" onSubmit={add}>
          <label className="text-base font-semibold" htmlFor="newMessage">
            Write a reply
          </label>
          <textarea
            id="newMessage"
            name="messageBody"
            required
            rows={5}
            className="mt-3 w-full resize-y rounded-lg border bg-background px-4 py-3 leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Add context, evidence, or a response to this Topic."
          />
          {addMessage.isError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              Cove could not add this reply. Refresh and try again.
            </p>
          ) : null}
          <div className="mt-3 flex justify-end">
            <Button type="submit" size="lg" disabled={mutationPending}>
              {addMessage.isPending ? "Replying…" : "Reply"}
            </Button>
          </div>
        </form>
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
