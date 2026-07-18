import {
  CreateWorkspaceInput,
  EndWorkspaceMembershipInput,
  GetWorkspaceAccessInput,
  UpdateWorkspaceIdentityInput,
  createWorkspace,
  endWorkspaceMembership,
  getWorkspaceAccess,
  listWorkspaceAccess,
  makeCsrfToken,
  makeSessionToken,
  updateWorkspaceIdentity,
  validateCsrf,
} from "@cove/application";
import {
  WorkspaceAvatarUrl,
  WorkspaceIdentityName,
  WorkspaceIdentityProfile,
  WorkspaceName,
  makeUserId,
  makeWorkspaceId,
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
import { workspaceAccessResponse, workspaceListResponse } from "./workspace-response.ts";

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
        const workspaces = yield* listWorkspaceAccess(actorId);
        return workspaceListResponse(workspaces);
      }).pipe(Effect.mapError(() => AuthErrorResponses.internalServerError)),
    )
    .handle("createWorkspace", ({ headers, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId).pipe(
          Effect.mapError(() => AuthErrorResponses.internalServerError),
        );
        const access = yield* createWorkspace(
          CreateWorkspaceInput.make({
            actorId,
            workspaceName: WorkspaceName.make(payload.name),
            profile: WorkspaceIdentityProfile.make({
              name: WorkspaceIdentityName.make(payload.identity.name),
              avatarUrl: WorkspaceAvatarUrl.make(payload.identity.avatarUrl),
            }),
          }),
        ).pipe(Effect.mapError(() => AuthErrorResponses.internalServerError));
        return workspaceAccessResponse(access);
      }),
    )
    .handle("getWorkspace", ({ params }) =>
      Effect.gen(function* () {
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId);
        const workspaceId = yield* makeWorkspaceId(params.workspaceId);
        const access = yield* getWorkspaceAccess(
          GetWorkspaceAccessInput.make({ actorId, workspaceId }),
        );
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
        const access = yield* updateWorkspaceIdentity(
          UpdateWorkspaceIdentityInput.make({
            actorId,
            workspaceId,
            profile: WorkspaceIdentityProfile.make({
              name: WorkspaceIdentityName.make(payload.name),
              avatarUrl: WorkspaceAvatarUrl.make(payload.avatarUrl),
            }),
          }),
        ).pipe(Effect.mapError(workspaceUnavailableErrorResponse));
        return workspaceAccessResponse(access);
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
        yield* endWorkspaceMembership(
          EndWorkspaceMembershipInput.make({ actorId, workspaceId }),
        ).pipe(Effect.mapError(endMembershipErrorResponse));
      }),
    ),
);
