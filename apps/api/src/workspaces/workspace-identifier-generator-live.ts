import { WorkspaceId, WorkspaceIdentityId } from "@cove/domain";
import { WorkspaceIdentifierGenerator } from "@cove/ports";
import { Effect, Layer } from "effect";
import { randomUUID } from "node:crypto";

export const WorkspaceIdentifierGeneratorLive = Layer.succeed(
  WorkspaceIdentifierGenerator,
  WorkspaceIdentifierGenerator.of({
    nextWorkspaceId: Effect.fn("WorkspaceIdentifierGenerator.nextWorkspaceId")(() =>
      Effect.sync(() => WorkspaceId.make(randomUUID())),
    ),
    nextWorkspaceIdentityId: Effect.fn("WorkspaceIdentifierGenerator.nextWorkspaceIdentityId")(() =>
      Effect.sync(() => WorkspaceIdentityId.make(randomUUID())),
    ),
  }),
);
