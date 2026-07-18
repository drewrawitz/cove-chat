import { NodeHttpServer } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { PostgresRepositories } from "@cove/infrastructure-postgres";
import { TestDatabase } from "@cove/infrastructure-postgres/test";
import {
  AuthenticationNotifier,
  type AuthenticationNotifierService,
  type MagicLinkNotification,
} from "@cove/ports";
import { Context, Duration, Effect, Layer, Option, Queue, Redacted } from "effect";
import { Cookies, HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import { PostgresDatabaseReadiness } from "../../src/health/index.ts";
import { makeHttpRoutes } from "../../src/http-live.ts";

const Server = HttpRouter.serve(makeHttpRoutes({ exposeAppApiDocs: false }), {
  disableListenLog: true,
  disableLogger: true,
});

const DatabaseServicesLive = Layer.mergeAll(PostgresDatabaseReadiness, PostgresRepositories).pipe(
  Layer.provideMerge(TestDatabase),
);

interface TestAuthenticationNotifierService extends AuthenticationNotifierService {
  readonly poll: () => Effect.Effect<Option.Option<MagicLinkNotification>>;
  readonly take: () => Effect.Effect<MagicLinkNotification>;
}

class TestAuthenticationNotifier extends Context.Service<
  TestAuthenticationNotifier,
  TestAuthenticationNotifierService
>()("@cove/api/test/TestAuthenticationNotifier") {}

const AuthenticationNotifierTest = Layer.effectContext(
  Effect.gen(function* () {
    const messages = yield* Queue.unbounded<MagicLinkNotification>();
    const service = TestAuthenticationNotifier.of({
      sendMagicLink: Effect.fn("TestAuthenticationNotifier.sendMagicLink")((message) =>
        Queue.offer(messages, message).pipe(Effect.asVoid),
      ),
      poll: Effect.fn("TestAuthenticationNotifier.poll")(() => Queue.poll(messages)),
      take: Effect.fn("TestAuthenticationNotifier.take")(() => Queue.take(messages)),
    });

    return Context.empty().pipe(
      Context.add(AuthenticationNotifier, service),
      Context.add(TestAuthenticationNotifier, service),
    );
  }),
);

const Api = Server.pipe(
  Layer.provideMerge(DatabaseServicesLive),
  Layer.provideMerge(AuthenticationNotifierTest),
  Layer.provideMerge(NodeHttpServer.layerTest),
);

function cookieValue(cookies: Cookies.Cookies, name: string): string {
  return Option.getOrElse(Cookies.getValue(cookies, name), () => "");
}

function authenticatedCookies(cookies: Cookies.Cookies): string {
  return ["cove_session", "cove_csrf"]
    .map((name) => `${name}=${cookieValue(cookies, name)}`)
    .join("; ");
}

const AppRoutes = {
  login: "/api/app/v1/auth/login",
  verifyMagicLink: "/api/app/v1/auth/login/verify",
  logout: "/api/app/v1/auth/logout",
  me: "/api/app/v1/me",
  workspaces: "/api/app/v1/workspaces",
  workspace: "/api/app/v1/workspaces/demo-workspace",
  workspaceMembership: "/api/app/v1/workspaces/demo-workspace/membership",
};

layer(Api, { excludeTestServices: true, timeout: "2 minutes" })(
  "authentication routes with PostgreSQL",
  (it) => {
    it.effect("delivers a magic link for a seeded demo user", () =>
      Effect.gen(function* () {
        const delivery = yield* TestAuthenticationNotifier;
        const loginResponse = yield* HttpClient.post(AppRoutes.login, {
          body: HttpBody.jsonUnsafe({
            email: "alice@cove.local",
          }),
        });
        const loginBody = yield* loginResponse.json;

        expect(loginResponse.status).toBe(202);
        expect(loginBody).toEqual({ status: "accepted" });

        const message = yield* delivery.take();

        expect(message.recipient).toBe("alice@cove.local");
        expect(Redacted.value(message.token)).not.toBe("");
      }),
    );

    it.effect("does not disclose whether an email belongs to a user", () =>
      Effect.gen(function* () {
        const delivery = yield* TestAuthenticationNotifier;
        const response = yield* HttpClient.post(AppRoutes.login, {
          body: HttpBody.jsonUnsafe({ email: "unknown@cove.local" }),
        });

        expect(response.status).toBe(202);
        expect(yield* response.json).toEqual({ status: "accepted" });
        expect(Option.isNone(yield* delivery.poll())).toBe(true);
      }),
    );

    it.effect("redeems a magic link for an HTTP-only session and returns the current user", () =>
      Effect.gen(function* () {
        const delivery = yield* TestAuthenticationNotifier;
        yield* HttpClient.post(AppRoutes.login, {
          body: HttpBody.jsonUnsafe({ email: "alice@cove.local" }),
        });
        const message = yield* delivery.take();
        const verifyResponse = yield* HttpClient.post(AppRoutes.verifyMagicLink, {
          body: HttpBody.jsonUnsafe({ token: Redacted.value(message.token) }),
        });
        const verifyBody = yield* verifyResponse.json;
        const responseCookies = verifyResponse.cookies;

        expect(verifyResponse.status).toBe(200);
        expect(verifyBody).toEqual({
          id: "demo-alice",
          email: "alice@cove.local",
          displayName: "Alice Demo",
        });
        const sessionCookie = Option.getOrThrow(Cookies.get(responseCookies, "cove_session"));
        const csrfCookie = Option.getOrThrow(Cookies.get(responseCookies, "cove_csrf"));

        expect(sessionCookie.options).toMatchObject({
          httpOnly: true,
          secure: true,
          sameSite: "strict",
        });
        expect(csrfCookie.options).toMatchObject({
          secure: true,
          sameSite: "strict",
        });
        expect(csrfCookie.options?.httpOnly).toBeUndefined();

        const sql = yield* SqlClient.SqlClient;
        const auditEvents = yield* sql<{
          readonly actorUserId: string;
          readonly eventType: string;
          readonly eventVersion: number;
          readonly metadata: unknown;
        }>`
          SELECT
            actor_user_id AS "actorUserId",
            event_type AS "eventType",
            event_version AS "eventVersion",
            metadata
          FROM audit_events
          WHERE actor_user_id = 'demo-alice'
            AND event_type = 'authentication.sign_in'
        `;

        expect(auditEvents.length).toBeGreaterThan(0);
        expect(auditEvents[0]).toEqual({
          actorUserId: "demo-alice",
          eventType: "authentication.sign_in",
          eventVersion: 1,
          metadata: { authenticationMethod: "magic_link" },
        });

        const cookie = authenticatedCookies(responseCookies);
        const meResponse = yield* HttpClient.get(AppRoutes.me, {
          headers: { cookie },
        });
        const meBody = yield* meResponse.json;

        expect(meResponse.status).toBe(200);
        expect(meBody).toEqual(verifyBody);

        const workspacesResponse = yield* HttpClient.get(AppRoutes.workspaces, {
          headers: { cookie },
        });
        expect(workspacesResponse.status).toBe(200);
        expect(yield* workspacesResponse.json).toEqual({
          workspaces: [
            {
              id: "demo-workspace",
              name: "Cove Demo",
              identity: {
                id: "demo-alice-identity",
                name: "Alice in Cove",
                avatarUrl: "/avatars/alice.svg",
              },
              membership: { role: "member" },
            },
          ],
        });
      }),
    );

    it.effect("rejects a missing session with the stable unauthorized response", () =>
      Effect.gen(function* () {
        const response = yield* HttpClient.get(AppRoutes.me);
        const body = yield* response.json;

        expect(response.status).toBe(401);
        expect(body).toEqual({
          code: "UNAUTHENTICATED",
          message: "Authentication is required.",
        });
      }),
    );

    it.effect("rejects an invalid session with the stable unauthorized response", () =>
      Effect.gen(function* () {
        const response = yield* HttpClient.get(AppRoutes.me, {
          headers: { cookie: "cove_session=not-a-session" },
        });
        const body = yield* response.json;

        expect(response.status).toBe(401);
        expect(body).toEqual({
          code: "UNAUTHENTICATED",
          message: "Authentication is required.",
        });
      }),
    );

    it.effect("rejects an invalid magic link with a stable unauthorized response", () =>
      Effect.gen(function* () {
        const response = yield* HttpClient.post(AppRoutes.verifyMagicLink, {
          body: HttpBody.jsonUnsafe({ token: "not-a-magic-link" }),
        });
        const body = yield* response.json;

        expect(response.status).toBe(401);
        expect(body).toEqual({
          code: "INVALID_MAGIC_LINK",
          message: "Magic link is invalid or expired.",
        });
      }),
    );

    it.effect("consumes each magic link only once", () =>
      Effect.gen(function* () {
        const delivery = yield* TestAuthenticationNotifier;
        yield* HttpClient.post(AppRoutes.login, {
          body: HttpBody.jsonUnsafe({ email: "bob@cove.local" }),
        });
        const message = yield* delivery.take();
        const request = {
          body: HttpBody.jsonUnsafe({ token: Redacted.value(message.token) }),
        };

        const firstResponse = yield* HttpClient.post(AppRoutes.verifyMagicLink, request);
        const replayResponse = yield* HttpClient.post(AppRoutes.verifyMagicLink, request);

        expect(firstResponse.status).toBe(200);
        expect(replayResponse.status).toBe(401);
        expect(yield* replayResponse.json).toEqual({
          code: "INVALID_MAGIC_LINK",
          message: "Magic link is invalid or expired.",
        });
      }),
    );

    it.effect("rejects an expired session with the stable unauthorized response", () =>
      Effect.gen(function* () {
        const delivery = yield* TestAuthenticationNotifier;
        const sql = yield* SqlClient.SqlClient;
        yield* HttpClient.post(AppRoutes.login, {
          body: HttpBody.jsonUnsafe({ email: "alice@cove.local" }),
        });
        const message = yield* delivery.take();
        const verifyResponse = yield* HttpClient.post(AppRoutes.verifyMagicLink, {
          body: HttpBody.jsonUnsafe({ token: Redacted.value(message.token) }),
        });
        const cookie = authenticatedCookies(verifyResponse.cookies);

        yield* sql`
          UPDATE sessions
          SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
          WHERE user_id = 'demo-alice'
        `;

        const response = yield* HttpClient.get(AppRoutes.me, {
          headers: { cookie },
        });
        const body = yield* response.json;

        expect(response.status).toBe(401);
        expect(body).toEqual({
          code: "UNAUTHENTICATED",
          message: "Authentication is required.",
        });
      }),
    );

    it.effect("rejects logout without a CSRF token and keeps the session active", () =>
      Effect.gen(function* () {
        const delivery = yield* TestAuthenticationNotifier;
        yield* HttpClient.post(AppRoutes.login, {
          body: HttpBody.jsonUnsafe({ email: "bob@cove.local" }),
        });
        const message = yield* delivery.take();
        const verifyResponse = yield* HttpClient.post(AppRoutes.verifyMagicLink, {
          body: HttpBody.jsonUnsafe({ token: Redacted.value(message.token) }),
        });
        const cookie = authenticatedCookies(verifyResponse.cookies);

        const logoutResponse = yield* HttpClient.post(AppRoutes.logout, {
          headers: { cookie },
        });

        expect(logoutResponse.status).toBe(403);
        expect(yield* logoutResponse.json).toEqual({
          code: "CSRF_VALIDATION_FAILED",
          message: "CSRF validation failed.",
        });

        const meResponse = yield* HttpClient.get(AppRoutes.me, {
          headers: { cookie },
        });

        expect(meResponse.status).toBe(200);
      }),
    );

    it.effect("keeps the final owner in the workspace", () =>
      Effect.gen(function* () {
        const delivery = yield* TestAuthenticationNotifier;
        yield* HttpClient.post(AppRoutes.login, {
          body: HttpBody.jsonUnsafe({ email: "bob@cove.local" }),
        });
        const message = yield* delivery.take();
        const verifyResponse = yield* HttpClient.post(AppRoutes.verifyMagicLink, {
          body: HttpBody.jsonUnsafe({ token: Redacted.value(message.token) }),
        });
        const responseCookies = verifyResponse.cookies;
        const cookie = authenticatedCookies(responseCookies);
        const csrfToken = cookieValue(responseCookies, "cove_csrf");

        const leaveResponse = yield* HttpClient.del(AppRoutes.workspaceMembership, {
          headers: { cookie, "x-csrf-token": csrfToken },
          body: HttpBody.jsonUnsafe({ commandId: "auth-routes-final-owner-leave" }),
        });

        expect(leaveResponse.status).toBe(409);
        expect(yield* leaveResponse.json).toEqual({
          code: "LAST_WORKSPACE_OWNER",
          message: "The final workspace owner cannot leave.",
        });

        const workspaceResponse = yield* HttpClient.get(AppRoutes.workspace, {
          headers: { cookie },
        });
        expect(workspaceResponse.status).toBe(200);
      }),
    );

    it.effect("logs out by revoking the session and expiring its cookie", () =>
      Effect.gen(function* () {
        const delivery = yield* TestAuthenticationNotifier;
        yield* HttpClient.post(AppRoutes.login, {
          body: HttpBody.jsonUnsafe({ email: "alice@cove.local" }),
        });
        const message = yield* delivery.take();
        const verifyResponse = yield* HttpClient.post(AppRoutes.verifyMagicLink, {
          body: HttpBody.jsonUnsafe({ token: Redacted.value(message.token) }),
        });
        const responseCookies = verifyResponse.cookies;
        const cookie = authenticatedCookies(responseCookies);
        const csrfToken = cookieValue(responseCookies, "cove_csrf");

        const logoutResponse = yield* HttpClient.post(AppRoutes.logout, {
          headers: { cookie, "x-csrf-token": csrfToken },
        });

        expect(logoutResponse.status).toBe(204);
        expect(Cookies.getValue(logoutResponse.cookies, "cove_session")).toEqual(Option.some(""));
        expect(Cookies.getValue(logoutResponse.cookies, "cove_csrf")).toEqual(Option.some(""));
        expect(
          Duration.toMillis(
            Option.getOrThrow(Cookies.get(logoutResponse.cookies, "cove_session")).options
              ?.maxAge ?? 1,
          ),
        ).toBe(0);

        const meResponse = yield* HttpClient.get(AppRoutes.me, {
          headers: { cookie },
        });

        expect(meResponse.status).toBe(401);
      }),
    );
  },
);
