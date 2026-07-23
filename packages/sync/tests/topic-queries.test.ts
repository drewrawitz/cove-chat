import { describe, expect, it } from "vite-plus/test";
import { queries } from "../src/queries.ts";

const args = {
  workspaceId: "workspace-1",
  channelId: "channel-1",
};
const ctx = { userID: "account-1" };

const queryAst = (query: unknown): { readonly table: string } =>
  (query as { readonly ast: { readonly table: string } }).ast;

describe("authorized Topic queries", () => {
  it("scopes the channel list to an active authorized workspace identity", () => {
    const query = queries.topics.inChannel.fn({ args, ctx });
    const ast = queryAst(query);
    const serialized = JSON.stringify(ast);

    expect(ast.table).toBe("topic");
    expect(serialized).toContain(args.workspaceId);
    expect(serialized).toContain(args.channelId);
    expect(serialized).toContain(ctx.userID);
    expect(serialized).toContain("membershipEndedAt");
    expect(serialized).toContain("channelMembership");
  });

  it("orders one Topic's flat Messages and includes each author", () => {
    const query = queries.topics.byId.fn({
      args: { ...args, topicId: "topic-1" },
      ctx,
    });
    const ast = queryAst(query);
    const serialized = JSON.stringify(ast);

    expect(serialized).toContain("topic-1");
    expect(serialized).toContain('"alias":"messages"');
    expect(serialized).toContain('"alias":"author"');
    expect(serialized).toContain('"position","asc"');
  });
});
