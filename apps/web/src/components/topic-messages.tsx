import { Button, buttonVariants } from "@cove/ui/components/button";
import {
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuTrigger,
} from "@cove/ui/components/menu";
import { Fragment, type ReactElement, type RefObject, useEffect, useRef, useState } from "react";
import type { StoredMessageCommand } from "../account-conversation-state.ts";
import {
  type DeleteMessageOverlayCommand,
  type EditMessageOverlayCommand,
  type OverlayMessageCommand,
  type OverlayTopicMessage,
} from "../message-command-overlay.ts";
import { topicMessageKind, topicMessageKindLabel } from "../topic-message-kind.ts";
import { LocalTimestamp } from "./local-timestamp.tsx";
import { TopicMessageDeleteDialog } from "./topic-message-delete-dialog.tsx";
import { TopicMessageEditor } from "./topic-message-editor.tsx";
import { TopicReplyComposer } from "./topic-reply-composer.tsx";
import { useTopicMessageCommands } from "./use-topic-message-commands.ts";

type TopicMessage = OverlayTopicMessage;

export interface OlderRepliesPagination {
  readonly hasError: boolean;
  readonly isLoading: boolean;
  readonly load?: () => void;
  readonly remainingCount: number;
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
  readonly olderRepliesPagination?: OlderRepliesPagination;
  readonly topicId: string;
  readonly workspaceId: string;
}

const hiddenOlderRepliesPagination: OlderRepliesPagination = {
  hasError: false,
  isLoading: false,
  remainingCount: 0,
};

function OlderRepliesControl({
  hasError,
  isLoading,
  load,
  remainingCount,
}: OlderRepliesPagination): ReactElement | null {
  if (remainingCount === 0) return null;

  return (
    <li className="py-6 text-center">
      <p className="text-sm text-muted-foreground">
        {remainingCount} older {remainingCount === 1 ? "Reply remains." : "Replies remain."}
      </p>
      <Button
        className="mt-3"
        type="button"
        variant="secondary"
        disabled={isLoading || load === undefined}
        onClick={load}
      >
        {isLoading ? "Loading older Replies…" : "Load older Replies"}
      </Button>
      {hasError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          Cove could not load older Replies. Try again.
        </p>
      ) : null}
    </li>
  );
}

const messageExcerpt = (body: string | undefined): string => {
  const normalized = body?.replaceAll(/\s+/g, " ").trim() ?? "";
  return normalized.length > 60 ? `${normalized.slice(0, 59)}…` : normalized;
};

const optimisticPhaseLabel = (command: OverlayMessageCommand): string => {
  switch (command.phase) {
    case "pending":
      return "Pending…";
    case "syncing":
      return "Syncing…";
    case "uncertain":
      return "Delivery uncertain.";
    case "rejected":
      return "Rejected.";
  }
};

function RejectedEditNotice({ onReview }: { readonly onReview: () => void }): ReactElement {
  return (
    <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
      <span role="alert">This edit was rejected. Your text is still available.</span>
      <Button type="button" variant="secondary" size="sm" onClick={onReview}>
        Review edit
      </Button>
    </div>
  );
}

function RejectedDeleteNotice({
  command,
  kind,
  onDismiss,
}: {
  readonly command: DeleteMessageOverlayCommand;
  readonly kind: string;
  readonly onDismiss: (commandId: string) => void;
}): ReactElement {
  return (
    <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
      <span role="alert">This deletion was rejected. The {kind} was restored.</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label="Dismiss deletion error"
        onClick={() => onDismiss(command.commandId)}
      >
        Dismiss
      </Button>
    </div>
  );
}

