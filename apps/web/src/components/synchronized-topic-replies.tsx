import { queries, TOPIC_REPLY_PAGE_SIZE } from "@cove/sync";
import { useQuery } from "@rocicorp/zero/react";
import { type ReactElement, type ReactNode, useMemo, useState } from "react";
import {
  mergeTopicReplies,
  remainingTopicReplyCount,
  type SynchronizedTopicMessage,
} from "../topic-sync.ts";

export const TOPIC_QUERY_TTL = "5m" as const;

interface TopicReplyScope {
  readonly workspaceId: string;
  readonly channelId: string;
  readonly topicId: string;
}

export interface SynchronizedTopicReplyState {
  readonly initialResultType: "unknown" | "complete" | "error";
  readonly isLoadingOlderReplies: boolean;
  readonly loadOlderReplies: () => void;
  readonly olderRepliesError: boolean;
  readonly remainingReplyCount: number;
  readonly replies: ReadonlyArray<SynchronizedTopicMessage>;
}

interface SynchronizedTopicRepliesProps extends TopicReplyScope {
  readonly children: (state: SynchronizedTopicReplyState) => ReactNode;
  readonly messageCount: number;
}

type ReplyPageOwnership = "retained-live" | "manual-older";

interface ReplyPageWindow {
  readonly beforePosition: number;
  readonly ownership: ReplyPageOwnership;
  readonly requestId: number;
}

interface ReplyPageSnapshot extends ReplyPageWindow {
  readonly messages: ReadonlyArray<SynchronizedTopicMessage>;
  readonly resultType: SynchronizedTopicReplyState["initialResultType"];
}

interface ReplyPageSubscriptionProps extends TopicReplyScope {
  readonly children: (snapshot: ReplyPageSnapshot) => ReactNode;
  readonly pageWindow: ReplyPageWindow;
}

function ReplyPageSubscription({
  channelId,
  children,
  pageWindow,
  topicId,
  workspaceId,
}: ReplyPageSubscriptionProps): ReactElement {
  const [messages, result] = useQuery(
    queries.messages.replies({
      workspaceId,
      channelId,
      topicId,
      beforePosition: pageWindow.beforePosition,
    }),
    { ttl: TOPIC_QUERY_TTL },
  );

  return (
    <>
      {children({
        ...pageWindow,
        messages,
        resultType: result.type,
      })}
    </>
  );
}

interface ReplyPageSubscriptionsProps extends TopicReplyScope {
  readonly children: (snapshots: ReadonlyArray<ReplyPageSnapshot>) => ReactNode;
  readonly index?: number;
  readonly snapshots?: ReadonlyArray<ReplyPageSnapshot>;
  readonly windows: ReadonlyArray<ReplyPageWindow>;
}

function ReplyPageSubscriptions({
  channelId,
  children,
  index = 0,
  snapshots = [],
  topicId,
  windows,
  workspaceId,
}: ReplyPageSubscriptionsProps): ReactElement {
  const pageWindow = windows[index];
  if (pageWindow === undefined) {
    return <>{children(snapshots)}</>;
  }

  return (
    <ReplyPageSubscription
      key={`${pageWindow.beforePosition}:${pageWindow.requestId}`}
      channelId={channelId}
      pageWindow={pageWindow}
      topicId={topicId}
      workspaceId={workspaceId}
    >
      {(snapshot) => (
        <ReplyPageSubscriptions
          channelId={channelId}
          index={index + 1}
          snapshots={[...snapshots, snapshot]}
          topicId={topicId}
          windows={windows}
          workspaceId={workspaceId}
        >
          {children}
        </ReplyPageSubscriptions>
      )}
    </ReplyPageSubscription>
  );
}

function newestReplyPosition(replies: ReadonlyArray<SynchronizedTopicMessage>): number | undefined {
  let newest: number | undefined;
  for (const reply of replies) {
    if (reply.position > 1 && (newest === undefined || reply.position > newest)) {
      newest = reply.position;
    }
  }
  return newest;
}

function replyPageWindowKey(pageWindow: ReplyPageWindow): string {
  return `${pageWindow.ownership}:${pageWindow.beforePosition}:${pageWindow.requestId}`;
}

function withAutomaticRetainedWindows(
  ownedWindows: ReadonlyArray<ReplyPageWindow>,
  newestPosition: number | undefined,
): ReadonlyArray<ReplyPageWindow> {
  if (newestPosition === undefined) return ownedWindows;

  let latestRetainedBoundary: number | undefined;
  for (const pageWindow of ownedWindows) {
    if (
      pageWindow.ownership === "retained-live" &&
      (latestRetainedBoundary === undefined || pageWindow.beforePosition > latestRetainedBoundary)
    ) {
      latestRetainedBoundary = pageWindow.beforePosition;
    }
  }
  if (latestRetainedBoundary === undefined) return ownedWindows;

  const windows = [...ownedWindows];
  for (
    let beforePosition = latestRetainedBoundary + TOPIC_REPLY_PAGE_SIZE;
    beforePosition <= newestPosition + 1;
    beforePosition += TOPIC_REPLY_PAGE_SIZE
  ) {
    windows.push({ beforePosition, ownership: "retained-live", requestId: 0 });
  }
  return windows;
}

