import { describe, expect, it } from "vite-plus/test";
import { handleCoveQueryRequest } from "../src/server.ts";

describe("Cove Zero query handler", () => {
  it("returns an authorized server-mapped query for zero-cache", async () => {
    const request = new Request("http://api.test/api/zero/query", {
      method: "POST",
      body: JSON.stringify([
        "transform",
        [
          {
            id: "query-1",
            name: "topics.byId",
            args: [
              {
                workspaceId: "workspace-1",
                channelId: "channel-1",
                topicId: "topic-1",
              },
            ],
          },
        ],
      ]),
      headers: { "content-type": "application/json" },
    });

    const response = await handleCoveQueryRequest({
      request,
      userID: "account-1",
    });

    expect(response).toMatchObject({
      kind: "QueryResponse",
      userID: "account-1",
      queries: [
        {
          id: "query-1",
          name: "topics.byId",
          ast: { table: "topics" },
        },
      ],
    });
    expect(JSON.stringify(response)).toContain("account-1");
  });
});
