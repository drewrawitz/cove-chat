import { expect, layer } from "@effect/vitest";
import {
  ChannelUnavailable,
  MessageCommandConflict,
  MessageCommandFailure,
  MessageCommandRejected,
  type MessageCommandStatus,
  MessageCommandSucceeded,
  MessageCommands,
  StaleMessageVersion,
  TopicUnavailable,
} from "@cove/application";
import {
  MessageCommandId,
  MessageId,
  MessageVersion,
  TopicId,
  UserId,
  WorkspaceId,
} from "@cove/domain";
import { Effect, Layer, Option } from "effect";
import { HttpBody, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { beforeEach, vi } from "vite-plus/test";
import { DatabaseReadiness } from "../../src/health/index.ts";
import { makeHttpApiTestLayer } from "../support/http-api-test-layer.ts";

const executeObserved = vi.fn();
const statusObserved = vi.fn();

const TestMessageCommands = MessageCommands.of({
  execute: Effect.fn("MessageCommands.HttpTest.execute")(function* (command) {
    executeObserved(command);
    switch (command.commandId) {
      case "conflicting-command":
        return yield* Effect.fail(new MessageCommandConflict({ commandId: command.commandId }));
      case "stale-command":
        if (command._tag === "create") {
          return yield* Effect.fail(new TopicUnavailable({ topicId: command.topicId }));
        }
        return yield* Effect.fail(
          new StaleMessageVersion({
            messageId: command.messageId,
            expectedVersion: command.expectedVersion,
          }),
        );
      case "unavailable-command":
        return yield* Effect.fail(new ChannelUnavailable({ channelId: command.channelId }));
      case "infrastructure-command":
        return yield* Effect.fail(
          new MessageCommandFailure({ operation: "MessageCommands.HttpTest.execute" }),
        );
      default:
        return MessageCommandSucceeded.make({
          commandId: command.commandId,
          kind: command._tag,
          messageId: MessageId.make("message-from-command"),
          messageVersion: MessageVersion.make(command._tag === "create" ? 1 : 2),
        });
    }
  }),
  status: (
    actorAccountId,
    workspaceId,
    commandId,
  ): Effect.Effect<Option.Option<MessageCommandStatus>, MessageCommandFailure> => {
    statusObserved(actorAccountId, workspaceId, commandId);
    if (commandId === "status-infrastructure-command") {
      return Effect.fail(
        new MessageCommandFailure({ operation: "MessageCommands.HttpTest.status" }),
      );
    }
    if (commandId === "known-command") {
      return Effect.succeed(
        Option.some(
          MessageCommandSucceeded.make({
            commandId,
            kind: "edit",
            messageId: MessageId.make("known-message"),
            messageVersion: MessageVersion.make(3),
          }),
        ),
      );
    }
    if (commandId === "rejected-command") {
      return Effect.succeed(
        Option.some(
          MessageCommandRejected.make({
            commandId,
            kind: "delete",
            rejection: "stale_version",
            messageId: MessageId.make("rejected-message"),
          }),
        ),
      );
    }
    return Effect.succeed(Option.none());
  },
});

const Api = makeHttpApiTestLayer(
  { exposeAppApiDocs: false },
  Layer.succeed(
    DatabaseReadiness,
    DatabaseReadiness.of({
      check: Effect.fn("DatabaseReadiness.Test.unavailable")(() => Effect.succeed(false)),
    }),
  ),
  TestMessageCommands,
);

const topicUrl = "/api/app/v1/workspaces/workspace-1/channels/channel-1/topics/topic-1";
const messageUrl = `${topicUrl}/messages/message-1`;
const authenticatedHeaders = {
  cookie: "cove_session=test-session",
  "x-csrf-token": "test-csrf",
};

beforeEach(() => {
  executeObserved.mockClear();
  statusObserved.mockClear();
});

layer(Api)("Message command HTTP routes", (it) => {
  it.effect("accepts a client command ID and returns compact committed metadata", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post(`${topicUrl}/messages`, {
        headers: authenticatedHeaders,
        body: HttpBody.jsonUnsafe({
          commandId: "create-command",
          body: "The release candidate passed smoke testing.",
        }),
      });

      expect(response.status).toBe(200);
      expect(yield* response.json).toEqual({
        status: "succeeded",
        commandId: "create-command",
        kind: "create",
        messageId: "message-from-command",
        messageVersion: 1,
      });
      expect(executeObserved).toHaveBeenCalledWith(
        expect.objectContaining({
          _tag: "create",
          actorAccountId: UserId.make("http-test-actor"),
          workspaceId: WorkspaceId.make("workspace-1"),
          topicId: TopicId.make("topic-1"),
          commandId: MessageCommandId.make("create-command"),
        }),
      );
    }),
  );

  it.effect("accepts delete command metadata through query parameters", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.make("DELETE")(
          `${messageUrl}?commandId=delete-command&expectedVersion=1`,
          { headers: authenticatedHeaders },
        ),
      );

      expect(response.status).toBe(200);
      expect(executeObserved).toHaveBeenCalledWith(
        expect.objectContaining({
          _tag: "delete",
          commandId: MessageCommandId.make("delete-command"),
          expectedVersion: MessageVersion.make(1),
        }),
      );
    }),
  );

  it.effect(
    "classifies malformed, unauthenticated, and CSRF-invalid requests before execution",
    () =>
      Effect.gen(function* () {
        const malformed = yield* HttpClient.patch(messageUrl, {
          headers: authenticatedHeaders,
          body: HttpBody.jsonUnsafe({
            commandId: "malformed-command",
            expectedVersion: 0,
            body: "Invalid version.",
          }),
        });
        const unauthenticated = yield* HttpClient.patch(messageUrl, {
          body: HttpBody.jsonUnsafe({
            commandId: "unauthenticated-command",
            expectedVersion: 1,
            body: "No session.",
          }),
        });
        const csrfInvalid = yield* HttpClient.patch(messageUrl, {
          headers: { cookie: authenticatedHeaders.cookie },
          body: HttpBody.jsonUnsafe({
            commandId: "csrf-command",
            expectedVersion: 1,
            body: "No CSRF token.",
          }),
        });

        expect(malformed.status).toBe(400);
        expect(unauthenticated.status).toBe(401);
        expect(csrfInvalid.status).toBe(403);
        expect(executeObserved).not.toHaveBeenCalled();
      }),
  );

  it.effect("maps durable conflicts and stale versions to stable responses", () =>
    Effect.gen(function* () {
      const conflict = yield* HttpClient.post(`${topicUrl}/messages`, {
        headers: authenticatedHeaders,
        body: HttpBody.jsonUnsafe({
          commandId: "conflicting-command",
          body: "Conflicting semantic request.",
        }),
      });
      const stale = yield* HttpClient.patch(messageUrl, {
        headers: authenticatedHeaders,
        body: HttpBody.jsonUnsafe({
          commandId: "stale-command",
          expectedVersion: 1,
          body: "Stale edit.",
        }),
      });

      expect(conflict.status).toBe(409);
      expect(yield* conflict.json).toEqual({
        code: "MESSAGE_COMMAND_CONFLICT",
        message: "This Message command ID was already used for different content.",
      });
      expect(stale.status).toBe(409);
      expect(yield* stale.json).toEqual({
        code: "MESSAGE_VERSION_STALE",
        message: "This Message changed after the version you reviewed.",
      });
    }),
  );

  it.effect("leaves transient infrastructure failures outside a terminal response", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.make("DELETE")(
          `${messageUrl}?commandId=infrastructure-command&expectedVersion=1`,
          { headers: authenticatedHeaders },
        ),
      );

      expect(response.status).toBe(500);
      expect(yield* response.json).toEqual({
        code: "INTERNAL_SERVER_ERROR",
        message: "The server could not complete the request.",
      });
    }),
  );

  it.effect("reads compact status only after independent actor authorization", () =>
    Effect.gen(function* () {
      const known = yield* HttpClient.get(
        "/api/app/v1/workspaces/workspace-1/message-commands/known-command",
        { headers: { cookie: authenticatedHeaders.cookie } },
      );
      const rejected = yield* HttpClient.get(
        "/api/app/v1/workspaces/workspace-1/message-commands/rejected-command",
        { headers: { cookie: authenticatedHeaders.cookie } },
      );
      const missing = yield* HttpClient.get(
        "/api/app/v1/workspaces/workspace-1/message-commands/missing-command",
        { headers: { cookie: authenticatedHeaders.cookie } },
      );
      const unauthenticated = yield* HttpClient.get(
        "/api/app/v1/workspaces/workspace-1/message-commands/known-command",
      );
      const invalidIdentifier = yield* HttpClient.get(
        "/api/app/v1/workspaces/workspace-1/message-commands/%20",
        { headers: { cookie: authenticatedHeaders.cookie } },
      );
      const infrastructureFailure = yield* HttpClient.get(
        "/api/app/v1/workspaces/workspace-1/message-commands/status-infrastructure-command",
        { headers: { cookie: authenticatedHeaders.cookie } },
      );

      expect(known.status).toBe(200);
      expect(yield* known.json).toEqual({
        status: "succeeded",
        commandId: "known-command",
        kind: "edit",
        messageId: "known-message",
        messageVersion: 3,
      });
      expect(rejected.status).toBe(200);
      expect(yield* rejected.json).toEqual({
        status: "rejected",
        commandId: "rejected-command",
        kind: "delete",
        rejection: "stale_version",
        messageId: "rejected-message",
      });
      expect(missing.status).toBe(404);
      expect(yield* missing.json).toEqual({
        code: "MESSAGE_COMMAND_UNAVAILABLE",
        message: "Message command status is unavailable.",
      });
      expect(unauthenticated.status).toBe(401);
      expect(invalidIdentifier.status).toBe(500);
      expect(infrastructureFailure.status).toBe(500);
      expect(statusObserved).toHaveBeenCalledWith(
        UserId.make("http-test-actor"),
        WorkspaceId.make("workspace-1"),
        MessageCommandId.make("known-command"),
      );
      expect(statusObserved).toHaveBeenCalledTimes(4);
    }),
  );
});
