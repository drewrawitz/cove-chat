import { expect, layer } from "@effect/vitest";
import {
  AddContributionCommand,
  ChannelUnavailable,
  CreateTopicCommand,
  DeleteContributionCommand,
  EditContributionCommand,
  TopicAccess,
  TopicUnavailable,
} from "@cove/application";
import {
  ContributionBody,
  makeChannelId,
  makeContributionId,
  makeTopicId,
  makeTopicTitle,
  makeUserId,
  makeWorkspaceId,
  makeWorkspaceIdentityId,
} from "@cove/domain";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { randomUUID } from "node:crypto";
import { TestPostgres } from "../support/database.ts";

const makeFixtures = Effect.gen(function* () {
  const suffix = randomUUID();
  return {
    workspaceId: yield* makeWorkspaceId(`topic-workspace-${suffix}`),
    authorAccountId: yield* makeUserId(`topic-author-account-${suffix}`),
    authorIdentityId: yield* makeWorkspaceIdentityId(`topic-author-identity-${suffix}`),
    readerAccountId: yield* makeUserId(`topic-reader-account-${suffix}`),
    readerIdentityId: yield* makeWorkspaceIdentityId(`topic-reader-identity-${suffix}`),
    publicChannelId: yield* makeChannelId(`topic-public-${suffix}`),
    privateChannelId: yield* makeChannelId(`topic-private-${suffix}`),
    topicId: yield* makeTopicId(`topic-${suffix}`),
    contributionId: yield* makeContributionId(`opening-brief-${suffix}`),
  };
});

type Fixtures = Effect.Success<typeof makeFixtures>;

const seedFixtures = Effect.fn("TopicPostgresTest.seedFixtures")(function* (fixtures: Fixtures) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    INSERT INTO users (id, email, display_name)
    VALUES
      (${fixtures.authorAccountId}, ${`${fixtures.authorAccountId}@example.test`}, 'Topic Author'),
      (${fixtures.readerAccountId}, ${`${fixtures.readerAccountId}@example.test`}, 'Topic Reader')
  `;
  yield* sql`
    INSERT INTO workspaces (id, name)
    VALUES (${fixtures.workspaceId}, 'Topic Workspace')
  `;
  yield* sql`
    INSERT INTO workspace_identities (id, workspace_id, account_id, name, avatar_url)
    VALUES
      (${fixtures.authorIdentityId}, ${fixtures.workspaceId}, ${fixtures.authorAccountId}, 'Topic Author', '/avatars/author.svg'),
      (${fixtures.readerIdentityId}, ${fixtures.workspaceId}, ${fixtures.readerAccountId}, 'Topic Reader', '/avatars/reader.svg')
  `;
  yield* sql`
    INSERT INTO channels (id, workspace_id, name, purpose, visibility, maintainer_identity_id)
    VALUES
      (${fixtures.publicChannelId}, ${fixtures.workspaceId}, 'public-topics', 'Coordinate visible topics.', 'public', ${fixtures.authorIdentityId}),
      (${fixtures.privateChannelId}, ${fixtures.workspaceId}, 'private-topics', 'Coordinate private topics.', 'private', ${fixtures.authorIdentityId})
  `;
  yield* sql`
    INSERT INTO channel_memberships (workspace_id, channel_id, identity_id)
    VALUES
      (${fixtures.workspaceId}, ${fixtures.publicChannelId}, ${fixtures.authorIdentityId}),
      (${fixtures.workspaceId}, ${fixtures.privateChannelId}, ${fixtures.authorIdentityId})
  `;
});

const removeFixtures = Effect.fn("TopicPostgresTest.removeFixtures")(function* (
  fixtures: Fixtures,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DELETE FROM workspaces WHERE id = ${fixtures.workspaceId}`;
  yield* sql`
    DELETE FROM users
    WHERE id = ${fixtures.authorAccountId}
       OR id = ${fixtures.readerAccountId}
  `;
});

const withFixtures = <A, E, R>(use: (fixtures: Fixtures) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    makeFixtures,
    (fixtures) => seedFixtures(fixtures).pipe(Effect.andThen(use(fixtures))),
    removeFixtures,
  );

