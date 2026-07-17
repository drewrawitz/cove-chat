import { expect, layer } from "@effect/vitest";
import { Channel, makeChannelId, makeChannelName, makeUserId, makeWorkspaceId } from "@cove/domain";
import { ChannelRepository, PersistenceError } from "@cove/ports";
import { ChannelUnavailable, GetChannelForActorInput, getChannelForActor } from "@cove/application";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/database.ts";

const makeFixtures = Effect.gen(function* () {
  const suffix = randomUUID();
  const workspaceId = yield* makeWorkspaceId(`workspace-${suffix}`);
  const otherWorkspaceId = yield* makeWorkspaceId(`other-workspace-${suffix}`);
  const privateMemberId = yield* makeUserId(`private-member-${suffix}`);
  const workspaceMemberId = yield* makeUserId(`workspace-member-${suffix}`);
  const outsiderId = yield* makeUserId(`outsider-${suffix}`);
  const publicChannelId = yield* makeChannelId(`public-${suffix}`);
  const privateChannelId = yield* makeChannelId(`private-${suffix}`);
  const otherChannelId = yield* makeChannelId(`other-${suffix}`);
  const invalidChannelId = yield* makeChannelId(`invalid-${suffix}`);
  const publicChannelName = yield* makeChannelName("general");
  const privateChannelName = yield* makeChannelName("leadership");

  return {
    workspaceId,
    otherWorkspaceId,
    privateMemberId,
    workspaceMemberId,
    outsiderId,
    publicChannel: Channel.make({
      id: publicChannelId,
      workspaceId,
      name: publicChannelName,
      visibility: "public",
    }),
    privateChannel: Channel.make({
      id: privateChannelId,
      workspaceId,
      name: privateChannelName,
      visibility: "private",
    }),
    otherChannelId,
    invalidChannelId,
  };
});

type Fixtures = Effect.Success<typeof makeFixtures>;

const seedFixtures = Effect.fn("PostgresIntegrationTest.seedFixtures")(function* (
  fixtures: Fixtures,
) {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    INSERT INTO users (id, email, display_name)
    VALUES
      (${fixtures.privateMemberId}, ${`${fixtures.privateMemberId}@example.test`}, 'Private Member'),
      (${fixtures.workspaceMemberId}, ${`${fixtures.workspaceMemberId}@example.test`}, 'Workspace Member')
  `;
  yield* sql`
    INSERT INTO workspaces (id, name)
    VALUES
      (${fixtures.workspaceId}, 'Test Workspace'),
      (${fixtures.otherWorkspaceId}, 'Other Workspace')
  `;
  yield* sql`
    INSERT INTO workspace_memberships (workspace_id, user_id)
    VALUES
      (${fixtures.workspaceId}, ${fixtures.privateMemberId}),
      (${fixtures.workspaceId}, ${fixtures.workspaceMemberId})
  `;
  yield* sql`
    INSERT INTO channels (id, workspace_id, name, visibility)
    VALUES
      (${fixtures.publicChannel.id}, ${fixtures.workspaceId}, ${fixtures.publicChannel.name}, 'public'),
      (${fixtures.privateChannel.id}, ${fixtures.workspaceId}, ${fixtures.privateChannel.name}, 'private'),
      (${fixtures.otherChannelId}, ${fixtures.otherWorkspaceId}, 'other-team', 'public'),
      (${fixtures.invalidChannelId}, ${fixtures.workspaceId}, '', 'public')
  `;
  yield* sql`
    INSERT INTO channel_memberships (workspace_id, channel_id, user_id)
    VALUES (${fixtures.workspaceId}, ${fixtures.privateChannel.id}, ${fixtures.privateMemberId})
  `;
});

const removeFixtures = Effect.fn("PostgresIntegrationTest.removeFixtures")(function* (
  fixtures: Fixtures,
) {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    DELETE FROM workspaces
    WHERE id = ${fixtures.workspaceId}
       OR id = ${fixtures.otherWorkspaceId}
  `;
  yield* sql`
    DELETE FROM users
    WHERE id = ${fixtures.privateMemberId}
       OR id = ${fixtures.workspaceMemberId}
  `;
});

const withFixtures = <A, E, R>(use: (fixtures: Fixtures) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    makeFixtures,
    (fixtures) => seedFixtures(fixtures).pipe(Effect.andThen(use(fixtures))),
    removeFixtures,
  );

layer(TestPostgres, { timeout: "2 minutes" })("PostgreSQL adapters", (it) => {
  it.effect("runs authorized channel lookup through the PostgreSQL adapters", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const publicChannel = yield* getChannelForActor(
          GetChannelForActorInput.make({
            actorId: fixtures.workspaceMemberId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannel.id,
          }),
        );
        const privateChannel = yield* getChannelForActor(
          GetChannelForActorInput.make({
            actorId: fixtures.privateMemberId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.privateChannel.id,
          }),
        );

        expect(publicChannel).toEqual(fixtures.publicChannel);
        expect(privateChannel).toEqual(fixtures.privateChannel);

        const hiddenPrivateChannel = yield* getChannelForActor(
          GetChannelForActorInput.make({
            actorId: fixtures.workspaceMemberId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.privateChannel.id,
          }),
        ).pipe(Effect.flip);
        const hiddenFromOutsider = yield* getChannelForActor(
          GetChannelForActorInput.make({
            actorId: fixtures.outsiderId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannel.id,
          }),
        ).pipe(Effect.flip);
        const crossWorkspaceChannel = yield* getChannelForActor(
          GetChannelForActorInput.make({
            actorId: fixtures.privateMemberId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.otherChannelId,
          }),
        ).pipe(Effect.flip);

        expect(hiddenPrivateChannel).toBeInstanceOf(ChannelUnavailable);
        expect(hiddenFromOutsider).toBeInstanceOf(ChannelUnavailable);
        expect(crossWorkspaceChannel).toBeInstanceOf(ChannelUnavailable);
      }),
    ),
  );

  it.effect("turns invalid persisted channel data into PersistenceError", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const channels = yield* ChannelRepository;
        const error = yield* channels
          .findById(fixtures.workspaceId, fixtures.invalidChannelId)
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(PersistenceError);
        expect(error.operation).toBe("ChannelRepository.findById");
      }),
    ),
  );
});
