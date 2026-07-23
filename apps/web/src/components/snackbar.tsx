import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@cove/ui/components/button";

interface SnackbarContextValue {
  readonly showSnackbar: (message: string) => void;
}

interface Snackbar {
  readonly id: number;
  readonly message: string;
}

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined);

export function SnackbarProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const nextId = useRef(0);
  const [snackbar, setSnackbar] = useState<Snackbar>();

  const showSnackbar = useCallback((message: string): void => {
    nextId.current += 1;
    setSnackbar({ id: nextId.current, message });
  }, []);
  const contextValue = useMemo(() => ({ showSnackbar }), [showSnackbar]);

  useEffect(() => {
    if (snackbar === undefined) {
      return;
    }

    const timeout = window.setTimeout(() => setSnackbar(undefined), 5_000);
    return () => window.clearTimeout(timeout);
  }, [snackbar]);

  return (
    <SnackbarContext value={contextValue}>
      {children}
      {snackbar === undefined ? null : (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-70 flex justify-center px-4 sm:justify-end">
          <div
            key={snackbar.id}
            className="pointer-events-auto flex max-w-md items-center gap-4 rounded-xl border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-2xl"
            role="status"
          >
            <p className="flex-1">{snackbar.message}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss notification"
              onClick={() => setSnackbar(undefined)}
            >
              <span aria-hidden="true">×</span>
            </Button>
          </div>
        </div>
      )}
    </SnackbarContext>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const context = useContext(SnackbarContext);
  if (context === undefined) {
    throw new Error("useSnackbar must be used within a SnackbarProvider");
  }
  return context;
}
