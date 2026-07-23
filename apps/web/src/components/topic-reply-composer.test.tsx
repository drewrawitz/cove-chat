/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { TopicReplyComposer } from "./topic-reply-composer.tsx";

const identity = {
  name: "Drew Rawitz",
  avatarUrl: "/avatars/drew.svg",
};

afterEach(() => {
  cleanup();
});

test("starts collapsed and expands from the reply bar", () => {
  render(<TopicReplyComposer identity={identity} onPost={vi.fn()} />);

  expect(screen.queryByLabelText("Write a reply")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));

  expect(screen.getByLabelText("Write a reply")).toBe(document.activeElement);
});

test("expands with R without hijacking editable controls", () => {
  render(
    <>
      <input aria-label="Another field" />
      <TopicReplyComposer identity={identity} onPost={vi.fn()} />
    </>,
  );

  fireEvent.keyDown(window, { key: "r" });
  expect(screen.getByLabelText("Write a reply")).toBe(document.activeElement);

  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  screen.getByLabelText("Another field").focus();
  fireEvent.keyDown(screen.getByLabelText("Another field"), { key: "r" });

  expect(screen.queryByLabelText("Write a reply")).toBeNull();
});

test("discards an empty draft immediately", () => {
  render(<TopicReplyComposer identity={identity} onPost={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));

  expect(screen.queryByLabelText("Write a reply")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("closes an empty composer with Escape", () => {
  render(<TopicReplyComposer identity={identity} onPost={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.keyDown(screen.getByLabelText("Write a reply"), { key: "Escape" });

  expect(screen.queryByLabelText("Write a reply")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("confirms before discarding a nonblank draft", () => {
  render(<TopicReplyComposer identity={identity} onPost={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: "A useful reply" },
  });
  fireEvent.keyDown(screen.getByLabelText("Write a reply"), { key: "Escape" });

  expect(screen.getByRole("heading", { name: "Discard reply?" })).toBeDefined();
  expect(screen.getByRole("dialog").classList.contains("dark")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Keep writing" }));
  expect((screen.getByLabelText("Write a reply") as HTMLTextAreaElement).value).toBe(
    "A useful reply",
  );

  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard reply" }));

  expect(screen.queryByLabelText("Write a reply")).toBeNull();
});

test("posts a trimmed draft and returns to the collapsed bar", async () => {
  const onPost = vi.fn(() => Promise.resolve());
  render(<TopicReplyComposer identity={identity} onPost={onPost} />);

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: "  Ship it  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));

  await waitFor(() => {
    expect(onPost).toHaveBeenCalledWith("Ship it");
    expect(screen.queryByLabelText("Write a reply")).toBeNull();
  });
});

test.each([
  { shortcut: "Command", modifier: { metaKey: true } },
  { shortcut: "Control", modifier: { ctrlKey: true } },
])("posts with $shortcut+Enter", async ({ modifier }) => {
  const onPost = vi.fn(() => Promise.resolve());
  render(<TopicReplyComposer identity={identity} onPost={onPost} />);

  fireEvent.click(screen.getByRole("button", { name: /Reply/ }));
  fireEvent.change(screen.getByLabelText("Write a reply"), {
    target: { value: "Keyboard first" },
  });
  fireEvent.keyDown(screen.getByLabelText("Write a reply"), {
    key: "Enter",
    ...modifier,
  });

  await waitFor(() => {
    expect(onPost).toHaveBeenCalledWith("Keyboard first");
    expect(screen.queryByLabelText("Write a reply")).toBeNull();
  });
});
