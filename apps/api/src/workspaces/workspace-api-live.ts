import {
  EndWorkspaceMembershipInput,
  GetWorkspaceAccessInput,
  endWorkspaceMembership,
  getWorkspaceAccess,
  listWorkspaceAccess,
  makeCsrfToken,
  makeSessionToken,
  validateCsrf,
} from "@cove/application";
import { makeUserId, makeWorkspaceId } from "@cove/domain";
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
    .handle("endMembership", ({ headers, params }) =>
      Effect.gen(function* () {
        if (headers["x-csrf-token"] === undefined) {
          return yield* Effect.fail(AuthErrorResponses.csrfValidationFailed);
        }

        const session = yield* AuthenticatedSession;
        yield* validateCsrf(
          makeSessionToken(Redacted.value(session.token)),
          makeCsrfToken(headers["x-csrf-token"]),
        ).pipe(
          Effect.mapError((error) =>
            errorTag(error) === "Application.InvalidCsrfToken"
              ? AuthErrorResponses.csrfValidationFailed
              : AuthErrorResponses.internalServerError,
          ),
        );

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
