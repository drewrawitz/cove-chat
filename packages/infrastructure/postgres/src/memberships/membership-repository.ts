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
          FROM workspace_memberships AS membership
          INNER JOIN workspace_identities AS identity
            ON identity.workspace_id = membership.workspace_id
           AND identity.id = membership.identity_id
          WHERE membership.workspace_id = ${workspaceId}
            AND identity.account_id = ${actorId}
            AND membership.ended_at IS NULL
        ) AS "isWorkspaceMember",
        EXISTS (
          SELECT 1
          FROM channel_memberships AS channel_membership
          INNER JOIN workspace_identities AS identity
            ON identity.workspace_id = channel_membership.workspace_id
           AND identity.id = channel_membership.identity_id
          WHERE channel_membership.workspace_id = ${workspaceId}
            AND channel_membership.channel_id = ${channelId}
            AND identity.account_id = ${actorId}
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