interface SynchronizedTopicReplyContentProps {
  readonly children: (state: SynchronizedTopicReplyState) => ReactNode;
  readonly initialReplies: ReadonlyArray<SynchronizedTopicMessage>;
  readonly initialResultType: SynchronizedTopicReplyState["initialResultType"];
  readonly messageCount: number;
  readonly newestPosition: number | undefined;
  readonly replaceOwnedWindows: (windows: ReadonlyArray<ReplyPageWindow>) => void;
  readonly snapshots: ReadonlyArray<ReplyPageSnapshot>;
  readonly windows: ReadonlyArray<ReplyPageWindow>;
}

function SynchronizedTopicReplyContent({
  children,
  initialReplies,
  initialResultType,
  messageCount,
  newestPosition,
  replaceOwnedWindows,
  snapshots,
  windows,
}: SynchronizedTopicReplyContentProps): ReactElement {
  const isLoadingOlderReplies = snapshots.some(({ resultType }) => resultType === "unknown");
  const failedWindowKeys = new Set<string>();
  for (const snapshot of snapshots) {
    if (snapshot.resultType === "error") {
      failedWindowKeys.add(replyPageWindowKey(snapshot));
    }
  }
  const olderRepliesError = failedWindowKeys.size > 0;

  const replies = useMemo(() => {
    const pageReplies: Array<SynchronizedTopicMessage> = [];
    for (const snapshot of snapshots) {
      if (snapshot.resultType === "complete") {
        pageReplies.push(...snapshot.messages);
      }
    }
    return mergeTopicReplies(initialReplies, pageReplies);
  }, [initialReplies, snapshots]);
  const remainingReplyCount =
    initialResultType === "complete" ? remainingTopicReplyCount(messageCount, replies) : 0;

  const loadOlderReplies = (): void => {
    if (isLoadingOlderReplies) return;

    if (olderRepliesError) {
      replaceOwnedWindows(
        windows.map((pageWindow) =>
          failedWindowKeys.has(replyPageWindowKey(pageWindow))
            ? { ...pageWindow, requestId: pageWindow.requestId + 1 }
            : pageWindow,
        ),
      );
      return;
    }

    const beforePosition = replies[0]?.position;
    if (beforePosition === undefined || newestPosition === undefined || remainingReplyCount === 0) {
      return;
    }

    const nextWindows = [...windows];
    if (!windows.some(({ ownership }) => ownership === "retained-live")) {
      nextWindows.push({
        beforePosition: newestPosition + 1,
        ownership: "retained-live",
        requestId: 0,
      });
    }
    if (!windows.some((pageWindow) => pageWindow.beforePosition === beforePosition)) {
      nextWindows.push({ beforePosition, ownership: "manual-older", requestId: 0 });
    }
    replaceOwnedWindows(nextWindows);
  };

  return (
    <>
      {children({
        initialResultType,
        isLoadingOlderReplies,
        loadOlderReplies,
        olderRepliesError,
        remainingReplyCount,
        replies,
      })}
    </>
  );
}

export function SynchronizedTopicReplies({
  channelId,
  children,
  messageCount,
  topicId,
  workspaceId,
}: SynchronizedTopicRepliesProps): ReactElement {
  const [initialReplies, initialResult] = useQuery(
    queries.messages.replies({ workspaceId, channelId, topicId }),
    { ttl: TOPIC_QUERY_TTL },
  );
  const [ownedWindows, setOwnedWindows] = useState<ReadonlyArray<ReplyPageWindow>>([]);
  const newestPosition = newestReplyPosition(initialReplies);
  const windows = useMemo(
    () => withAutomaticRetainedWindows(ownedWindows, newestPosition),
    [newestPosition, ownedWindows],
  );

  return (
    <ReplyPageSubscriptions
      channelId={channelId}
      topicId={topicId}
      windows={windows}
      workspaceId={workspaceId}
    >
      {(snapshots) => (
        <SynchronizedTopicReplyContent
          initialReplies={initialReplies}
          initialResultType={initialResult.type}
          messageCount={messageCount}
          newestPosition={newestPosition}
          replaceOwnedWindows={setOwnedWindows}
          snapshots={snapshots}
          windows={windows}
        >
          {children}
        </SynchronizedTopicReplyContent>
      )}
    </ReplyPageSubscriptions>
  );
}
