import { Button } from "@cove/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement } from "react";
import { CoveApiError } from "../api/cove-fetch.ts";
import { useAuthLogout } from "../api/generated/cove-app.ts";

interface AccountSignOutProps {
  readonly displayName: string;
  readonly email: string;
  readonly variant: "menu" | "page";
}

export function AccountSignOut({ displayName, email, variant }: AccountSignOutProps): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthLogout();

  const finishSignOut = async (): Promise<void> => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await navigate({ to: "/", replace: true });
  };

  const signOut = (): void => {
    logout.mutate(undefined, {
      onSuccess: finishSignOut,
      onError: (error) =>
        error instanceof CoveApiError && error.status === 401 ? finishSignOut() : undefined,
    });
  };

  return (
    <section
      aria-label="Account"
      className={
        variant === "menu"
          ? "border-t border-border p-3"
          : "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border bg-card px-4 py-3 shadow-sm"
      }
    >
      <div className={variant === "menu" ? "px-1" : "min-w-0"}>
        <p className="truncate text-sm font-semibold">{displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <Button
        className={variant === "menu" ? "mt-2 w-full justify-start px-1" : undefined}
        variant="ghost"
        size="sm"
        type="button"
        disabled={logout.isPending}
        onClick={signOut}
      >
        {logout.isPending ? "Signing out…" : "Sign out of Cove"}
      </Button>
      {logout.isError && !(logout.error instanceof CoveApiError && logout.error.status === 401) ? (
        <p
          className={
            variant === "menu"
              ? "mt-2 px-1 text-xs text-destructive"
              : "w-full text-xs text-destructive"
          }
          role="alert"
        >
          Cove could not sign you out. Refresh the page and try again.
        </p>
      ) : null}
    </section>
  );
}
