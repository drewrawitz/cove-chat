import { ChannelAccessFacts, ChannelId, UserId, WorkspaceId, canViewChannel } from "@cove/domain";
import { ChannelRepository, MembershipRepository } from "@cove/ports";
import { Effect, Option, Schema } from "effect";

export const GetChannelForActorInput = Schema.Struct({
  actorId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});

export interface GetChannelForActorInput extends Schema.Schema.Type<
  typeof GetChannelForActorInput
> {}

export class ChannelUnavailable extends Schema.TaggedErrorClass<ChannelUnavailable>()(
  "Application.ChannelUnavailable",
  {
    channelId: ChannelId,
  },
) {}

export const getChannelForActor = Effect.fn("Application.getChannelForActor")(function* (
  input: GetChannelForActorInput,
) {
  const channels = yield* ChannelRepository;
  const memberships = yield* MembershipRepository;

  const foundChannel = yield* channels.findById(input.workspaceId, input.channelId);

  if (Option.isNone(foundChannel)) {
    return yield* Effect.fail(new ChannelUnavailable({ channelId: input.channelId }));
  }

  const membershipFacts = yield* memberships.getChannelAccessFacts(
    input.actorId,
    input.workspaceId,
    input.channelId,
  );
  const accessFacts = ChannelAccessFacts.make({
    visibility: foundChannel.value.visibility,
    ...membershipFacts,
  });

  if (!canViewChannel(accessFacts)) {
    return yield* Effect.fail(new ChannelUnavailable({ channelId: input.channelId }));
  }

  return foundChannel.value;
});
