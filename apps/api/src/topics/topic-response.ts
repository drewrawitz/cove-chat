import type { TopicContributionView, TopicSummaryView, TopicView } from "@cove/application";
import {
  TopicContributionResponse,
  TopicListResponse,
  TopicResponse,
  TopicSummaryResponse,
} from "@cove/protocol";

const contributionResponse = (view: TopicContributionView): TopicContributionResponse =>
  TopicContributionResponse.make({
    id: view.contribution.id,
    body: view.contribution.body,
    position: view.contribution.position,
    createdAt: view.contribution.createdAt,
    author: {
      id: view.author.id,
      name: view.author.name,
      avatarUrl: view.author.avatarUrl,
    },
  });

const topicResponseFields = (view: TopicView | TopicSummaryView) => ({
  id: view.topic.id,
  workspaceId: view.topic.workspaceId,
  channelId: view.topic.channelId,
  title: view.topic.title,
  ...(view.topic.intent === undefined ? {} : { intent: view.topic.intent }),
  createdAt: view.topic.createdAt,
});

export const topicResponse = (view: TopicView): TopicResponse =>
  TopicResponse.make({
    ...topicResponseFields(view),
    contributions: view.contributions.map(contributionResponse),
  });

const topicSummaryResponse = (view: TopicSummaryView): TopicSummaryResponse =>
  TopicSummaryResponse.make({
    ...topicResponseFields(view),
    openingBrief: contributionResponse(view.openingBrief),
    contributionCount: view.contributionCount,
  });

export const topicListResponse = (topics: ReadonlyArray<TopicSummaryView>): TopicListResponse =>
  TopicListResponse.make({ topics: topics.map(topicSummaryResponse) });
