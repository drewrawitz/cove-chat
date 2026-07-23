import { Button } from "@cove/ui/components/button";
import { type FormEvent, type ReactElement, useEffect, useRef } from "react";
import { handleComposerKeyboardShortcut } from "./composer-keyboard-shortcuts.ts";

interface TopicMessageEditorProps {
  readonly authorAvatarUrl: string;
  readonly defaultBody?: string;
  readonly editorId: string;
  readonly editorLabel: string;
  readonly hasError: boolean;
  readonly isDisabled: boolean;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function TopicMessageEditor({
  authorAvatarUrl,
  defaultBody,
  editorId,
  editorLabel,
  hasError,
  isDisabled,
  isSaving,
  onCancel,
  onSubmit,
}: TopicMessageEditorProps): ReactElement {
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const editor = textarea.current;
    if (editor === null) {
      return;
    }

    editor.focus();
    const end = editor.value.length;
    editor.setSelectionRange(end, end);
  }, []);

  return (
    <div className="flex items-start gap-4 sm:gap-5">
      <img
        className="size-11 shrink-0 rounded-full border border-border bg-muted object-cover"
        src={authorAvatarUrl}
        alt=""
      />
      <form
        className="min-w-0 flex-1 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors focus-within:border-ring sm:p-6"
        onKeyDown={(event) =>
          handleComposerKeyboardShortcut(event, {
            isDisabled,
            onCancel,
            onSubmit: () => event.currentTarget.requestSubmit(),
          })
        }
        onSubmit={onSubmit}
      >
        <label className="sr-only" htmlFor={editorId}>
          {editorLabel}
        </label>
        <textarea
          ref={textarea}
          id={editorId}
          name="messageBody"
          defaultValue={defaultBody}
          required
          rows={4}
          className="min-h-24 w-full resize-y bg-transparent text-base leading-7 outline-none"
          aria-keyshortcuts="Meta+Enter Control+Enter Escape"
        />
        {hasError ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            Cove could not save this edit. Refresh and try again.
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={isDisabled}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={isDisabled}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
