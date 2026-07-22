import {
  ChannelAccess,
  CreatePublicChannelCommand,
  JoinPublicChannelCommand,
} from "@cove/application";
import {
  ChannelName,
  ChannelPurpose,
  makeChannelId,
  makeUserId,
  makeWorkspaceId,
} from "@cove/domain";
import {
  AuthErrorResponses,
  AuthenticatedActor,
  ChannelErrorResponses,
  CoveAppApi,
  WorkspaceErrorResponses,
} from "@cove/protocol";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { randomUUID } from "node:crypto";
import { validateMutationCsrf } from "../support/validate-mutation-csrf.ts";
import { publicChannelListResponse, publicChannelResponse } from "./channel-response.ts";

const errorTag = (error: unknown): unknown =>
  typeof error === "object" && error !== null && "_tag" in error ? error._tag : undefined;

const workspaceErrorResponse = (error: unknown) =>
  errorTag(error) === "Application.WorkspaceUnavailable" ||
  errorTag(error) === "Domain.InvalidIdentifier"
    ? WorkspaceErrorResponses.unavailable
    : AuthErrorResponses.internalServerError;

const channelErrorResponse = (error: unknown) =>
  errorTag(error) === "Application.ChannelUnavailable" ||
  errorTag(error) === "Domain.InvalidIdentifier"
    ? ChannelErrorResponses.unavailable
    : AuthErrorResponses.internalServerError;

const createChannelErrorResponse = workspaceErrorResponse;

export const ChannelApiLive = HttpApiBuilder.group(CoveAppApi, "channels", (handlers) =>
  handlers
    .handle("listPublicChannels", ({ params }) =>
      Effect.gen(function* () {
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId);
        const workspaceId = yield* makeWorkspaceId(params.workspaceId);
        const channels = yield* ChannelAccess;
        return publicChannelListResponse(yield* channels.listPublicForActor(actorId, workspaceId));
      }).pipe(Effect.mapError(workspaceErrorResponse)),
    )
    .handle("createPublicChannel", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId);
        const workspaceId = yield* makeWorkspaceId(params.workspaceId);
        const channelId = yield* makeChannelId(randomUUID());
        const channels = yield* ChannelAccess;
        return publicChannelResponse(
          yield* channels.createPublic(
            CreatePublicChannelCommand.make({
              actorAccountId: actorId,
              workspaceId,
              channelId,
              name: ChannelName.make(payload.name),
              purpose: ChannelPurpose.make(payload.purpose),
            }),
          ),
        );
      }).pipe(Effect.mapError(createChannelErrorResponse)),
    )
    .handle("getPublicChannel", ({ params }) =>
      Effect.gen(function* () {
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId);
        const workspaceId = yield* makeWorkspaceId(params.workspaceId);
        const channelId = yield* makeChannelId(params.channelId);
        const channels = yield* ChannelAccess;
        return publicChannelResponse(
          yield* channels.getPublicForActor(actorId, workspaceId, channelId),
        );
      }).pipe(Effect.mapError(channelErrorResponse)),
    )
    .handle("joinPublicChannel", ({ headers, params }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const actor = yield* AuthenticatedActor;
        const actorId = yield* makeUserId(actor.userId);
        const workspaceId = yield* makeWorkspaceId(params.workspaceId);
        const channelId = yield* makeChannelId(params.channelId);
        const channels = yield* ChannelAccess;
        return publicChannelResponse(
          yield* channels.joinPublic(
            JoinPublicChannelCommand.make({ actorAccountId: actorId, workspaceId, channelId }),
          ),
        );
      }).pipe(Effect.mapError(channelErrorResponse)),
    ),
);
