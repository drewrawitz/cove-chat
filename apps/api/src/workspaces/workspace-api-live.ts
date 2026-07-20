import {
  AcceptWorkspaceInvitationCommand,
  ChangeWorkspaceRoleCommand,
  CreateWorkspaceCommand,
  InviteWorkspaceMemberCommand,
  LeaveWorkspaceCommand,
  RemoveWorkspaceMemberCommand,
  UpdateWorkspaceIdentityCommand,
  WorkspaceAccess,
  makeEmailAddress,
  makeCsrfToken,
  makeSessionToken,
  validateCsrf,
} from "@cove/application";
import {
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  WorkspaceIdentityProfile,
  WorkspaceName,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
  makeWorkspaceInvitationId,
} from "@cove/domain";
import {
  AuthErrorResponses,
  AuthenticatedActor,
  AuthenticatedSession,
  CoveAppApi,
  WorkspaceErrorResponses,
} from "@cove/protocol";
import { Effect, Redacted } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  workspaceAccessResponse,
  workspaceCreatedResponse,
  workspaceIdentityUpdateResponse,
  workspaceInvitationAcceptedResponse,
  workspaceInvitationCreatedResponse,
  workspaceInvitationListResponse,
  workspaceListResponse,
  workspaceMemberListResponse,
  workspaceRoleChangeResponse,
} from "./workspace-response.ts";

const errorTag = (error: unknown): unknown =>
  typeof error === "object" && error !== null && "_tag" in error ? error._tag : undefined;

const workspaceUnavailableErrorResponse = (error: unknown) =>
  errorTag(error) === "Application.WorkspaceUnavailable" ||
  errorTag(error) === "Domain.InvalidIdentifier"
    ? WorkspaceErrorResponses.unavailable
    : AuthErrorResponses.internalServerError;

const endMembershipErrorResponse = (error: unknown) =>
  errorTag(error) === "Application.LastWorkspaceOwner"
    ? WorkspaceErrorResponses.lastOwner
    : workspaceUnavailableErrorResponse(error);

const acceptInvitationErrorResponse = (error: unknown) => {
  switch (errorTag(error)) {
    case "Application.AlreadyWorkspaceMember":
      return WorkspaceErrorResponses.alreadyMember;
    case "Application.ExistingWorkspaceIdentityProfileNotAccepted":
      return WorkspaceErrorResponses.existingProfileNotAccepted;
    case "Application.InitialWorkspaceIdentityProfileRequired":
      return WorkspaceErrorResponses.initialProfileRequired;
    case "Application.WorkspaceInvitationUnavailable":
    case "Domain.InvalidIdentifier":
      return WorkspaceErrorResponses.invitationUnavailable;
    default:
      return AuthErrorResponses.internalServerError;
  }
};

const inviteMemberErrorResponse = (error: unknown) => {
  switch (errorTag(error)) {
    case "Application.AlreadyWorkspaceMember":
      return WorkspaceErrorResponses.alreadyMember;
    case "Application.WorkspaceAdministrationForbidden":
      return WorkspaceErrorResponses.administrationForbidden;
    case "Application.WorkspaceInvitationAlreadyPending":
      return WorkspaceErrorResponses.invitationAlreadyPending;
    case "Application.WorkspaceInviteeUnavailable":
      return WorkspaceErrorResponses.inviteeUnavailable;
    default:
      return workspaceUnavailableErrorResponse(error);
  }
};

const workspaceMembersErrorResponse = (error: unknown) =>
  errorTag(error) === "Application.WorkspaceAdministrationForbidden"
    ? WorkspaceErrorResponses.administrationForbidden
    : workspaceUnavailableErrorResponse(error);

const memberAdministrationErrorResponse = (error: unknown) => {
  switch (errorTag(error)) {
    case "Application.LastWorkspaceOwner":
      return WorkspaceErrorResponses.lastOwner;
    case "Application.WorkspaceAdministrationForbidden":
      return WorkspaceErrorResponses.administrationForbidden;
    case "Application.WorkspaceMemberUnavailable":
      return WorkspaceErrorResponses.memberUnavailable;
    default:
      return workspaceUnavailableErrorResponse(error);
  }
};