layer(TestPostgres, { timeout: "2 minutes" })("PostgreSQL Topic access", (it) => {
  it.effect("creates, browses, and opens a Topic through inherited Channel access", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
        const created = yield* topics.create(
          CreateTopicCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            openingBriefContributionId: fixtures.contributionId,
            title: yield* makeTopicTitle("Release readiness"),
            openingBrief: ContributionBody.make("Capture the remaining launch risks."),
            intent: "question",
          }),
        );

        const summaries = yield* topics.listForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
        );
        const detail = yield* topics.getForActor(
          fixtures.readerAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          fixtures.topicId,
        );
        const createWithoutMembership = yield* topics
          .create(
            CreateTopicCommand.make({
              actorAccountId: fixtures.readerAccountId,
              workspaceId: fixtures.workspaceId,
              channelId: fixtures.publicChannelId,
              topicId: yield* makeTopicId(`reader-${fixtures.topicId}`),
              openingBriefContributionId: yield* makeContributionId(
                `reader-${fixtures.contributionId}`,
              ),
              title: yield* makeTopicTitle("Reader topic"),
              openingBrief: ContributionBody.make("This should not be persisted."),
            }),
          )
          .pipe(Effect.flip);
        const hiddenPrivateChannel = yield* topics
          .listForActor(fixtures.readerAccountId, fixtures.workspaceId, fixtures.privateChannelId)
          .pipe(Effect.flip);
        const wrongChannel = yield* topics
          .getForActor(
            fixtures.authorAccountId,
            fixtures.workspaceId,
            fixtures.privateChannelId,
            fixtures.topicId,
          )
          .pipe(Effect.flip);

        expect(created.contributions).toHaveLength(1);
        expect(summaries).toHaveLength(1);
        expect(summaries[0]).toMatchObject({
          topic: { id: fixtures.topicId, intent: "question" },
          contributionCount: 1,
        });
        expect(detail.contributions[0]?.contribution.body).toBe(
          "Capture the remaining launch risks.",
        );
        expect(createWithoutMembership).toBeInstanceOf(ChannelUnavailable);
        expect(hiddenPrivateChannel).toBeInstanceOf(ChannelUnavailable);
        expect(wrongChannel).toBeInstanceOf(TopicUnavailable);
      }),
    ),
  );

  it.effect("appends concurrent flat Contributions in a stable Topic order", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
        yield* topics.create(
          CreateTopicCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            openingBriefContributionId: fixtures.contributionId,
            title: yield* makeTopicTitle("Release readiness"),
            openingBrief: ContributionBody.make("Capture the remaining launch risks."),
          }),
        );
        const firstReplyId = yield* makeContributionId(`first-${fixtures.contributionId}`);
        const secondReplyId = yield* makeContributionId(`second-${fixtures.contributionId}`);

        yield* Effect.all(
          [
            topics.addContribution(
              AddContributionCommand.make({
                actorAccountId: fixtures.authorAccountId,
                workspaceId: fixtures.workspaceId,
                channelId: fixtures.publicChannelId,
                topicId: fixtures.topicId,
                contributionId: firstReplyId,
                body: ContributionBody.make("The release candidate passed smoke testing."),
              }),
            ),
            topics.addContribution(
              AddContributionCommand.make({
                actorAccountId: fixtures.authorAccountId,
                workspaceId: fixtures.workspaceId,
                channelId: fixtures.publicChannelId,
                topicId: fixtures.topicId,
                contributionId: secondReplyId,
                body: ContributionBody.make("Documentation review is complete."),
              }),
            ),
          ],
          { concurrency: "unbounded" },
        );

        const detail = yield* topics.getForActor(
          fixtures.authorAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          fixtures.topicId,
        );
        expect(detail.contributions.map(({ contribution }) => contribution.position)).toEqual([
          1, 2, 3,
        ]);
        expect(detail.contributions.slice(1).map(({ contribution }) => contribution.body)).toEqual(
          expect.arrayContaining([
            "The release candidate passed smoke testing.",
            "Documentation review is complete.",
          ]),
        );
      }),
    ),
  );

  it.effect("retains edit and deletion revisions while returning a stable tombstone", () =>
    withFixtures((fixtures) =>
      Effect.gen(function* () {
        const topics = yield* TopicAccess;
        const sql = yield* SqlClient.SqlClient;
        yield* topics.create(
          CreateTopicCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            openingBriefContributionId: fixtures.contributionId,
            title: yield* makeTopicTitle("Release readiness"),
            openingBrief: ContributionBody.make("Capture the remaining launch risks."),
          }),
        );
        const replyId = yield* makeContributionId(`reply-${fixtures.contributionId}`);
        yield* topics.addContribution(
          AddContributionCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            contributionId: replyId,
            body: ContributionBody.make("The release candidate passed smoke testng."),
          }),
        );
        const edited = yield* topics.editContribution(
          EditContributionCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            contributionId: replyId,
            body: ContributionBody.make("The release candidate passed smoke testing."),
          }),
        );
        const deleted = yield* topics.deleteContribution(
          DeleteContributionCommand.make({
            actorAccountId: fixtures.authorAccountId,
            workspaceId: fixtures.workspaceId,
            channelId: fixtures.publicChannelId,
            topicId: fixtures.topicId,
            contributionId: replyId,
          }),
        );
        const detail = yield* topics.getForActor(
          fixtures.authorAccountId,
          fixtures.workspaceId,
          fixtures.publicChannelId,
          fixtures.topicId,
        );
        const revisions = yield* sql<{ readonly body: string; readonly operation: string }>`
          SELECT body, operation
          FROM contribution_revisions
          WHERE workspace_id = ${fixtures.workspaceId}
            AND contribution_id = ${replyId}
          ORDER BY id
        `;

        expect(edited.contribution.editedAt).toBeInstanceOf(Date);
        expect(deleted.contribution).toMatchObject({ id: replyId, position: 2 });
        expect(deleted.contribution).not.toHaveProperty("body");
        expect(detail.contributions[1]?.contribution).toMatchObject({
          id: replyId,
          position: 2,
        });
        expect(detail.contributions[1]?.contribution).not.toHaveProperty("body");
        expect(revisions).toEqual([
          { body: "The release candidate passed smoke testng.", operation: "edit" },
          { body: "The release candidate passed smoke testing.", operation: "delete" },
        ]);
      }),
    ),
  );
});