function useInitialTopicPosition(topicId: string, messageCount: number): void {
  const positionedTopicId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (positionedTopicId.current === topicId) return;
    const frame = window.requestAnimationFrame(() => {
      positionedTopicId.current = topicId;
      window.scrollTo({
        top: messageCount > 1 ? document.documentElement.scrollHeight : 0,
        behavior: "auto",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messageCount, topicId]);
}

function usePostedMessageScroll(
  projectedMessages: ReadonlyArray<TopicMessage>,
  scrollAfterMessageId: RefObject<string | undefined>,
): void {
  useEffect(() => {
    const messageId = scrollAfterMessageId.current;
    if (messageId === undefined) return;
    const messageElement = document.getElementById(`topic-message-${messageId}`);
    if (messageElement === null) return;

    scrollAfterMessageId.current = undefined;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    messageElement.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
  }, [projectedMessages, scrollAfterMessageId]);
}

export function TopicMessages({
  canReply,
  channelId,
  messages,
  currentIdentity,
  olderRepliesPagination = hiddenOlderRepliesPagination,
  topicId,
  workspaceId,
}: TopicMessagesProps): ReactElement {
  const {
    add,
    canRepairSynchronization,
    canRetryCommand,
    clearDraft,
    conversationStorageAvailable,
    deleteMutation,
    dismiss,
    draft,
    edit,
    editMutation,
    isMessageEditSaving,
    isMessageMutationPending,
    overlay,
    projectedMessages,
    remove,
    repairSynchronization,
    retry,
    setDraft,
    scrollAfterMessageId,
    zeroRecoveryState,
  } = useTopicMessageCommands({
    channelId,
    currentIdentity,
    messages,
    topicId,
    workspaceId,
  });
  const [editing, setEditing] = useState<{
    readonly messageId: string;
    readonly defaultBody?: string;
  }>();
  const [deletingId, setDeletingId] = useState<string>();
  const deletingMessage = projectedMessages.find((message) => message.id === deletingId);
  const deletingMessageKind =
    deletingMessage === undefined ? undefined : topicMessageKind(deletingMessage.position);
  const olderRepliesControl = <OlderRepliesControl {...olderRepliesPagination} />;
  useInitialTopicPosition(topicId, projectedMessages.length);
  usePostedMessageScroll(projectedMessages, scrollAfterMessageId);

  return (
    <>
      <ol className="divide-y" aria-label="Topic messages">
        {projectedMessages.map((message, index) => {
          const kind = topicMessageKind(message.position);
          const kindLabel = topicMessageKindLabel(message.position);
          const actionKind = kind === "reply" ? `${kind} ${message.position - 1}` : kind;
          const excerpt = messageExcerpt(message.body);
          const isAuthor = message.author.id === currentIdentity.id;
          const canChange =
            canReply &&
            conversationStorageAvailable &&
            isAuthor &&
            !message.deleted &&
            message.optimisticPhase === undefined;
          const isEditing = editing?.messageId === message.id;
          const optimisticCommand =
            message.producedByCommandId === undefined
              ? undefined
              : overlay.commands.find(
                  ({ commandId, phase }) =>
                    commandId === message.producedByCommandId && phase !== "rejected",
                );
          const rejectedEdit = overlay.commands.find(
            (command): command is StoredMessageCommand & EditMessageOverlayCommand =>
              command.kind === "edit" &&
              command.messageId === message.id &&
              command.phase === "rejected",
          );
          const rejectedDelete = overlay.commands.find(
            (command): command is StoredMessageCommand & DeleteMessageOverlayCommand =>
              command.kind === "delete" &&
              command.messageId === message.id &&
              command.phase === "rejected",
          );

          return (
            <Fragment key={message.id}>
              {index === 1 ? olderRepliesControl : null}
              <li id={`topic-message-${message.id}`} className="message-row py-5">
                <article
                  aria-label={isEditing ? `Edit ${kind} by ${message.author.name}` : undefined}
                  aria-labelledby={isEditing ? undefined : `message-${message.id}`}
                >
                  {isEditing ? (
                    <TopicMessageEditor
                      authorAvatarUrl={message.author.avatarUrl}
                      defaultBody={editing.defaultBody ?? message.body}
                      editorId={`edit-message-${message.id}`}
                      editorLabel={`Edit ${kind}`}
                      hasError={rejectedEdit !== undefined}
                      isDisabled={isMessageMutationPending(message.id)}
                      isSaving={isMessageEditSaving(message.id)}
                      onCancel={() => setEditing(undefined)}
                      onSubmit={(event) => {
                        edit(event, message);
                        setEditing(undefined);
                      }}
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
                                        editMutation.reset();
                                        setEditing({ messageId: message.id });
                                      }}
                                    >
                                      Edit {kind}
                                    </MenuItem>
                                    <MenuItem
                                      className="text-destructive data-highlighted:text-destructive"
                                      onClick={() => {
                                        deleteMutation.reset();
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

                        {optimisticCommand === undefined ? null : (
                          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                            <span role="status">{optimisticPhaseLabel(optimisticCommand)}</span>
                            {optimisticCommand.phase === "uncertain" &&
                            canRetryCommand(optimisticCommand.commandId) ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => retry(optimisticCommand)}
                              >
                                Retry
                              </Button>
                            ) : null}
                            {canRepairSynchronization(optimisticCommand.commandId) ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={zeroRecoveryState === "repairing"}
                                onClick={repairSynchronization}
                              >
                                Repair synchronization
                              </Button>
                            ) : null}
                          </div>
                        )}

                        {message.deleted ? (
                          <p className="mt-1 text-sm leading-6 italic text-muted-foreground">
                            {kindLabel} deleted
                          </p>
                        ) : (
                          <p className="mt-1 whitespace-pre-wrap text-base leading-6 text-foreground/90">
                            {message.body}
                          </p>
                        )}
                        {rejectedEdit === undefined ? null : (
                          <RejectedEditNotice
                            onReview={() =>
                              setEditing({
                                messageId: message.id,
                                defaultBody: rejectedEdit.body,
                              })
                            }
                          />
                        )}
                        {rejectedDelete === undefined ? null : (
                          <RejectedDeleteNotice
                            command={rejectedDelete}
                            kind={kind}
                            onDismiss={dismiss}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </article>
              </li>
            </Fragment>
          );
        })}
        {projectedMessages.length === 1 ? olderRepliesControl : null}
      </ol>

      {canReply ? (
        <>
          {conversationStorageAvailable ? null : (
            <p
              className="fixed right-5 bottom-24 left-5 z-40 mx-auto max-w-4xl rounded-xl border border-destructive/40 bg-background px-4 py-3 text-sm text-destructive shadow-lg lg:left-[calc(var(--conversation-sidebar-width)+1.25rem)]"
              role="alert"
            >
              Browser storage is unavailable. Cove cannot safely save or send conversation work.
            </p>
          )}
          <div className="h-24" aria-hidden="true" />
          <TopicReplyComposer
            canPost={conversationStorageAvailable}
            draft={draft}
            identity={currentIdentity}
            hasError={overlay.commands.some(
              ({ kind, phase }) => kind === "create" && phase === "rejected",
            )}
            onDraftChange={setDraft}
            onPost={async (body) => {
              await add(body);
              clearDraft();
            }}
          />
        </>
      ) : null}

      {deletingMessage === undefined ? null : (
        <TopicMessageDeleteDialog
          kind={deletingMessageKind ?? "message"}
          onClose={() => setDeletingId(undefined)}
          onConfirm={() => {
            remove(deletingMessage);
            setDeletingId(undefined);
          }}
        />
      )}
    </>
  );
}
