import { NodeHttpServer } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { PostgresRepositories } from "@cove/infrastructure-postgres";
import { TestDatabase } from "@cove/infrastructure-postgres/test";
import {
  AuthenticationNotifier,
  WorkspaceInvitationNotifier,
  type AuthenticationNotifierService,
  type MagicLinkNotification,
  type WorkspaceInvitationNotification,
  type WorkspaceInvitationNotifierService,
} from "@cove/ports";
import { Context, Duration, Effect, Layer, Option, Queue, Redacted, Schema } from "effect";
import { Cookies, HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
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

interface TestWorkspaceInvitationNotifierService extends WorkspaceInvitationNotifierService {
  readonly take: () => Effect.Effect<WorkspaceInvitationNotification>;
}

class TestWorkspaceInvitationNotifier extends Context.Service<
  TestWorkspaceInvitationNotifier,
  TestWorkspaceInvitationNotifierService
>()("@cove/api/test/TestWorkspaceInvitationNotifier") {}

const AuthenticationNotifierTest = Layer.effectContext(
  Effect.gen(function* () {
    const messages = yield* Queue.unbounded<MagicLinkNotification>();
    const invitationMessages = yield* Queue.unbounded<WorkspaceInvitationNotification>();
    const service = TestAuthenticationNotifier.of({
      sendMagicLink: Effect.fn("TestAuthenticationNotifier.sendMagicLink")((message) =>
        Queue.offer(messages, message).pipe(Effect.asVoid),
      ),
      poll: Effect.fn("TestAuthenticationNotifier.poll")(() => Queue.poll(messages)),
      take: Effect.fn("TestAuthenticationNotifier.take")(() => Queue.take(messages)),
    });
    const invitationService = TestWorkspaceInvitationNotifier.of({
      sendInvitation: Effect.fn("WorkspaceInvitationNotifier.Test.sendInvitation")((message) =>
        Queue.offer(invitationMessages, message).pipe(Effect.asVoid),
      ),
      take: Effect.fn("TestWorkspaceInvitationNotifier.take")(() => Queue.take(invitationMessages)),
    });

    return Context.empty().pipe(
      Context.add(AuthenticationNotifier, service),
      Context.add(WorkspaceInvitationNotifier, invitationService),
      Context.add(TestAuthenticationNotifier, service),
      Context.add(TestWorkspaceInvitationNotifier, invitationService),
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
  workspaceInvitations: "/api/app/v1/workspaces/demo-workspace/invitations",
  redeemWorkspaceInvitation: "/api/app/v1/workspace-invitations/redeem",
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

    it.effect("redeems an invitation into an Account and authenticated session", () =>
      Effect.gen(function* () {
        const authenticationDelivery = yield* TestAuthenticationNotifier;
        const invitationDelivery = yield* TestWorkspaceInvitationNotifier;
        const inviteeEmail = `http-invitee-${randomUUID()}@example.test`;

        yield* HttpClient.post(AppRoutes.login, {
          body: HttpBody.jsonUnsafe({ email: "bob@cove.local" }),
        });
        const magicLink = yield* authenticationDelivery.take();
        const ownerSignIn = yield* HttpClient.post(AppRoutes.verifyMagicLink, {
          body: HttpBody.jsonUnsafe({ token: Redacted.value(magicLink.token) }),
        });
        const ownerCookie = authenticatedCookies(ownerSignIn.cookies);
        const ownerCsrfToken = cookieValue(ownerSignIn.cookies, "cove_csrf");
        const inviteResponse = yield* HttpClient.post(AppRoutes.workspaceInvitations, {
          headers: { cookie: ownerCookie, "x-csrf-token": ownerCsrfToken },
          body: HttpBody.jsonUnsafe({ email: inviteeEmail }),
        });
        const invitation = yield* invitationDelivery.take();
        const redemptionResponse = yield* HttpClient.post(AppRoutes.redeemWorkspaceInvitation, {
          body: HttpBody.jsonUnsafe({
            token: Redacted.value(invitation.token),
            displayName: "HTTP Invitee",
            initialIdentityProfile: {
              name: "HTTP Workspace Member",
              avatarUrl: "/avatars/http-invitee.svg",
            },
          }),
        });
        const redemptionBody = yield* redemptionResponse.json;
        const sessionCookie = Option.getOrThrow(
          Cookies.get(redemptionResponse.cookies, "cove_session"),
        );
        const csrfCookie = Option.getOrThrow(Cookies.get(redemptionResponse.cookies, "cove_csrf"));
        const meResponse = yield* HttpClient.get(AppRoutes.me, {
          headers: { cookie: authenticatedCookies(redemptionResponse.cookies) },
        });

        expect(inviteResponse.status).toBe(200);
        expect(redemptionResponse.status).toBe(200);
        expect(redemptionBody).toMatchObject({
          outcome: "WorkspaceInvitationRedeemed",
          account: { email: inviteeEmail, displayName: "HTTP Invitee" },
          workspaceId: "demo-workspace",
        });
        expect(sessionCookie.options).toMatchObject({
          httpOnly: true,
          secure: true,
          sameSite: "strict",
        });
        expect(csrfCookie.options).toMatchObject({ secure: true, sameSite: "strict" });
        expect(meResponse.status).toBe(200);
        expect(yield* meResponse.json).toMatchObject({
          email: inviteeEmail,
          displayName: "HTTP Invitee",
        });
      }),
    );

    it.effect("lets a Workspace administrator list, resend, and revoke pending invitations", () =>
      Effect.gen(function* () {
        const authenticationDelivery = yield* TestAuthenticationNotifier;
        const invitationDelivery = yield* TestWorkspaceInvitationNotifier;
        const sql = yield* SqlClient.SqlClient;
        const inviteeEmail = `http-pending-${randomUUID()}@example.test`;

        yield* HttpClient.post(AppRoutes.login, {
          body: HttpBody.jsonUnsafe({ email: "bob@cove.local" }),
        });
        const magicLink = yield* authenticationDelivery.take();
        const ownerSignIn = yield* HttpClient.post(AppRoutes.verifyMagicLink, {
          body: HttpBody.jsonUnsafe({ token: Redacted.value(magicLink.token) }),
        });
        const cookie = authenticatedCookies(ownerSignIn.cookies);
        const csrfToken = cookieValue(ownerSignIn.cookies, "cove_csrf");
        const inviteResponse = yield* HttpClient.post(AppRoutes.workspaceInvitations, {
          headers: { cookie, "x-csrf-token": csrfToken },
          body: HttpBody.jsonUnsafe({ email: inviteeEmail }),
        });
        const inviteBody = yield* inviteResponse.json.pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(Schema.Struct({ invitationId: Schema.String })),
          ),
        );
        const originalNotification = yield* invitationDelivery.take();

        const pendingResponse = yield* HttpClient.get(AppRoutes.workspaceInvitations, {
          headers: { cookie },
        });
        const pendingBody = yield* pendingResponse.json;
        const resendTooSoonResponse = yield* HttpClient.post(
          `${AppRoutes.workspaceInvitations}/${inviteBody.invitationId}/resend`,
          { headers: { cookie, "x-csrf-token": csrfToken } },
        );
        const resendTooSoonBody = yield* resendTooSoonResponse.json;

        yield* sql`
          UPDATE workspace_invitations
          SET invited_at = NOW() - INTERVAL '61 seconds'
          WHERE id = ${inviteBody.invitationId}
        `;

        const resendResponse = yield* HttpClient.post(
          `${AppRoutes.workspaceInvitations}/${inviteBody.invitationId}/resend`,
          { headers: { cookie, "x-csrf-token": csrfToken } },
        );
        const replacementNotification = yield* invitationDelivery.take();
        const oldLinkResponse = yield* HttpClient.post(AppRoutes.redeemWorkspaceInvitation, {
          body: HttpBody.jsonUnsafe({
            token: Redacted.value(originalNotification.token),
            displayName: "Old Link Invitee",
            initialIdentityProfile: {
              name: "Old Link Invitee",
              avatarUrl: "/avatars/old-link.svg",
            },
          }),
        });
        const revokeResponse = yield* HttpClient.del(
          `${AppRoutes.workspaceInvitations}/${inviteBody.invitationId}`,
          { headers: { cookie, "x-csrf-token": csrfToken } },
        );
        const remainingResponse = yield* HttpClient.get(AppRoutes.workspaceInvitations, {
          headers: { cookie },
        });
        const replacementLinkResponse = yield* HttpClient.post(
          AppRoutes.redeemWorkspaceInvitation,
          {
            body: HttpBody.jsonUnsafe({
              token: Redacted.value(replacementNotification.token),
              displayName: "Revoked Invitee",
              initialIdentityProfile: {
                name: "Revoked Invitee",
                avatarUrl: "/avatars/revoked.svg",
              },
            }),
          },
        );

        expect(inviteResponse.status).toBe(200);
        expect(pendingResponse.status).toBe(200);
        expect(pendingBody).toMatchObject({
          invitations: [
            {
              id: inviteBody.invitationId,
              inviteeEmail,
              resendAvailableAt: expect.any(String),
            },
          ],
        });
        expect(resendTooSoonResponse.status).toBe(429);
        expect(resendTooSoonBody).toMatchObject({
          code: "WORKSPACE_INVITATION_RESEND_TOO_SOON",
          resendAvailableAt: expect.any(String),
        });
        expect(resendResponse.status).toBe(200);
        expect(yield* resendResponse.json).toMatchObject({
          outcome: "WorkspaceInvitationResent",
          invitationId: inviteBody.invitationId,
          inviteeEmail,
        });
        expect(Redacted.value(replacementNotification.token)).not.toBe(
          Redacted.value(originalNotification.token),
        );
        expect(oldLinkResponse.status).toBe(404);
        expect(revokeResponse.status).toBe(200);
        expect(yield* revokeResponse.json).toMatchObject({
          outcome: "WorkspaceInvitationRevoked",
          invitationId: inviteBody.invitationId,
          inviteeEmail,
        });
        expect(remainingResponse.status).toBe(200);
        expect(yield* remainingResponse.json).toEqual({ invitations: [] });
        expect(replacementLinkResponse.status).toBe(404);
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
        });

        expect(leaveResponse.status).toBe(409);
        expect(yield* leaveResponse.json).toEqual({
          code: "LAST_WORKSPACE_OWNER",
          message: "The final workspace owner cannot leave, be removed, or be demoted.",
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
