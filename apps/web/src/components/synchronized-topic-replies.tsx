import { queries, TOPIC_REPLY_PAGE_SIZE } from "@cove/sync";
import { useQuery } from "@rocicorp/zero/react";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  mergeTopicReplies,
  remainingTopicReplyCount,
  sameTopicReplies,
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

interface OlderReplyPageSubscriptionProps extends TopicReplyScope {
  readonly beforePosition: number;
  readonly onComplete: (
    beforePosition: number,
    messages: ReadonlyArray<SynchronizedTopicMessage>,
  ) => void;
  readonly onError: (beforePosition: number, ownership: ReplyPageOwnership) => void;
  readonly ownership: ReplyPageOwnership;
}

function OlderReplyPageSubscription({
  beforePosition,
  channelId,
  onComplete,
  onError,
  ownership,
  topicId,
  workspaceId,
}: OlderReplyPageSubscriptionProps): null {
  const [messages, result] = useQuery(
    queries.messages.replies({ workspaceId, channelId, topicId, beforePosition }),
    { ttl: TOPIC_QUERY_TTL },
  );

  useEffect(() => {
    if (result.type === "complete") {
      onComplete(beforePosition, messages);
    } else if (result.type === "error") {
      onError(beforePosition, ownership);
    }
  }, [beforePosition, messages, onComplete, onError, ownership, result.type]);

  return null;
}

function addUniquePositions(
  current: ReadonlyArray<number>,
  incoming: ReadonlyArray<number>,
): ReadonlyArray<number> {
  const merged = new Set(current);
  for (const position of incoming) {
    merged.add(position);
  }
  return merged.size === current.length ? current : [...merged];
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

function pinnedReplyPagePositions(
  firstPin: number | undefined,
  newestPosition: number | undefined,
): ReadonlyArray<number> {
  if (firstPin === undefined || newestPosition === undefined) return [];

  const positions: Array<number> = [];
  for (let pin = firstPin; pin <= newestPosition + 1; pin += TOPIC_REPLY_PAGE_SIZE) {
    positions.push(pin);
  }
  return positions;
}

interface ReplyPageWindow {
  readonly beforePosition: number;
  readonly ownership: ReplyPageOwnership;
}

function replyPageWindows(
  pinnedBeforePositions: ReadonlyArray<number>,
  olderBeforePositions: ReadonlyArray<number>,
): ReadonlyArray<ReplyPageWindow> {
  const windows = new Map<number, ReplyPageWindow>();
  for (const beforePosition of pinnedBeforePositions) {
    windows.set(beforePosition, { beforePosition, ownership: "retained-live" });
  }
  for (const beforePosition of olderBeforePositions) {
    if (!windows.has(beforePosition)) {
      windows.set(beforePosition, { beforePosition, ownership: "manual-older" });
    }
  }
  return [...windows.values()];
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
  const [pageResults, setPageResults] = useState<
    ReadonlyMap<number, ReadonlyArray<SynchronizedTopicMessage>>
  >(() => new Map());
  const [olderBeforePositions, setOlderBeforePositions] = useState<ReadonlyArray<number>>([]);
  const [firstPinnedBeforePosition, setFirstPinnedBeforePosition] = useState<number>();
  const [pendingBeforePosition, setPendingBeforePosition] = useState<number>();
  const [olderRepliesError, setOlderRepliesError] = useState(false);
  const newestPosition = newestReplyPosition(initialReplies);
  const pinnedBeforePositions = useMemo(
    () => pinnedReplyPagePositions(firstPinnedBeforePosition, newestPosition),
    [firstPinnedBeforePosition, newestPosition],
  );
  const windows = useMemo(
    () => replyPageWindows(pinnedBeforePositions, olderBeforePositions),
    [olderBeforePositions, pinnedBeforePositions],
  );

  const replies = useMemo(() => {
    let ownedReplies = mergeTopicReplies([], initialReplies);
    for (const page of pageResults.values()) {
      ownedReplies = mergeTopicReplies(ownedReplies, page);
    }
    return ownedReplies;
  }, [initialReplies, pageResults]);
  const remainingReplyCount =
    initialResult.type === "complete" ? remainingTopicReplyCount(messageCount, replies) : 0;

  const acceptPage = useCallback(
    (beforePosition: number, messages: ReadonlyArray<SynchronizedTopicMessage>) => {
      setPageResults((current) => {
        const existing = current.get(beforePosition);
        if (existing !== undefined && sameTopicReplies(existing, messages)) {
          return current;
        }
        const next = new Map(current);
        next.set(beforePosition, messages);
        return next;
      });
      setPendingBeforePosition((current) => (current === beforePosition ? undefined : current));
      setOlderRepliesError(false);
    },
    [],
  );
  const rejectPage = useCallback((beforePosition: number, ownership: ReplyPageOwnership) => {
    if (ownership === "manual-older") {
      setOlderBeforePositions((current) =>
        current.filter((position) => position !== beforePosition),
      );
      setPageResults((current) => {
        if (!current.has(beforePosition)) return current;
        const next = new Map(current);
        next.delete(beforePosition);
        return next;
      });
    }
    setPendingBeforePosition((current) => (current === beforePosition ? undefined : current));
    setOlderRepliesError(true);
  }, []);
  const loadOlderReplies = useCallback(() => {
    const beforePosition = replies[0]?.position;
    if (
      beforePosition === undefined ||
      newestPosition === undefined ||
      remainingReplyCount === 0 ||
      pendingBeforePosition !== undefined
    ) {
      return;
    }
    const pinBeforePosition = newestPosition + 1;
    setFirstPinnedBeforePosition((current) => current ?? pinBeforePosition);
    setOlderBeforePositions((current) => addUniquePositions(current, [beforePosition]));
    setPendingBeforePosition(beforePosition);
    setOlderRepliesError(false);
  }, [newestPosition, pendingBeforePosition, remainingReplyCount, replies]);

  return (
    <>
      {windows.map(({ beforePosition, ownership }) => (
        <OlderReplyPageSubscription
          key={beforePosition}
          beforePosition={beforePosition}
          channelId={channelId}
          onComplete={acceptPage}
          onError={rejectPage}
          ownership={ownership}
          topicId={topicId}
          workspaceId={workspaceId}
        />
      ))}
      {children({
        initialResultType: initialResult.type,
        isLoadingOlderReplies: pendingBeforePosition !== undefined,
        loadOlderReplies,
        olderRepliesError,
        remainingReplyCount,
        replies,
      })}
    </>
  );
}
