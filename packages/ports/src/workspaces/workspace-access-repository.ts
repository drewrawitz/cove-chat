import type { UserId, WorkspaceAccess, WorkspaceId, WorkspaceIdentity } from "@cove/domain";
import { Context, type Effect, type Option } from "effect";
import type { PersistenceError } from "../persistence-error.ts";

export type EndWorkspaceMembershipResult = "ended" | "last-owner" | "not-found";

export interface WorkspaceAccessRepositoryService {
  readonly listForAccount: (
    accountId: UserId,
  ) => Effect.Effect<ReadonlyArray<WorkspaceAccess>, PersistenceError>;
  readonly findForAccount: (
    accountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<Option.Option<WorkspaceAccess>, PersistenceError>;
  readonly findIdentityForAccount: (
    accountId: UserId,
    workspaceId: WorkspaceId,
  ) => Effect.Effect<Option.Option<WorkspaceIdentity>, PersistenceError>;
  readonly endMembership: (
    accountId: UserId,
    workspaceId: WorkspaceId,
    endedAt: Date,
  ) => Effect.Effect<EndWorkspaceMembershipResult, PersistenceError>;
}

export class WorkspaceAccessRepository extends Context.Service<
  WorkspaceAccessRepository,
  WorkspaceAccessRepositoryService
>()("@cove/ports/WorkspaceAccessRepository") {}
