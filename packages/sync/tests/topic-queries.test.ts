import { describe, expect, it } from "vite-plus/test";
import { queries } from "../src/queries.ts";

const args = {
  workspaceId: "workspace-1",
  channelId: "channel-1",
  limit: 50,
} as const;
const ctx = { userID: "account-1" };

const queryAst = (query: unknown): { readonly table: string } =>
  (query as { readonly ast: { readonly table: string } }).ast;

describe("authorized Topic queries", () => {
  it("synchronizes only the open private Channel Membership needed to detect access loss", () => {
    const query = queries.access.channelMembership.fn({ args, ctx });
    const ast = queryAst(query);
    const serialized = JSON.stringify(ast);

    expect(ast.table).toBe("channelMembership");
    expect(serialized).toContain(args.workspaceId);
    expect(serialized).toContain(args.channelId);
    expect(serialized).toContain(ctx.userID);
    expect(serialized).toContain("membershipEndedAt");
    expect(serialized).toContain('"limit":1');
    expect(serialized).not.toContain('"name":"visibility"');
    expect(serialized).not.toContain('"alias":"topics"');
  });

  it("scopes a bounded recent Channel window to an active authorized workspace identity", () => {
    const query = queries.topics.inChannel.fn({ args, ctx });
    const ast = queryAst(query);
    const serialized = JSON.stringify(ast);

    expect(ast.table).toBe("topic");
    expect(serialized).toContain(args.workspaceId);
    expect(serialized).toContain(args.channelId);
    expect(serialized).toContain(ctx.userID);
    expect(serialized).toContain("membershipEndedAt");
    expect(serialized).toContain("channelMembership");
    expect(serialized).toContain('"lastActivityAt","desc"');
    expect(serialized).toContain('"id","asc"');
    expect(serialized).toContain('"limit":50');
    expect(serialized).toContain('"alias":"latestMessageAuthor"');
    expect(serialized).not.toContain('"alias":"messages"');
  });

  it("accepts only 50-Topic live-window increments through 500", () => {
    const invoke = (limit: unknown) =>
      queries.topics.inChannel.fn({
        args: { ...args, limit } as never,
        ctx,
      });

    for (let limit = 50; limit <= 500; limit += 50) {
      expect(() => invoke(limit)).not.toThrow();
    }

    for (const limit of [0, 49, 51, 499, 501, 1_000]) {
      expect(() => invoke(limit)).toThrow();
    }
  });

  it("opens one authorized Topic without relating any Messages", () => {
    const query = queries.topics.byId.fn({
      args: { ...args, topicId: "topic-1" },
      ctx,
    });
    const ast = queryAst(query);
    const serialized = JSON.stringify(ast);

    expect(serialized).toContain("topic-1");
    expect(serialized).toContain(args.workspaceId);
    expect(serialized).toContain(args.channelId);
    expect(serialized).toContain(ctx.userID);
    expect(serialized).not.toContain('"alias":"messages"');
  });

  it("loads the authorized Opening Brief exactly once", () => {
    const query = queries.messages.openingBrief.fn({
      args: { ...args, topicId: "topic-1" },
      ctx,
    });
    const ast = queryAst(query);
    const serialized = JSON.stringify(ast);

    expect(ast.table).toBe("message");
    expect(serialized).toContain(args.workspaceId);
    expect(serialized).toContain(args.channelId);
    expect(serialized).toContain("topic-1");
    expect(serialized).toContain(ctx.userID);
    expect(serialized).toContain('"name":"position"');
    expect(serialized).toContain('"value":1');
    expect(serialized).toContain('"alias":"author"');
    expect(serialized).toContain('"limit":1');
  });

  it("loads at most 100 Replies before an exclusive immutable position", () => {
    const initial = JSON.stringify(
      queryAst(
        queries.messages.replies.fn({
          args: { ...args, topicId: "topic-1" },
          ctx,
        }),
      ),
    );
    const older = JSON.stringify(
      queryAst(
        queries.messages.replies.fn({
          args: { ...args, topicId: "topic-1", beforePosition: 902 },
          ctx,
        }),
      ),
    );

    for (const serialized of [initial, older]) {
      expect(serialized).toContain(args.workspaceId);
      expect(serialized).toContain(args.channelId);
      expect(serialized).toContain("topic-1");
      expect(serialized).toContain(ctx.userID);
      expect(serialized).toContain('"name":"position"');
      expect(serialized).toContain('"value":1');
      expect(serialized).toContain('"op":">"');
      expect(serialized).toContain('"position","desc"');
      expect(serialized).toContain('"limit":100');
      expect(serialized).toContain('"alias":"author"');
    }
    expect(initial).not.toContain('"value":902');
    expect(older).toContain('"value":902');
    expect(older).toContain('"op":"<"');
  });
});
