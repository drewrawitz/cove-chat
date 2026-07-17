import type { ChannelId, ChannelMembershipFacts, UserId, WorkspaceId } from "@cove/domain";
import { Context, type Effect } from "effect";
import type { PersistenceError } from "../persistence-error.ts";

export interface MembershipRepositoryService {
  readonly getChannelAccessFacts: (
    actorId: UserId,
    workspaceId: WorkspaceId,
    channelId: ChannelId,
  ) => Effect.Effect<ChannelMembershipFacts, PersistenceError>;
}

export class MembershipRepository extends Context.Service<
  MembershipRepository,
  MembershipRepositoryService
>()("@cove/ports/MembershipRepository") {}
