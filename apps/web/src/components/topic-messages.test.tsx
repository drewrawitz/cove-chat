import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vite-plus/test";
import { SnackbarProvider } from "./snackbar.tsx";
import { TopicMessages } from "./topic-messages.tsx";

vi.mock("../api/generated/cove-app.ts", () => {
  const mutation = () => ({
    isPending: false,
    isError: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  });

  return {
    useTopicsAddMessage: mutation,
    useTopicsDeleteMessage: mutation,
    useTopicsEditMessage: mutation,
  };
});

test("identifies messages by author and timestamp instead of a numbered heading", () => {
  const markup = renderToStaticMarkup(
    <SnackbarProvider>
      <TopicMessages
        canReply
        channelId="channel-1"
        currentIdentityId="identity-1"
        messages={[
          {
            id: "message-1",
            body: "Capture the remaining launch risks.",
            position: 1,
            createdAt: "2026-07-22T19:15:00.000Z",
            edited: true,
            deleted: false,
            author: {
              id: "identity-1",
              name: "Bob in Cove",
              avatarUrl: "/avatars/bob.svg",
            },
          },
          {
            id: "message-2",
            body: "A repeated reply.",
            position: 2,
            createdAt: "2026-07-22T19:15:20.000Z",
            edited: false,
            deleted: false,
            author: {
              id: "identity-1",
              name: "Bob in Cove",
              avatarUrl: "/avatars/bob.svg",
            },
          },
          {
            id: "message-3",
            body: "A repeated reply.",
            position: 3,
            createdAt: "2026-07-22T19:15:40.000Z",
            edited: false,
            deleted: false,
            author: {
              id: "identity-1",
              name: "Bob in Cove",
              avatarUrl: "/avatars/bob.svg",
            },
          },
        ]}
        refresh={() => Promise.resolve()}
        topicId="topic-1"
        workspaceId="workspace-1"
      />
    </SnackbarProvider>,
  );

  expect(markup).toContain(">Bob in Cove</h3>");
  expect(markup).toContain('dateTime="2026-07-22T19:15:00.000Z"');
  expect(markup).toContain("Jul 22, 2026, 7:15 PM UTC");
  expect(markup).toContain(
    'aria-label="More actions for opening brief by Bob in Cove, Jul 22, 2026, 7:15 PM UTC: Capture the remaining launch risks."',
  );
  expect(markup).toContain("More actions for reply 1 by Bob in Cove");
  expect(markup).toContain("More actions for reply 2 by Bob in Cove");
  expect(markup).toContain(">Write a reply</label>");
  expect(markup).not.toContain(">Opening Brief</h3>");
  expect(markup).not.toContain("Message 1");
});
