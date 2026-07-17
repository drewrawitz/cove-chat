import {
  ChannelId,
  ChannelMembershipFacts,
  UserId,
  WorkspaceId,
  type ChannelMembershipFacts as ChannelMembershipFactsType,
} from "@cove/domain";
import { MembershipRepository } from "@cove/ports";
import { Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { persistenceError } from "../persistence-error.ts";

const GetChannelAccessFactsRequest = Schema.Struct({
  actorId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});

interface GetChannelAccessFactsRequest extends Schema.Schema.Type<
  typeof GetChannelAccessFactsRequest
> {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const getChannelAccessFacts = SqlSchema.findOne({
    Request: GetChannelAccessFactsRequest,
    Result: ChannelMembershipFacts,
    execute: ({ actorId, workspaceId, channelId }) => sql<ChannelMembershipFactsType>`
      SELECT
        EXISTS (
          SELECT 1
          FROM workspace_memberships
          WHERE workspace_id = ${workspaceId}
            AND user_id = ${actorId}
        ) AS "isWorkspaceMember",
        EXISTS (
          SELECT 1
          FROM channel_memberships
          WHERE workspace_id = ${workspaceId}
            AND channel_id = ${channelId}
            AND user_id = ${actorId}
        ) AS "isChannelMember"
    `,
  });

  return MembershipRepository.of({
    getChannelAccessFacts: Effect.fn("PostgresMembershipRepository.getChannelAccessFacts")(
      (actorId, workspaceId, channelId) =>
        getChannelAccessFacts({ actorId, workspaceId, channelId }).pipe(
          Effect.mapError((cause) =>
            persistenceError("MembershipRepository.getChannelAccessFacts", cause),
          ),
        ),
    ),
  });
});

export const PostgresMembershipRepository = Layer.effect(MembershipRepository, make);
