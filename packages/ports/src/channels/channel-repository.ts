import type { Channel, ChannelId, WorkspaceId } from "@cove/domain";
import { Context, type Effect, type Option } from "effect";
import type { PersistenceError } from "../persistence-error.ts";

export interface ChannelRepositoryService {
  readonly findById: (
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<Option.Option<Channel>, PersistenceError>;
}

export class ChannelRepository extends Context.Service<
  ChannelRepository,
  ChannelRepositoryService
>()("@cove/ports/ChannelRepository") {}
