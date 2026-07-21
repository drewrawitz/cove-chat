import { type ChannelId, type UserId, type WorkspaceId } from "@cove/domain";
import { Context, type Effect, Schema } from "effect";
import {
  CreatePublicChannelCommand,
  PublicChannelView,
  ChannelMaintainerView,
} from "./channel-access.ts";

export const CreatePublicChannelPersistenceResult = Schema.TaggedUnion({
  Created: { channel: PublicChannelView },
  ActorUnavailable: {},
  MaintainerUnavailable: {},
});
export type CreatePublicChannelPersistenceResult = typeof CreatePublicChannelPersistenceResult.Type;

export class ChannelAccessPersistenceFailure extends Schema.TaggedErrorClass<ChannelAccessPersistenceFailure>()(
  "Application.ChannelAccessPersistenceFailure",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

export interface ChannelAccessPersistenceService {
  readonly listPublicForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<ReadonlyArray<PublicChannelView> | undefined, ChannelAccessPersistenceFailure>;
  readonly listMaintainersForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<
    ReadonlyArray<ChannelMaintainerView> | undefined,
    ChannelAccessPersistenceFailure
  >;
  readonly getPublicForActor: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<PublicChannelView | undefined, ChannelAccessPersistenceFailure>;
  readonly createPublic: (
    command: CreatePublicChannelCommand,
  ) => Effect.Effect<CreatePublicChannelPersistenceResult, ChannelAccessPersistenceFailure>;
  readonly joinPublic: (
    actorAccountId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<PublicChannelView | undefined, ChannelAccessPersistenceFailure>;
}

export class ChannelAccessPersistence extends Context.Service<
  ChannelAccessPersistence,
  ChannelAccessPersistenceService
>()("@cove/application/ChannelAccessPersistence") {}
