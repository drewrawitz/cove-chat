import { Button } from "@cove/ui/components/button";
import {
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@cove/ui/components/dialog";
import { type FormEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { handleComposerKeyboardShortcut } from "./composer-keyboard-shortcuts.ts";

interface ReplyIdentity {
  readonly avatarUrl: string;
  readonly name: string;
}

interface TopicReplyComposerProps {
  readonly hasError?: boolean;
  readonly identity: ReplyIdentity;
  readonly isPending?: boolean;
  readonly onPost: (body: string) => Promise<void>;
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.closest("[contenteditable='true']") !== null ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
};

export function TopicReplyComposer({
  hasError = false,
  identity,
  isPending = false,
  onPost,
}: TopicReplyComposerProps): ReactElement {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBusy = isPending || isSubmitting;
  const hasDraft = draft.trim().length > 0;

  useEffect(() => {
    if (isExpanded) {
      textarea.current?.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    const expandFromKeyboard = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== "r" ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      setIsExpanded(true);
    };

    window.addEventListener("keydown", expandFromKeyboard);
    return () => window.removeEventListener("keydown", expandFromKeyboard);
  }, []);

  const discard = (): void => {
    setDraft("");
    setDiscardDialogOpen(false);
    setIsExpanded(false);
  };

  const requestDiscard = (): void => {
    if (hasDraft) {
      setDiscardDialogOpen(true);
      return;
    }

    discard();
  };

  const post = async (): Promise<void> => {
    const body = draft.trim();
    if (body.length === 0 || isBusy) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onPost(body);
      setDraft("");
      setIsExpanded(false);
    } catch {
      return;
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void post();
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-1rem_3rem_-2rem_rgba(0,0,0,0.9)] backdrop-blur sm:px-8 lg:left-[var(--conversation-sidebar-width)] lg:px-12">
        <div className="mx-auto w-full max-w-4xl">
          {isExpanded ? (
            <form
              className="rounded-2xl border border-border bg-card p-4 shadow-2xl transition-colors focus-within:border-ring sm:p-6"
              onKeyDown={(event) =>
                handleComposerKeyboardShortcut(event, {
                  isDisabled: isBusy,
                  onCancel: requestDiscard,
                  onSubmit: () => void post(),
                })
              }
              onSubmit={submit}
            >
              <label className="sr-only" htmlFor="newMessage">
                Write a reply
              </label>
              <textarea
                ref={textarea}
                id="newMessage"
                name="messageBody"
                required
                rows={10}
                value={draft}
                className="min-h-[clamp(10rem,30dvh,20rem)] w-full resize-y bg-transparent text-base leading-7 outline-none placeholder:text-muted-foreground"
                placeholder="Write a reply…"
                aria-keyshortcuts="Meta+Enter Control+Enter Escape"
                onChange={(event) => setDraft(event.currentTarget.value)}
              />
              {hasError ? (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  Cove could not add this reply. Refresh and try again.
                </p>
              ) : null}
              <div className="mt-4 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  disabled={isBusy}
                  onClick={requestDiscard}
                >
                  Discard
                </Button>
                <Button type="submit" size="lg" disabled={isBusy || !hasDraft}>
                  {isBusy ? "Posting…" : "Post"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <img
                className="size-11 shrink-0 rounded-full border border-border bg-muted object-cover"
                src={identity.avatarUrl}
                alt=""
              />
              <button
                type="button"
                className="flex h-12 flex-1 cursor-text items-center rounded-full bg-muted px-5 text-left text-base text-muted-foreground transition-colors outline-none hover:bg-muted/80 focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-keyshortcuts="R"
                onClick={() => setIsExpanded(true)}
              >
                Reply
                <span className="sr-only"> (keyboard shortcut: R)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <DialogRoot open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup className="max-w-md p-6 sm:p-7">
            <DialogTitle>Discard reply?</DialogTitle>
            <DialogDescription className="mt-2 leading-6">
              Your reply has not been posted. If you discard it, the text will be lost.
            </DialogDescription>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setDiscardDialogOpen(false)}
              >
                Keep writing
              </Button>
              <Button type="button" variant="destructive" size="lg" onClick={discard}>
                Discard reply
              </Button>
            </div>
          </DialogPopup>
        </DialogPortal>
      </DialogRoot>
    </>
  );
}
