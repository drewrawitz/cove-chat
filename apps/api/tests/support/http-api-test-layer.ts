import { NodeHttpServer } from "@effect/platform-node";
import {
  WorkspaceAccess,
  makeCsrfToken,
  makeMagicLinkToken,
  makeSessionToken,
} from "@cove/application";
import {
  AuditEventWriter,
  AuthenticationNotifier,
  MagicLinkRepository,
  SessionRepository,
  TransactionManager,
  UserRepository,
} from "@cove/ports";
import { Effect, Layer, Option } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { makeHttpRoutes } from "../../src/http-live.ts";

const unmockedWorkspaceAccess = (operation: string) =>
  Effect.die(new Error(`WorkspaceAccess.${operation} not mocked for this test`));

const AuthPortsTest = Layer.mergeAll(
  Layer.succeed(
    AuthenticationNotifier,
    AuthenticationNotifier.of({
      sendMagicLink: Effect.fn("AuthenticationNotifier.Test.sendMagicLink")(() => Effect.void),
    }),
  ),
  Layer.succeed(
    WorkspaceAccess,
    WorkspaceAccess.of({
      listForActor: Effect.fn("WorkspaceAccess.Test.listForActor")(() => Effect.succeed([])),
      getForActor: Effect.fn("WorkspaceAccess.Test.getForActor")(() =>
        unmockedWorkspaceAccess("getForActor"),
      ),
      create: Effect.fn("WorkspaceAccess.Test.create")(() => unmockedWorkspaceAccess("create")),
      updateMyIdentity: Effect.fn("WorkspaceAccess.Test.updateMyIdentity")(() =>
        unmockedWorkspaceAccess("updateMyIdentity"),
      ),
      leave: Effect.fn("WorkspaceAccess.Test.leave")(() => unmockedWorkspaceAccess("leave")),
      listInvitationsForActor: Effect.fn("WorkspaceAccess.Test.listInvitationsForActor")(() =>
        unmockedWorkspaceAccess("listInvitationsForActor"),
      ),
      listMembersForActor: Effect.fn("WorkspaceAccess.Test.listMembersForActor")(() =>
        unmockedWorkspaceAccess("listMembersForActor"),
      ),
      inviteMember: Effect.fn("WorkspaceAccess.Test.inviteMember")(() =>
        unmockedWorkspaceAccess("inviteMember"),
      ),
      acceptInvitation: Effect.fn("WorkspaceAccess.Test.acceptInvitation")(() =>
        unmockedWorkspaceAccess("acceptInvitation"),
      ),
      changeMemberRole: Effect.fn("WorkspaceAccess.Test.changeMemberRole")(() =>
        unmockedWorkspaceAccess("changeMemberRole"),
      ),
      removeMember: Effect.fn("WorkspaceAccess.Test.removeMember")(() =>
        unmockedWorkspaceAccess("removeMember"),
      ),
    }),
  ),
  Layer.succeed(
    MagicLinkRepository,
    MagicLinkRepository.of({
      issue: Effect.fn("MagicLinkRepository.Test.issue")(() =>
        Effect.succeed(makeMagicLinkToken("unused")),
      ),
      consume: Effect.fn("MagicLinkRepository.Test.consume")(() => Effect.succeed(Option.none())),
    }),
  ),
  Layer.succeed(
    SessionRepository,
    SessionRepository.of({
      create: Effect.fn("SessionRepository.Test.create")((_userId, expiresAt) =>
        Effect.succeed({
          token: makeSessionToken("unused-session"),
          csrfToken: makeCsrfToken("unused-csrf"),
          expiresAt,
        }),
      ),
      findCurrentUser: Effect.fn("SessionRepository.Test.findCurrentUser")(() =>
        Effect.succeed(Option.none()),
      ),
      validateCsrf: Effect.fn("SessionRepository.Test.validateCsrf")(() => Effect.succeed(true)),
      revoke: Effect.fn("SessionRepository.Test.revoke")(() => Effect.succeed(true)),
    }),
  ),
  Layer.succeed(
    UserRepository,
    UserRepository.of({
      findByEmail: Effect.fn("UserRepository.Test.findByEmail")(() =>
        Effect.succeed(Option.none()),
      ),
    }),
  ),
  Layer.succeed(
    AuditEventWriter,
    AuditEventWriter.of({
      append: Effect.fn("AuditEventWriter.Test.append")(() => Effect.void),
    }),
  ),
  Layer.succeed(
    TransactionManager,
    TransactionManager.of({
      run: (effect) => effect,
    }),
  ),
);

export const makeHttpApiTestLayer = <R, E>(
  options: { readonly exposeAppApiDocs: boolean },
  dependencies: Layer.Layer<R, E>,
) =>
  HttpRouter.serve(makeHttpRoutes(options), {
    disableListenLog: true,
    disableLogger: true,
  }).pipe(
    Layer.provide(dependencies.pipe(Layer.provideMerge(AuthPortsTest))),
    Layer.provideMerge(NodeHttpServer.layerTest),
  );
