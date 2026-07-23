import { Link } from "@tanstack/react-router";
import { type ReactElement, type RefObject, useEffect, useState } from "react";

interface TopicHeaderProps {
  readonly channelId: string;
  readonly channelName: string;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly replyCount: number;
  readonly title: string;
  readonly workspaceId: string;
}

const stickyHeaderHeight = 64;

const replyCountLabel = (replyCount: number): string =>
  `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`;

export function TopicHeader({
  channelId,
  channelName,
  headingRef,
  replyCount,
  title,
  workspaceId,
}: TopicHeaderProps): ReactElement {
  const [showTitle, setShowTitle] = useState(false);

  useEffect(() => {
    const heading = headingRef.current;
    if (heading === null) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) return;

        setShowTitle(
          !entry.isIntersecting && entry.boundingClientRect.bottom <= stickyHeaderHeight,
        );
      },
      {
        rootMargin: `-${stickyHeaderHeight}px 0px 0px 0px`,
        threshold: 0,
      },
    );
    observer.observe(heading);
    return () => observer.disconnect();
  }, [headingRef]);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto grid h-16 w-full max-w-7xl grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 px-5 sm:px-8 lg:px-12">
        <Link
          className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          to="/workspaces/$workspaceId/channels/$channelId"
          params={{ workspaceId, channelId }}
          aria-label={`Back to ${channelName}`}
        >
          <span aria-hidden="true">←</span>
          <span className="truncate">{channelName}</span>
        </Link>

        <p
          className={`truncate text-center text-base font-semibold transition-all duration-200 motion-reduce:transition-none ${
            showTitle ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
          }`}
          aria-hidden="true"
        >
          {title}
        </p>

        <p className="justify-self-end whitespace-nowrap text-xs text-muted-foreground">
          {replyCountLabel(replyCount)}
        </p>
      </div>
    </header>
  );
}
