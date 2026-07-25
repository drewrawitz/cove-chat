import { Button } from "@cove/ui/components/button";
import {
  CHANNEL_TOPIC_LIVE_INCREMENT,
  CHANNEL_TOPIC_LIVE_INITIAL,
  CHANNEL_TOPIC_LIVE_MAXIMUM,
  queries,
  type ChannelTopicLiveLimit,
} from "@cove/sync";
import { useQuery } from "@rocicorp/zero/react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { type ReactElement, useMemo, useState } from "react";
import {
  getChannelsGetChannelQueryKey,
  getChannelsListPublicChannelsQueryKey,
  topicsListArchivedTopics,
  useAuthMe,
  useChannelsGetChannel,
  useChannelsJoinPublicChannel,
  useWorkspacesGetWorkspace,
} from "../api/generated/cove-app.ts";
import { channelDisplayName } from "../channel-display-name.ts";
import { ChannelLoading } from "../components/channel-loading.tsx";
import { PageMessage } from "../components/page-message.tsx";
import { ChannelMembership } from "../components/channel-membership.tsx";
import { LeaveChannel } from "../components/leave-channel.tsx";
import { ConversationShell } from "../components/conversation-shell.tsx";
import { CreateTopic } from "../components/create-topic.tsx";
import { LocalTimestamp } from "../components/local-timestamp.tsx";
import { useJoinChannel } from "../components/use-join-channel.ts";
import {
  combineTopicSummaries,
  completeTopicArchiveRequest,
  failTopicArchiveRequest,
  initialTopicArchivePagination,
  startTopicArchiveRequest,
  synchronizedTopicSummaries,
  type TopicSummaryView,
} from "../topic-sync.ts";
import { isWorkspaceAdministrator } from "../workspace-role.ts";
import { topicIntentLabel } from "../topic-intent.ts";

export const Route = createFileRoute("/workspaces/$workspaceId/channels/$channelId/")({
  component: ChannelPage,
  remountDeps: ({ params }) => ({
    workspaceId: params.workspaceId,
    channelId: params.channelId,
  }),
});

