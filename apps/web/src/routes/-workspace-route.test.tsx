import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { expect, test, vi } from "vite-plus/test";

const routeHarness = vi.hoisted(() => ({
  authMeOptions: undefined as unknown,
  component: undefined as (() => ReactElement) | undefined,
}));

vi.mock("@tanstack/react-router", async () => {
  const { useAccountConversationRuntime } =
    await import("../account-conversation-state-context.tsx");
  return {
    createFileRoute:
      () =>
      (options: { readonly component: () => ReactElement }): object => {
        routeHarness.component = options.component;
        return {};
      },
    Outlet: () => {
      useAccountConversationRuntime();
      return <p>Rendered workspace child route</p>;
    },
  };
});

vi.mock("../api/generated/cove-app.ts", () => ({
  useAuthLogin: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useAuthMe: (options: unknown) => {
    routeHarness.authMeOptions = options;
    return {
      data: undefined,
      error: { status: 401 },
      isError: true,
      isPending: false,
    };
  },
}));

test("shows sign-in without rendering Account-only workspace routes when logged out", async () => {
  await import("./workspaces.$workspaceId.tsx");

  const WorkspaceRoute = routeHarness.component;
  if (WorkspaceRoute === undefined) {
    throw new Error("Workspace route component was not registered");
  }

  const markup = renderToStaticMarkup(<WorkspaceRoute />);

  expect(routeHarness.authMeOptions).toEqual({
    query: { retry: false, retryOnMount: false },
  });
  expect(markup).toContain("Sign in with a one-time link.");
  expect(markup).not.toContain("Rendered workspace child route");
});
