import { ChannelId, TopicId, UserId, WorkspaceId } from "@cove/domain";
import { Option, Redacted } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { makeTopicArchiveCursorCodec } from "../../src/topics/topic-archive-cursor.ts";

const cursor = {
  version: 1 as const,
  actorAccountId: UserId.make("account-1"),
  workspaceId: WorkspaceId.make("workspace-1"),
  channelId: ChannelId.make("channel-1"),
  afterLastActivityAt: new Date("2026-07-24T12:00:00.000Z"),
  afterTopicId: TopicId.make("topic-500"),
};
const scope = {
  actorAccountId: cursor.actorAccountId,
  workspaceId: cursor.workspaceId,
  channelId: cursor.channelId,
};
const codec = makeTopicArchiveCursorCodec(
  Redacted.make("test-only-topic-archive-cursor-signing-key"),
);

describe("Topic archive cursor", () => {
  it("round-trips a signed scope-bound keyset without server-side state", () => {
    const decoded = codec.decodeForScope(codec.encode(cursor), scope);

    expect(Option.getOrUndefined(decoded)).toEqual(cursor);
  });

  it("rejects malformed and structurally invalid cursors", () => {
    const wrongVersion = codec.encode({ ...cursor, version: 2 as 1 });

    expect(Option.isNone(codec.decodeForScope("not-a-cursor", scope))).toBe(true);
    expect(Option.isNone(codec.decodeForScope(wrongVersion, scope))).toBe(true);
  });

  it("rejects a valid cursor outside its authorized request scope", () => {
    const encoded = codec.encode(cursor);

    expect(
      Option.isNone(
        codec.decodeForScope(encoded, {
          actorAccountId: UserId.make("another-account"),
          workspaceId: cursor.workspaceId,
          channelId: cursor.channelId,
        }),
      ),
    ).toBe(true);
  });

  it("rejects a cursor whose keyset payload was changed by the client", () => {
    const [payload, signature] = codec.encode(cursor).split(".");
    const decodedPayload = JSON.parse(
      Buffer.from(payload ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...decodedPayload, afterTopicId: "topic-1" }),
      "utf8",
    ).toString("base64url");

    expect(Option.isNone(codec.decodeForScope(`${tamperedPayload}.${signature}`, scope))).toBe(
      true,
    );
  });
});
