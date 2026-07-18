import type { WorkspaceId, WorkspaceIdentityId } from "@cove/domain";
import { Context, type Effect } from "effect";

export interface WorkspaceIdentifierGeneratorService {
  readonly nextWorkspaceId: () => Effect.Effect<WorkspaceId>;
  readonly nextWorkspaceIdentityId: () => Effect.Effect<WorkspaceIdentityId>;
}

export class WorkspaceIdentifierGenerator extends Context.Service<
  WorkspaceIdentifierGenerator,
  WorkspaceIdentifierGeneratorService
>()("@cove/ports/WorkspaceIdentifierGenerator") {}
