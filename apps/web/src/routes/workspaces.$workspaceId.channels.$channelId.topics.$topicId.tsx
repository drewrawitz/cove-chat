import { queries } from "@cove/sync";
import { useQuery } from "@rocicorp/zero/react";
import { Link, createFileRoute, useLocation } from "@tanstack/react-router";
import { type ReactElement, useRef } from "react";
import {
  useAuthMe,
  useChannelsGetChannel,
  useWorkspacesGetWorkspace,
} from "../api/generated/cove-app.ts";
import { channelDisplayName } from "../channel-display-name.ts";
import { ConversationShell } from "../components/conversation-shell.tsx";
import { PageMessage } from "../components/page-message.tsx";
import {
  SynchronizedTopicReplies,
  TOPIC_QUERY_TTL,
} from "../components/synchronized-topic-replies.tsx";
import { TopicHeader } from "../components/topic-header.tsx";
import { TopicMessages } from "../components/topic-messages.tsx";
import { topicIntentLabel } from "../topic-intent.ts";
import { synchronizedTopicDetail, topicProjectionState } from "../topic-sync.ts";

export const Route = createFileRoute(
  "/workspaces/$workspaceId/channels/$channelId/topics/$topicId",
)({ component: TopicPage });

function TopicPage(): ReactElement {
  const { workspaceId, channelId, topicId } = Route.useParams();
  const justCreatedTopicId = useLocation({
    select: ({ state }) =>
      "justCreatedTopicId" in state && typeof state.justCreatedTopicId === "string"
        ? state.justCreatedTopicId
        : undefined,
  });
  const topicHeading = useRef<HTMLHeadingElement>(null);
  const account = useAuthMe({ query: { retry: false } });
  const workspace = useWorkspacesGetWorkspace(workspaceId, { query: { retry: false } });
  const channel = useChannelsGetChannel(workspaceId, channelId, { query: { retry: false } });
  const [synchronizedTopic, synchronizedTopicResult] = useQuery(
    queries.topics.byId({ workspaceId, channelId, topicId }),
    { ttl: TOPIC_QUERY_TTL },
  );
  const [openingBrief, openingBriefResult] = useQuery(
    queries.messages.openingBrief({ workspaceId, channelId, topicId }),
    { ttl: TOPIC_QUERY_TTL },
  );
  const synchronizedResultType =
    synchronizedTopicResult.type === "error" || openingBriefResult.type === "error"
      ? "error"
      : synchronizedTopicResult.type === "complete" && openingBriefResult.type === "complete"
        ? "complete"
        : "unknown";
  const projectionState = topicProjectionState({
    queryResultType: synchronizedResultType,
    topicAvailable: synchronizedTopic !== undefined && openingBrief !== undefined,
    justCreated: justCreatedTopicId === topicId,
  });
  const topicPending = projectionState === "syncing";
  const topicError = projectionState === "unavailable";

  if (account.isPending || workspace.isPending) {
    return <PageMessage message="Opening workspace…" theme="dark" />;
  }
  if (account.isError) {
    return <PageMessage message="Cove could not load your account." theme="dark" />;
  }
  if (workspace.isError) {
    return <PageMessage message="This topic is not available in this workspace." theme="dark" />;
  }

  let content: ReactElement;
  if (channel.isPending || topicPending) {
    content = (
      <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <p className="text-muted-foreground" role="status">
          Opening Topic…
        </p>
      </div>
    );
  } else if (
    channel.isError ||
    topicError ||
    synchronizedTopic === undefined ||
    openingBrief === undefined
  ) {
    content = (
      <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <p className="text-muted-foreground" role="status">
          This topic is not available in this channel.
        </p>
        <Link
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          to="/workspaces/$workspaceId/channels/$channelId"
          params={{ workspaceId, channelId }}
        >
          Return to Channel
        </Link>
      </div>
    );
  } else {
    const displayName = channelDisplayName(channel.data.name);
    content = (
      <SynchronizedTopicReplies
        key={`${workspaceId}:${channelId}:${topicId}`}
        channelId={channelId}
        messageCount={synchronizedTopic.messageCount}
        topicId={topicId}
        workspaceId={workspaceId}
      >
        {(replyState) => {
          const topic = synchronizedTopicDetail(
            synchronizedTopic,
            openingBrief,
            replyState.replies,
          );
          if (replyState.initialResultType === "unknown") {
            return (
              <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
                <p className="text-muted-foreground" role="status">
                  Loading Replies…
                </p>
              </div>
            );
          }
          if (replyState.initialResultType === "error" || topic === undefined) {
            return (
              <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
                <p className="text-muted-foreground" role="status">
                  Cove could not load this Topic’s Replies.
                </p>
              </div>
            );
          }

          return (
            <>
              <TopicHeader
                channelId={channelId}
                channelName={displayName}
                headingRef={topicHeading}
                replyCount={Math.max(0, synchronizedTopic.messageCount - 1)}
                title={topic.title}
                workspaceId={workspaceId}
              />

              <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-24">
                <header className="border-b pb-8">
                  {topic.intent === undefined ? null : (
                    <span className="inline-flex rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                      {topicIntentLabel(topic.intent)}
                    </span>
                  )}
                  <h2
                    ref={topicHeading}
                    className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl"
                  >
                    {topic.title}
                  </h2>
                </header>

                <TopicMessages
                  canReply={channel.data.hasChannelMembership}
                  channelId={channelId}
                  currentIdentity={workspace.data.identity}
                  messages={topic.messages}
                  olderRepliesPagination={{
                    hasError: replyState.olderRepliesError,
                    isLoading: replyState.isLoadingOlderReplies,
                    load: replyState.loadOlderReplies,
                    remainingCount: replyState.remainingReplyCount,
                  }}
                  topicId={topicId}
                  workspaceId={workspaceId}
                />
              </div>
            </>
          );
        }}
      </SynchronizedTopicReplies>
    );
  }

  return (
    <ConversationShell
      accountDisplayName={account.data.displayName}
      accountEmail={account.data.email}
      activeChannelId={channelId}
      busy={channel.isPending || topicPending}
      identityName={workspace.data.identity.name}
      workspaceId={workspaceId}
      workspaceName={workspace.data.workspace.name}
    >
      {content}
    </ConversationShell>
  );
}
