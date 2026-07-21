import { Effect, Layer } from "effect";
import { WorkspaceUnavailable } from "../workspaces/workspace-access.ts";
import { ChannelAccess, ChannelAccessFailure } from "./channel-access.ts";
import { ChannelAccessPersistence } from "./channel-access-persistence.ts";
import { ChannelUnavailable } from "./get-channel-for-actor.ts";

const make = Effect.gen(function* () {
  const persistence = yield* ChannelAccessPersistence;

  const internalFailure = (operation: string) => new ChannelAccessFailure({ operation });
  const recoverPersistence = <A>(operation: string, effect: Effect.Effect<A, unknown>) =>
    effect.pipe(Effect.mapError(() => internalFailure(operation)));

  return ChannelAccess.of({
    listPublicForActor: Effect.fn("ChannelAccess.listPublicForActor")(
      function* (actorAccountId, workspaceId) {
        const channels = yield* recoverPersistence(
          "ChannelAccess.listPublicForActor",
          persistence.listPublicForActor(actorAccountId, workspaceId),
        );
        if (channels === undefined) {
          return yield* Effect.fail(new WorkspaceUnavailable({ workspaceId }));
        }
        return channels;
      },
    ),
    getPublicForActor: Effect.fn("ChannelAccess.getPublicForActor")(
      function* (actorAccountId, workspaceId, channelId) {
        const channel = yield* recoverPersistence(
          "ChannelAccess.getPublicForActor",
          persistence.getPublicForActor(actorAccountId, workspaceId, channelId),
        );
        if (channel === undefined) {
          return yield* Effect.fail(new ChannelUnavailable({ channelId }));
        }
        return channel;
      },
    ),
    createPublic: Effect.fn("ChannelAccess.createPublic")(function* (command) {
      const result = yield* recoverPersistence(
        "ChannelAccess.createPublic",
        persistence.createPublic(command),
      );
      return yield* result._tag === "Created"
        ? Effect.succeed(result.channel)
        : Effect.fail(new WorkspaceUnavailable({ workspaceId: command.workspaceId }));
    }),
    joinPublic: Effect.fn("ChannelAccess.joinPublic")(function* (command) {
      const channel = yield* recoverPersistence(
        "ChannelAccess.joinPublic",
        persistence.joinPublic(command.actorAccountId, command.workspaceId, command.channelId),
      );
      if (channel === undefined) {
        return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
      }
      return channel;
    }),
  });
});

export const ChannelAccessLive = Layer.effect(ChannelAccess, make);
