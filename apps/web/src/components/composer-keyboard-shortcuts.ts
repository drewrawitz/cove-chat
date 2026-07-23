import type { KeyboardEvent as ReactKeyboardEvent } from "react";

interface ComposerKeyboardShortcutActions {
  readonly isDisabled: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: () => void;
}

export const handleComposerKeyboardShortcut = <Element extends HTMLElement>(
  event: ReactKeyboardEvent<Element>,
  { isDisabled, onCancel, onSubmit }: ComposerKeyboardShortcutActions,
): void => {
  if (event.nativeEvent.isComposing) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    if (!isDisabled) {
      onCancel();
    }
    return;
  }

  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    if (!isDisabled) {
      onSubmit();
    }
  }
};