function ChannelPage(): ReactElement {
  const { workspaceId, channelId } = Route.useParams();
  const account = useAuthMe({ query: { retry: false } });
  const workspace = useWorkspacesGetWorkspace(workspaceId, { query: { retry: false } });
  const channel = useChannelsGetChannel(workspaceId, channelId, {
    query: { retry: false },
  });
  const joinChannelMutation = useChannelsJoinPublicChannel();
  const [liveTopicLimit, setLiveTopicLimit] = useState<ChannelTopicLiveLimit>(
    CHANNEL_TOPIC_LIVE_INITIAL,
  );
  const [archivedTopics, setArchivedTopics] = useState<ReadonlyArray<TopicSummaryView>>([]);
  const [archive, setArchive] = useState(initialTopicArchivePagination);
  const [synchronizedTopics, synchronizedTopicsResult] = useQuery(
    queries.topics.inChannel({ workspaceId, channelId, limit: liveTopicLimit }),
  );
  const liveTopics = useMemo(
    () => synchronizedTopicSummaries(synchronizedTopics),
    [synchronizedTopics],
  );
  const topics = useMemo(
    () => combineTopicSummaries(liveTopics, archivedTopics),
    [archivedTopics, liveTopics],
  );
  const joinChannel = useJoinChannel({
    queriesToInvalidate: [
      getChannelsGetChannelQueryKey(workspaceId, channelId),
      getChannelsListPublicChannelsQueryKey(workspaceId),
    ],
    successMessage: (channelName) => `You joined ${channelName}.`,
  });

  if (account.isPending || workspace.isPending) {
    return <PageMessage message="Opening workspace…" theme="dark" />;
  }
  if (account.isError) {
    return <PageMessage message="Cove could not load your account." theme="dark" />;
  }
  if (workspace.isError) {
    return (
      <PageMessage message="This channel is not available in this workspace." theme="dark">
        <Link
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          to="/workspaces/$workspaceId"
          params={{ workspaceId }}
        >
          Return to workspace management
        </Link>
      </PageMessage>
    );
  }

  const join = (displayName: string): void => {
    joinChannelMutation.mutate(
      { workspaceId, channelId },
      {
        onSuccess: () => joinChannel.onJoined(displayName),
      },
    );
  };

  const loadOlderTopics = (): void => {
    if (liveTopicLimit < CHANNEL_TOPIC_LIVE_MAXIMUM) {
      setLiveTopicLimit(
        Math.min(
          liveTopicLimit + CHANNEL_TOPIC_LIVE_INCREMENT,
          CHANNEL_TOPIC_LIVE_MAXIMUM,
        ) as ChannelTopicLiveLimit,
      );
      return;
    }

    if (!archive.started) {
      setArchivedTopics((current) => combineTopicSummaries(liveTopics, current));
    }
    setArchive((current) => startTopicArchiveRequest(current));
    void topicsListArchivedTopics(
      workspaceId,
      channelId,
      archive.cursor === undefined ? {} : { cursor: archive.cursor },
    )
      .then((page) => {
        setArchivedTopics((current) => combineTopicSummaries(current, page.topics));
        setArchive(completeTopicArchiveRequest(page.nextCursor));
      })
      .catch(() => setArchive(failTopicArchiveRequest()));
  };

  const canExpandLiveWindow =
    liveTopicLimit < CHANNEL_TOPIC_LIVE_MAXIMUM && synchronizedTopics.length === liveTopicLimit;
  const canLoadArchive =
    liveTopicLimit === CHANNEL_TOPIC_LIVE_MAXIMUM &&
    synchronizedTopics.length === CHANNEL_TOPIC_LIVE_MAXIMUM &&
    (!archive.started || archive.cursor !== undefined);

  let channelContent: ReactElement;
  if (channel.isPending) {
    channelContent = <ChannelLoading />;
  } else if (channel.isError) {
    channelContent = (
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:pt-24 xl:px-16">
        <p className="text-muted-foreground" role="status">
          This channel is not available in this workspace.
        </p>
        <Link
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          to="/workspaces/$workspaceId"
          params={{ workspaceId }}
        >
          Return to workspace management
        </Link>
      </div>
    );
  } else {
    const displayName = channelDisplayName(channel.data.name);
    const isPrivateMaintainer =
      channel.data.visibility === "private" &&
      channel.data.maintainer.id === workspace.data.identity.id;
    channelContent = (
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:pt-24 xl:px-16">
        <header className="flex flex-wrap items-start justify-between gap-6 pb-10">
          <div className="min-w-0 flex-1">
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">{displayName}</h2>
            <p className="mt-3 max-w-3xl text-base text-muted-foreground sm:text-lg">
              {channel.data.visibility === "private" ? "Private" : "Public"}{" "}
              <span aria-hidden="true">·</span> {channel.data.purpose}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Maintained by {channel.data.maintainer.name}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ChannelMembership
              canAdminister={
                isWorkspaceAdministrator(workspace.data.membership.role) ||
                channel.data.maintainer.id === workspace.data.identity.id
              }
              channelId={channelId}
              channelName={displayName}
              currentIdentityId={workspace.data.identity.id}
              visibility={channel.data.visibility}
              workspaceId={workspaceId}
            />
            <img
              className="size-10 rounded-full border border-border bg-muted object-cover"
              src={channel.data.maintainer.avatarUrl}
              alt=""
            />
            {channel.data.hasChannelMembership && !isPrivateMaintainer ? (
              <LeaveChannel
                channelId={channelId}
                channelName={displayName}
                generalChannelId={workspace.data.generalChannelId}
                visibility={channel.data.visibility}
                willLoseAccess={
                  channel.data.visibility === "private" ||
                  workspace.data.membership.role === "guest"
                }
                workspaceId={workspaceId}
              />
            ) : channel.data.hasChannelMembership ? (
              <span className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground">
                Joined
              </span>
            ) : channel.data.visibility === "public" ? (
              <Button
                type="button"
                size="lg"
                disabled={joinChannelMutation.isPending}
                onClick={() => join(displayName)}
              >
                {joinChannelMutation.isPending ? "Joining…" : "Join channel"}
              </Button>
            ) : null}
          </div>
        </header>

        {channel.data.visibility === "public" && joinChannelMutation.isError ? (
          <p className="-mt-6 mb-6 text-sm text-destructive" role="alert">
            Cove could not join this channel. Refresh and try again.
          </p>
        ) : null}

        <section aria-labelledby="topics-heading">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
            <h3 id="topics-heading" className="text-lg font-semibold">
              Topics
            </h3>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{topics.length} open</span>
              {channel.data.hasChannelMembership ? (
                <CreateTopic channelId={channelId} workspaceId={workspaceId} />
              ) : null}
            </div>
          </div>
          <TopicList
            channelId={channelId}
            isError={synchronizedTopicsResult.type === "error"}
            isPending={synchronizedTopicsResult.type === "unknown" && topics.length === 0}
            topics={topics}
            workspaceId={workspaceId}
          />
          {canExpandLiveWindow || canLoadArchive || archive.error ? (
            <div className="flex flex-col items-center gap-3 border-b px-4 py-6">
              {canExpandLiveWindow || canLoadArchive ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={archive.pending}
                  onClick={loadOlderTopics}
                >
                  {archive.pending ? "Loading older Topics…" : "Load older Topics"}
                </Button>
              ) : null}
              {archive.error ? (
                <p className="text-sm text-destructive" role="alert">
                  Older Topics are unavailable. Try again.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <ConversationShell
      accountDisplayName={account.data.displayName}
      accountEmail={account.data.email}
      activeChannelId={channelId}
      busy={
        channel.isPending || (synchronizedTopicsResult.type === "unknown" && topics.length === 0)
      }
      identityName={workspace.data.identity.name}
      workspaceId={workspaceId}
      workspaceName={workspace.data.workspace.name}
    >
      {channelContent}
    </ConversationShell>
  );
}

interface TopicListProps {
  readonly channelId: string;
  readonly isError: boolean;
  readonly isPending: boolean;
  readonly topics: ReadonlyArray<TopicSummaryView>;
  readonly workspaceId: string;
}

function TopicList({
  channelId,
  isError,
  isPending,
  topics,
  workspaceId,
}: TopicListProps): ReactElement {
  if (isPending) {
    return (
      <p className="border-b px-4 py-12 text-center text-sm text-muted-foreground" role="status">
        Loading Topics…
      </p>
    );
  }
  if (isError) {
    return (
      <p className="border-b px-4 py-12 text-center text-sm text-destructive" role="alert">
        Topics are unavailable.
      </p>
    );
  }
  if (topics.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center border-b px-6 py-16 text-center">
        <span
          className="flex size-12 items-center justify-center rounded-full border border-border bg-muted/30 text-xl text-muted-foreground"
          aria-hidden="true"
        >
          ◌
        </span>
        <h4 className="mt-5 text-lg font-semibold">No Topics yet</h4>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Conversations in Cove begin with a named Topic and an Opening Brief.
        </p>
      </div>
    );
  }

  return (
    <ol className="divide-y border-b">
      {topics.map((topic) => (
        <li key={topic.id}>
          <Link
            to="/workspaces/$workspaceId/channels/$channelId/topics/$topicId"
            params={{ workspaceId, channelId, topicId: topic.id }}
            className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-5 transition-colors hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:px-6"
          >
            <img
              className="size-10 rounded-full border border-border bg-muted object-cover"
              src={topic.latestMessage.author.avatarUrl}
              alt=""
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="truncate text-base font-semibold group-hover:text-primary">
                  {topic.title}
                </h4>
                {topic.intent === undefined ? null : (
                  <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {topicIntentLabel(topic.intent)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {topic.messageCount} {topic.messageCount === 1 ? "message" : "messages"}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {topic.latestMessage.author.name}
                </span>
                <span aria-hidden="true">: </span>
                <span>
                  {topic.latestMessage.deleted ? "Message deleted" : topic.latestMessage.preview}
                </span>
              </p>
            </div>
            <LocalTimestamp
              className="text-xs tabular-nums text-muted-foreground"
              mode="relative"
              value={topic.lastActivityAt}
            />
          </Link>
        </li>
      ))}
    </ol>
  );
}
