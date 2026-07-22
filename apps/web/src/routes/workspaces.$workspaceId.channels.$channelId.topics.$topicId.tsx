import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import {
  useAuthMe,
  useChannelsGetChannel,
  useTopicsGetTopic,
  useWorkspacesGetWorkspace,
} from "../api/generated/cove-app.ts";
import { channelDisplayName } from "../channel-display-name.ts";
import { ConversationShell } from "../components/conversation-shell.tsx";
import { PageMessage } from "../components/page-message.tsx";
import { topicIntentLabel } from "../topic-intent.ts";

export const Route = createFileRoute(
  "/workspaces/$workspaceId/channels/$channelId/topics/$topicId",
)({ component: TopicPage });

function TopicPage(): ReactElement {
  const { workspaceId, channelId, topicId } = Route.useParams();
  const account = useAuthMe({ query: { retry: false } });
  const workspace = useWorkspacesGetWorkspace(workspaceId, { query: { retry: false } });
  const channel = useChannelsGetChannel(workspaceId, channelId, { query: { retry: false } });
  const topic = useTopicsGetTopic(workspaceId, channelId, topicId, { query: { retry: false } });

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
      <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-24">
        <Link
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
          to="/workspaces/$workspaceId/channels/$channelId"
          params={{ workspaceId, channelId }}
        >
          ← Back to {displayName}
        </Link>

        <header className="border-b pb-8 pt-8">
          {topic.data.intent === undefined ? null : (
            <span className="inline-flex rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              {topicIntentLabel(topic.data.intent)}
            </span>
          )}
          <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            {topic.data.title}
          </h2>
        </header>

        <ol className="divide-y" aria-label="Topic contributions">
          {topic.data.contributions.map((contribution, index) => (
            <li key={contribution.id} className="py-8">
              <article aria-labelledby={`contribution-${contribution.id}`}>
                <header className="flex items-center gap-3">
                  <img
                    className="size-10 rounded-full border border-border bg-muted object-cover"
                    src={contribution.author.avatarUrl}
                    alt=""
                  />
                  <div>
                    <h3 id={`contribution-${contribution.id}`} className="font-semibold">
                      {index === 0 ? "Opening Brief" : `Contribution ${index + 1}`}
                    </h3>
                    <p className="text-sm text-muted-foreground">{contribution.author.name}</p>
                  </div>
                </header>
                <p className="mt-5 whitespace-pre-wrap text-base leading-7 text-foreground/90">
                  {contribution.body}
                </p>
              </article>
            </li>
          ))}
        </ol>
      </div>
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
