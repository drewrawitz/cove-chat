import {
  AddChannelMemberCommand,
  ChannelAccess,
  CreatePrivateChannelCommand,
  CreatePublicChannelCommand,
  JoinPublicChannelCommand,
  LeaveChannelCommand,
} from "@cove/application";
import {
  ChannelName,
  ChannelPurpose,
  makeChannelId,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
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
import {
  channelMembershipRosterResponse,
  channelMemberCandidateListResponse,
  channelResponse,
  privateChannelAdministrationListResponse,
  privateChannelListResponse,
  publicChannelListResponse,
  publicChannelResponse,
} from "./channel-response.ts";

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

const channelMemberMutationErrorResponse = (error: unknown) => {
  if (error === AuthErrorResponses.csrfValidationFailed) {
    return AuthErrorResponses.csrfValidationFailed;
  }
  if (error === AuthErrorResponses.internalServerError) {
    return AuthErrorResponses.internalServerError;
  }

  switch (errorTag(error)) {
    case "Application.ChannelUnavailable":
    case "Domain.InvalidIdentifier":
      return ChannelErrorResponses.unavailable;
    case "Application.ChannelMemberUnavailable":
      return ChannelErrorResponses.memberUnavailable;
    case "Application.FullMemberUnavailable":
      return WorkspaceErrorResponses.fullMemberUnavailable;
    case "Application.WorkspaceUnavailable":
      return WorkspaceErrorResponses.unavailable;
    default:
      return AuthErrorResponses.internalServerError;
  }
};

const leaveChannelErrorResponse = (error: unknown) => {
  if (error === AuthErrorResponses.csrfValidationFailed) {
    return AuthErrorResponses.csrfValidationFailed;
  }
  if (error === AuthErrorResponses.internalServerError) {
    return AuthErrorResponses.internalServerError;
  }
  return errorTag(error) === "Application.PrivateChannelMaintainerCannotLeave"
    ? ChannelErrorResponses.privateMaintainerCannotLeave
    : channelErrorResponse(error);
};

const privateChannelAdministrationListErrorResponse = (error: unknown) =>
  errorTag(error) === "Application.ChannelAdministrationForbidden"
    ? ChannelErrorResponses.administrationForbidden
    : workspaceErrorResponse(error);

const resolveActorAndWorkspace = Effect.fn("ChannelApi.resolveActorAndWorkspace")(
  function* (params: { readonly workspaceId: string }) {
    const actor = yield* AuthenticatedActor;
    const actorId = yield* makeUserId(actor.userId);
    const workspaceId = yield* makeWorkspaceId(params.workspaceId);
    return { actorId, workspaceId };
  },
);

const resolveActorWorkspaceAndChannel = Effect.fn("ChannelApi.resolveActorWorkspaceAndChannel")(
  function* (params: { readonly channelId: string; readonly workspaceId: string }) {
    const { actorId, workspaceId } = yield* resolveActorAndWorkspace(params);
    const channelId = yield* makeChannelId(params.channelId);
    return { actorId, workspaceId, channelId };
  },
);

export const ChannelApiLive = HttpApiBuilder.group(CoveAppApi, "channels", (handlers) =>
  handlers
    .handle("listPublicChannels", ({ params }) =>
      Effect.gen(function* () {
        const { actorId, workspaceId } = yield* resolveActorAndWorkspace(params);
        const channels = yield* ChannelAccess;
        return publicChannelListResponse(yield* channels.listPublicForActor(actorId, workspaceId));
      }).pipe(Effect.mapError(workspaceErrorResponse)),
    )
    .handle("createPublicChannel", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId } = yield* resolveActorAndWorkspace(params);
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
    .handle("createPrivateChannel", ({ headers, params, payload }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId } = yield* resolveActorAndWorkspace(params);
        const channelId = yield* makeChannelId(randomUUID());
        const channels = yield* ChannelAccess;
        return channelResponse(
          yield* channels.createPrivate(
            CreatePrivateChannelCommand.make({
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
    .handle("listPrivateChannels", ({ params }) =>
      Effect.gen(function* () {
        const { actorId, workspaceId } = yield* resolveActorAndWorkspace(params);
        const channels = yield* ChannelAccess;
        return privateChannelListResponse(
          yield* channels.listPrivateForActor(actorId, workspaceId),
        );
      }).pipe(Effect.mapError(workspaceErrorResponse)),
    )
    .handle("listChannelMemberCandidates", ({ params }) =>
      Effect.gen(function* () {
        const { actorId, workspaceId, channelId } = yield* resolveActorWorkspaceAndChannel(params);
        const channels = yield* ChannelAccess;
        return channelMemberCandidateListResponse(
          yield* channels.listMemberCandidatesForActor(actorId, workspaceId, channelId),
        );
      }).pipe(Effect.mapError(channelErrorResponse)),
    )
    .handle("listPrivateChannelsForAdministration", ({ params }) =>
      Effect.gen(function* () {
        const { actorId, workspaceId } = yield* resolveActorAndWorkspace(params);
        const channels = yield* ChannelAccess;
        return privateChannelAdministrationListResponse(
          yield* channels.listPrivateForAdministrator(actorId, workspaceId),
        );
      }).pipe(Effect.mapError(privateChannelAdministrationListErrorResponse)),
    )
    .handle("getChannel", ({ params }) =>
      Effect.gen(function* () {
        const { actorId, workspaceId, channelId } = yield* resolveActorWorkspaceAndChannel(params);
        const channels = yield* ChannelAccess;
        return channelResponse(yield* channels.getForActor(actorId, workspaceId, channelId));
      }).pipe(Effect.mapError(channelErrorResponse)),
    )
    .handle("getChannelMembershipRoster", ({ params }) =>
      Effect.gen(function* () {
        const { actorId, workspaceId, channelId } = yield* resolveActorWorkspaceAndChannel(params);
        const channels = yield* ChannelAccess;
        return channelMembershipRosterResponse(
          yield* channels.getMembershipRosterForActor(actorId, workspaceId, channelId),
        );
      }).pipe(Effect.mapError(channelErrorResponse)),
    )
    .handle("joinPublicChannel", ({ headers, params }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorWorkspaceAndChannel(params);
        const channels = yield* ChannelAccess;
        return publicChannelResponse(
          yield* channels.joinPublic(
            JoinPublicChannelCommand.make({ actorAccountId: actorId, workspaceId, channelId }),
          ),
        );
      }).pipe(Effect.mapError(channelErrorResponse)),
    )
    .handle("leaveChannel", ({ headers, params }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorWorkspaceAndChannel(params);
        const channels = yield* ChannelAccess;
        yield* channels.leave(
          LeaveChannelCommand.make({ actorAccountId: actorId, workspaceId, channelId }),
        );
      }).pipe(Effect.mapError(leaveChannelErrorResponse)),
    )
    .handle("addChannelMember", ({ headers, params }) =>
      Effect.gen(function* () {
        yield* validateMutationCsrf(headers["x-csrf-token"]);
        const { actorId, workspaceId, channelId } = yield* resolveActorWorkspaceAndChannel(params);
        const workspaceIdentityId = yield* makeWorkspaceIdentityId(params.workspaceIdentityId);
        const channels = yield* ChannelAccess;
        return channelMembershipRosterResponse(
          yield* channels.addMember(
            AddChannelMemberCommand.make({
              actorAccountId: actorId,
              workspaceId,
              channelId,
              workspaceIdentityId,
            }),
          ),
        );
      }).pipe(Effect.mapError(channelMemberMutationErrorResponse)),
    ),
);
