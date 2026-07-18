import type {
  UserId,
  WorkspaceAccess,
  WorkspaceId,
  WorkspaceIdentity,
  WorkspaceIdentityProfile,
} from "@cove/domain";
import { Context, type Effect, type Option } from "effect";
import type { PersistenceError } from "../persistence-error.ts";

export type EndWorkspaceMembershipResult = "ended" | "last-owner" | "not-found";

export interface WorkspaceAccessRepositoryService {
  readonly createWorkspace: (
    access: WorkspaceAccess,
  ) => Effect.Effect<WorkspaceAccess, PersistenceError>;
  readonly joinWorkspace: (
    identity: WorkspaceIdentity,
  ) => Effect.Effect<Option.Option<WorkspaceAccess>, PersistenceError>;
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
  readonly updateIdentity: (
    accountId: UserId,
    workspaceId: WorkspaceId,
    profile: WorkspaceIdentityProfile,
  ) => Effect.Effect<Option.Option<WorkspaceAccess>, PersistenceError>;
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
