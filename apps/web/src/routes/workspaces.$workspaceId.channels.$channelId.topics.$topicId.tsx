import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { type ReactElement, useRef } from "react";
import {
  useAuthMe,
  useChannelsGetChannel,
  getTopicsListTopicsQueryKey,
  useTopicsGetTopic,
  useWorkspacesGetWorkspace,
} from "../api/generated/cove-app.ts";
import { channelDisplayName } from "../channel-display-name.ts";
import { ConversationShell } from "../components/conversation-shell.tsx";
import { PageMessage } from "../components/page-message.tsx";
import { TopicHeader } from "../components/topic-header.tsx";
import { TopicMessages } from "../components/topic-messages.tsx";
import { topicIntentLabel } from "../topic-intent.ts";

export const Route = createFileRoute(
  "/workspaces/$workspaceId/channels/$channelId/topics/$topicId",
)({ component: TopicPage });

function TopicPage(): ReactElement {
  const { workspaceId, channelId, topicId } = Route.useParams();
  const topicHeading = useRef<HTMLHeadingElement>(null);
  const queryClient = useQueryClient();
  const account = useAuthMe({ query: { retry: false } });
  const workspace = useWorkspacesGetWorkspace(workspaceId, { query: { retry: false } });
  const channel = useChannelsGetChannel(workspaceId, channelId, { query: { retry: false } });
  const topic = useTopicsGetTopic(workspaceId, channelId, topicId, { query: { retry: false } });
  const refreshTopic = async (): Promise<void> => {
    await Promise.all([
      topic.refetch(),
      queryClient.invalidateQueries({
        queryKey: getTopicsListTopicsQueryKey(workspaceId, channelId),
      }),
    ]);
  };

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
  if (channel.isPending || topic.isPending) {
    content = (
      <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <p className="text-muted-foreground" role="status">
          Opening Topic…
        </p>
      </div>
    );
  } else if (channel.isError || topic.isError) {
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
      <>
        <TopicHeader
          channelId={channelId}
          channelName={displayName}
          headingRef={topicHeading}
          replyCount={Math.max(0, topic.data.messages.length - 1)}
          title={topic.data.title}
          workspaceId={workspaceId}
        />

        <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-24">
          <header className="border-b pb-8">
            {topic.data.intent === undefined ? null : (
              <span className="inline-flex rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                {topicIntentLabel(topic.data.intent)}
              </span>
            )}
            <h2
              ref={topicHeading}
              className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl"
            >
              {topic.data.title}
            </h2>
          </header>

          <TopicMessages
            canReply={channel.data.hasChannelMembership}
            channelId={channelId}
            currentIdentity={workspace.data.identity}
            messages={topic.data.messages}
            refresh={refreshTopic}
            topicId={topicId}
            workspaceId={workspaceId}
          />
        </div>
      </>
    );
  }

  return (
    <ConversationShell
      accountDisplayName={account.data.displayName}
      accountEmail={account.data.email}
      activeChannelId={channelId}
      busy={channel.isPending || topic.isPending}
      identityName={workspace.data.identity.name}
      workspaceId={workspaceId}
      workspaceName={workspace.data.workspace.name}
    >
      {content}
    </ConversationShell>
  );
}
