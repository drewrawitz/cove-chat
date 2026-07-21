import { Channel, ChannelId, WorkspaceId, type Channel as ChannelType } from "@cove/domain";
import { ChannelRepository } from "@cove/ports";
import { Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { persistenceError } from "../persistence-error.ts";

const FindChannelByIdRequest = Schema.Struct({
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});

interface FindChannelByIdRequest extends Schema.Schema.Type<typeof FindChannelByIdRequest> {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const findChannelById = SqlSchema.findOneOption({
    Request: FindChannelByIdRequest,
    Result: Channel,
    execute: ({ workspaceId, channelId }) => sql<ChannelType>`
      SELECT
        id,
        workspace_id AS "workspaceId",
        name,
        purpose,
        visibility,
        steward_identity_id AS "stewardIdentityId"
      FROM channels
      WHERE workspace_id = ${workspaceId}
        AND id = ${channelId}
      LIMIT 1
    `,
  });

  return ChannelRepository.of({
    findById: Effect.fn("PostgresChannelRepository.findById")((workspaceId, channelId) =>
      findChannelById({ workspaceId, channelId }).pipe(
        Effect.mapError((cause) => persistenceError("ChannelRepository.findById", cause)),
      ),
    ),
  });
});

export const PostgresChannelRepository = Layer.effect(ChannelRepository, make);
