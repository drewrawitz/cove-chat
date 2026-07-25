import { Button } from "@cove/ui/components/button";
import {
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@cove/ui/components/dialog";
import type { ReactElement } from "react";

interface TopicMessageDeleteDialogProps {
  readonly isError: boolean;
  readonly isPending: boolean;
  readonly kind: string;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function TopicMessageDeleteDialog({
  isError,
  isPending,
  kind,
  onClose,
  onConfirm,
}: TopicMessageDeleteDialogProps): ReactElement {
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onClose();
        }
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="max-w-md p-6 sm:p-7">
          <DialogTitle>Delete {kind}?</DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            This removes the text but keeps its place in the Topic.
          </DialogDescription>
          {isError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              Cove could not delete this {kind}. Refresh and try again.
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={isPending} onClick={onConfirm}>
              {isPending ? "Deleting…" : `Delete ${kind}`}
            </Button>
          </div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
