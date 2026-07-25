import { expect, layer } from "@effect/vitest";
import { Effect, Layer, Stream } from "effect";
import {
  HttpBody,
  HttpClient,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { NodeHttpServer } from "@effect/platform-node";
import { withConversationCommandBodyLimit } from "../../src/support/conversation-command-body-limit.ts";
import { DatabaseReadiness } from "../../src/health/index.ts";
import { makeHttpApiTestLayer } from "../support/http-api-test-layer.ts";

const limited = HttpRouter.serve(
  Layer.mergeAll(
    HttpRouter.add(
      "POST",
      "/api/app/v1/workspaces/workspace-1/channels",
      withConversationCommandBodyLimit(
        Effect.succeed(HttpServerResponse.jsonUnsafe({ status: "accepted" })),
      ),
    ),
    HttpRouter.add(
      "POST",
      "/api/app/v1/workspaces/workspace-1/channels/channel-1/topics",
      withConversationCommandBodyLimit(
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          return HttpServerResponse.jsonUnsafe(yield* request.json);
        }),
      ),
    ),
  ),
  { disableListenLog: true, disableLogger: true },
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

layer(limited)("Conversation command body limit", (it) => {
  it.effect("rejects a declared Channel-command body above 64 KiB", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post("/api/app/v1/workspaces/workspace-1/channels", {
        body: HttpBody.text("x".repeat(64 * 1024 + 1), "application/json"),
      });

      expect(response.status).toBe(413);
      expect(yield* response.json).toEqual({ error: "Conversation command request too large" });
    }),
  );

  it.effect("stops a chunked Topic-command body while reading it", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post(
        "/api/app/v1/workspaces/workspace-1/channels/channel-1/topics",
        {
          body: HttpBody.stream(
            Stream.make(new Uint8Array(40 * 1024), new Uint8Array(40 * 1024)),
            "application/json",
          ),
        },
      );

      expect(response.status).toBe(413);
      expect(yield* response.json).toEqual({ error: "Conversation command request too large" });
    }),
  );

  it.effect("leaves an accepted command body available to the route decoder", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post(
        "/api/app/v1/workspaces/workspace-1/channels/channel-1/topics",
        {
          body: HttpBody.text(JSON.stringify({ title: "Bounded Topic" }), "application/json"),
        },
      );

      expect(response.status).toBe(200);
      expect(yield* response.json).toEqual({ title: "Bounded Topic" });
    }),
  );
});

const AppApi = makeHttpApiTestLayer(
  { exposeAppApiDocs: false },
  Layer.succeed(
    DatabaseReadiness,
    DatabaseReadiness.of({
      check: Effect.fn("DatabaseReadiness.Test.unavailable")(() => Effect.succeed(false)),
    }),
  ),
);

layer(AppApi)("Conversation command authorization", (it) => {
  it.effect("preserves authentication behavior for oversized commands", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post(
        "/api/app/v1/workspaces/workspace-1/channels/channel-1/topics",
        {
          body: HttpBody.text("x".repeat(64 * 1024 + 1), "application/json"),
        },
      );

      expect(response.status).toBe(401);
    }),
  );
});