const validateMutationCsrf = Effect.fn("WorkspaceApi.validateMutationCsrf")(function* (
  csrfHeader: string | undefined,
) {
  if (csrfHeader === undefined) {
    return yield* Effect.fail(AuthErrorResponses.csrfValidationFailed);
  }

  const session = yield* AuthenticatedSession;
  yield* validateCsrf(
    makeSessionToken(Redacted.value(session.token)),
    makeCsrfToken(csrfHeader),
  ).pipe(
    Effect.mapError((error) =>
      errorTag(error) === "Application.InvalidCsrfToken"
        ? AuthErrorResponses.csrfValidationFailed
        : AuthErrorResponses.internalServerError,
    ),
  );
});

export const WorkspaceApiLive = HttpApiBuilder.group(CoveAppApi, "workspaces", (handlers) =>
  handlers
    .handle("listWorkspaces", () =>
      Effect.gen(function* () {
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId);
        const workspaceAccess = yield* WorkspaceAccess;
        return workspaceListResponse(yield* workspaceAccess.listForActor(actorId));
      }).pipe(Effect.mapError(() => AuthErrorResponses.internalServerError)),
    )
    .handle("createWorkspace", ({ headers, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId).pipe(
          Effect.mapError(() => AuthErrorResponses.internalServerError),
        );
        const workspaceAccess = yield* WorkspaceAccess;
        const created = yield* workspaceAccess
          .create(
            CreateWorkspaceCommand.make({
              actorAccountId: actorId,
              workspaceName: WorkspaceName.make(payload.name),
              initialIdentityProfile: WorkspaceIdentityProfile.make({
                name: WorkspaceIdentityName.make(payload.identity.name),
                avatarUrl: WorkspaceAvatarUrl.make(payload.identity.avatarUrl),
              }),
            }),
          )
          .pipe(Effect.mapError(() => AuthErrorResponses.internalServerError));
        return workspaceCreatedResponse(created);
      }),
    )
    .handle("getWorkspace", ({ params }) =>
      Effect.gen(function* () {
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId);
        const workspaceId = yield* makeWorkspaceId(params.workspaceId);
        const workspaceAccess = yield* WorkspaceAccess;
        const access = yield* workspaceAccess.getForActor(actorId, workspaceId);
        return workspaceAccessResponse(access);
      }).pipe(Effect.mapError(workspaceUnavailableErrorResponse)),
    )
    .handle("updateWorkspaceIdentity", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId).pipe(
          Effect.mapError(() => AuthErrorResponses.internalServerError),
        );
        const workspaceId = yield* makeWorkspaceId(params.workspaceId).pipe(
          Effect.mapError(workspaceUnavailableErrorResponse),
        );
        const workspaceAccess = yield* WorkspaceAccess;
        const outcome = yield* workspaceAccess
          .updateMyIdentity(
            UpdateWorkspaceIdentityCommand.make({
              actorAccountId: actorId,
              workspaceId,
              profile: WorkspaceIdentityProfile.make({
                name: WorkspaceIdentityName.make(payload.name),
                avatarUrl: WorkspaceAvatarUrl.make(payload.avatarUrl),
              }),
            }),
          )
          .pipe(Effect.mapError(workspaceUnavailableErrorResponse));
        return workspaceIdentityUpdateResponse(outcome);
      }),
    )
    .handle("endMembership", ({ headers, params }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);

        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId).pipe(
          Effect.mapError(() => AuthErrorResponses.internalServerError),
        );
        const workspaceId = yield* makeWorkspaceId(params.workspaceId).pipe(
          Effect.mapError(workspaceUnavailableErrorResponse),
        );
        const workspaceAccess = yield* WorkspaceAccess;
        yield* workspaceAccess
          .leave(
            LeaveWorkspaceCommand.make({
              actorAccountId: actorId,
              workspaceId,
            }),
          )
          .pipe(Effect.mapError(endMembershipErrorResponse));
      }),
    )
    .handle("listWorkspaceInvitations", () =>
      Effect.gen(function* () {
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId);
        const workspaceAccess = yield* WorkspaceAccess;
        return workspaceInvitationListResponse(
          yield* workspaceAccess.listInvitationsForActor(actorId),
        );
      }).pipe(Effect.mapError(() => AuthErrorResponses.internalServerError)),
    )
    .handle("inviteWorkspaceMember", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId).pipe(
          Effect.mapError(() => AuthErrorResponses.internalServerError),
        );
        const workspaceId = yield* makeWorkspaceId(params.workspaceId).pipe(
          Effect.mapError(workspaceUnavailableErrorResponse),
        );
        const workspaceAccess = yield* WorkspaceAccess;
        const invitation = yield* workspaceAccess
          .inviteMember(
            InviteWorkspaceMemberCommand.make({
              actorAccountId: actorId,
              workspaceId,
              inviteeEmail: makeEmailAddress(payload.email),
            }),
          )
          .pipe(Effect.mapError(inviteMemberErrorResponse));
        return workspaceInvitationCreatedResponse(invitation);
      }),
    )
    .handle("acceptWorkspaceInvitation", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId).pipe(
          Effect.mapError(() => AuthErrorResponses.internalServerError),
        );
        const invitationId = yield* makeWorkspaceInvitationId(params.invitationId).pipe(
          Effect.mapError(acceptInvitationErrorResponse),
        );
        const workspaceAccess = yield* WorkspaceAccess;
        const accepted = yield* workspaceAccess
          .acceptInvitation(
            AcceptWorkspaceInvitationCommand.make({
              actorAccountId: actorId,
              invitationId,
              ...(payload.initialIdentityProfile === undefined
                ? {}
                : {
                    initialIdentityProfile: WorkspaceIdentityProfile.make({
                      name: WorkspaceIdentityName.make(payload.initialIdentityProfile.name),
                      avatarUrl: WorkspaceAvatarUrl.make(payload.initialIdentityProfile.avatarUrl),
                    }),
                  }),
            }),
          )
          .pipe(Effect.mapError(acceptInvitationErrorResponse));
        return workspaceInvitationAcceptedResponse(accepted);
      }),
    )
    .handle("listWorkspaceMembers", ({ params }) =>
      Effect.gen(function* () {
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId);
        const workspaceId = yield* makeWorkspaceId(params.workspaceId);
        const workspaceAccess = yield* WorkspaceAccess;
        return workspaceMemberListResponse(
          yield* workspaceAccess.listMembersForActor(actorId, workspaceId),
        );
      }).pipe(Effect.mapError(workspaceMembersErrorResponse)),
    )
    .handle("changeWorkspaceRole", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId).pipe(
          Effect.mapError(() => AuthErrorResponses.internalServerError),
        );
        const workspaceId = yield* makeWorkspaceId(params.workspaceId).pipe(
          Effect.mapError(workspaceUnavailableErrorResponse),
        );
        const workspaceIdentityId = yield* makeWorkspaceIdentityId(params.workspaceIdentityId).pipe(
          Effect.mapError(() => WorkspaceErrorResponses.memberUnavailable),
        );
        const workspaceAccess = yield* WorkspaceAccess;
        const changed = yield* workspaceAccess
          .changeMemberRole(
            ChangeWorkspaceRoleCommand.make({
              actorAccountId: actorId,
              workspaceId,
              workspaceIdentityId,
              role: payload.role,
            }),
          )
          .pipe(Effect.mapError(memberAdministrationErrorResponse));
        return workspaceRoleChangeResponse(changed);
      }),
    )
    .handle("removeWorkspaceMember", ({ headers, params }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId).pipe(
          Effect.mapError(() => AuthErrorResponses.internalServerError),
        );
        const workspaceId = yield* makeWorkspaceId(params.workspaceId).pipe(
          Effect.mapError(workspaceUnavailableErrorResponse),
        );
        const workspaceIdentityId = yield* makeWorkspaceIdentityId(params.workspaceIdentityId).pipe(
          Effect.mapError(() => WorkspaceErrorResponses.memberUnavailable),
        );
        const workspaceAccess = yield* WorkspaceAccess;
        yield* workspaceAccess
          .removeMember(
            RemoveWorkspaceMemberCommand.make({
              actorAccountId: actorId,
              workspaceId,
              workspaceIdentityId,
            }),
          )
          .pipe(Effect.mapError(memberAdministrationErrorResponse));
      }),
    ),
);
