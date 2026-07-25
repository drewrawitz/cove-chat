import { describe, expect, it } from "vite-plus/test";
import {
  CoveQueryRequestTooLargeError,
  handleCoveQueryRequest,
  InvalidCoveQueryRequestError,
} from "../src/server.ts";

const queryRequest = (name: string, args: unknown) =>
  new Request("http://api.test/api/zero/query", {
    method: "POST",
    body: JSON.stringify([
      "transform",
      [
        {
          id: "query-1",
          name,
          args: [args],
        },
      ],
    ]),
    headers: { "content-type": "application/json" },
  });

describe("Cove Zero query handler", () => {
  it("returns an authorized server-mapped query for zero-cache", async () => {
    const response = await handleCoveQueryRequest({
      request: queryRequest("topics.byId", {
        workspaceId: "workspace-1",
        channelId: "channel-1",
        topicId: "topic-1",
      }),
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

  it("tags unknown named queries as invalid client requests", async () => {
    const response = handleCoveQueryRequest({
      request: queryRequest("topics.missing", {}),
      userID: "account-1",
    });

    await expect(response).rejects.toMatchObject({
      _tag: "CoveQueryRequest.Invalid",
      reason: "QueryNotFound",
    } satisfies Partial<InvalidCoveQueryRequestError>);
  });

  it("tags invalid named-query arguments as invalid client requests", async () => {
    const response = handleCoveQueryRequest({
      request: queryRequest("topics.byId", {
        workspaceId: "workspace-1",
        channelId: "channel-1",
      }),
      userID: "account-1",
    });

    await expect(response).rejects.toMatchObject({
      _tag: "CoveQueryRequest.Invalid",
      reason: "InputValidation",
    } satisfies Partial<InvalidCoveQueryRequestError>);
  });

  it("rejects a Zero query body above 256 KiB before consuming it", async () => {
    const request = queryRequest("topics.byId", {
      workspaceId: "workspace-1",
      channelId: "channel-1",
      topicId: "topic-1",
    });
    const oversized = new Request(request, {
      headers: {
        ...Object.fromEntries(request.headers),
        "content-length": String(256 * 1024 + 1),
      },
    });

    await expect(
      handleCoveQueryRequest({ request: oversized, userID: "account-1" }),
    ).rejects.toBeInstanceOf(CoveQueryRequestTooLargeError);
    expect(oversized.bodyUsed).toBe(false);
  });

  it("cancels an undeclared oversized stream without pulling the complete body", async () => {
    let chunksPulled = 0;
    const requestOptions: RequestInit & { readonly duplex: "half" } = {
      method: "POST",
      body: new ReadableStream({
        pull(controller) {
          chunksPulled += 1;
          if (chunksPulled <= 10) controller.enqueue(new Uint8Array(64 * 1024));
          else controller.close();
        },
      }),
      duplex: "half",
      headers: { "content-type": "application/json" },
    };
    const request = new Request("http://api.test/api/zero/query", requestOptions);

    await expect(handleCoveQueryRequest({ request, userID: "account-1" })).rejects.toBeInstanceOf(
      CoveQueryRequestTooLargeError,
    );
    expect(chunksPulled).toBeLessThan(10);
  });
});
