/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { TopicHeader } from "./topic-header.tsx";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { readonly children: ReactNode }) => (
    <a href="/workspaces/workspace-1/channels/channel-1" {...props}>
      {children}
    </a>
  ),
}));

let notifyIntersection: IntersectionObserverCallback;
const disconnect = vi.fn();
const observe = vi.fn();

beforeEach(() => {
  disconnect.mockClear();
  observe.mockClear();

  class MockIntersectionObserver {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      notifyIntersection = callback;
      expect(options).toEqual({
        rootMargin: "-64px 0px 0px 0px",
        threshold: 0,
      });
    }

    disconnect = disconnect;
    observe = observe;
  }

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderHeader = () => {
  const headingRef = createRef<HTMLHeadingElement>();
  headingRef.current = document.createElement("h2");

  render(
    <TopicHeader
      channelId="channel-1"
      channelName="General"
      headingRef={headingRef}
      replyCount={4}
      title="A concise launch plan"
      workspaceId="workspace-1"
    />,
  );

  return { headingRef };
};

const intersectionEntry = (
  isIntersecting: boolean,
  headingBottom: number,
): IntersectionObserverEntry =>
  ({
    boundingClientRect: { bottom: headingBottom },
    isIntersecting,
  }) as IntersectionObserverEntry;

test("keeps the channel breadcrumb and reply count visible", () => {
  const { headingRef } = renderHeader();

  expect(screen.getByRole("link", { name: "Back to General" })).toBeDefined();
  expect(screen.getByText("4 replies")).toBeDefined();
  expect(observe).toHaveBeenCalledWith(headingRef.current);
});

test("reveals the compact title only after the page heading passes the sticky rail", () => {
  renderHeader();
  const title = screen.getByText("A concise launch plan");

  expect(title.classList.contains("opacity-0")).toBe(true);

  act(() => {
    notifyIntersection([intersectionEntry(false, 50)], {} as IntersectionObserver);
  });
  expect(title.classList.contains("opacity-100")).toBe(true);

  act(() => {
    notifyIntersection([intersectionEntry(true, 100)], {} as IntersectionObserver);
  });
  expect(title.classList.contains("opacity-0")).toBe(true);
});

test("does not reveal the title when the page heading is below the viewport", () => {
  renderHeader();
  const title = screen.getByText("A concise launch plan");

  act(() => {
    notifyIntersection([intersectionEntry(false, 500)], {} as IntersectionObserver);
  });

  expect(title.classList.contains("opacity-0")).toBe(true);
});
