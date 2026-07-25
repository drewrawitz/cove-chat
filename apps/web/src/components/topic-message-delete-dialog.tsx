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
  readonly kind: string;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function TopicMessageDeleteDialog({
  kind,
  onClose,
  onConfirm,
}: TopicMessageDeleteDialogProps): ReactElement {
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) {
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
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirm}>
              Delete {kind}
            </Button>
          </div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
