import { CoveAppApi } from "@cove/protocol";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";

const appClient = Effect.runPromise(
  HttpApiClient.make(CoveAppApi).pipe(Effect.provide(FetchHttpClient.layer)),
);

export async function getCurrentAccount() {
  const client = await appClient;
  return Effect.runPromise(client.auth.me());
}

export async function requestMagicLink(email: string) {
  const client = await appClient;
  return Effect.runPromise(client.auth.login({ payload: { email } }));
}

export async function verifyMagicLink(token: string) {
  const client = await appClient;
  return Effect.runPromise(client.auth.verifyMagicLink({ payload: { token } }));
}

export async function listWorkspaces() {
  const client = await appClient;
  return Effect.runPromise(client.workspaces.listWorkspaces());
}

export async function getWorkspace(workspaceId: string) {
  const client = await appClient;
  return Effect.runPromise(client.workspaces.getWorkspace({ params: { workspaceId } }));
}

function cookieValue(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;

  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);

  return value === undefined ? undefined : decodeURIComponent(value);
}

export async function leaveWorkspace(workspaceId: string) {
  const client = await appClient;
  return Effect.runPromise(
    client.workspaces.endMembership({
      params: { workspaceId },
      headers: { "x-csrf-token": cookieValue("cove_csrf") },
    }),
  );
}
