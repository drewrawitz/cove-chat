import { Schema } from "effect";
import { UserId, WorkspaceId, WorkspaceIdentityId } from "../identifiers.ts";

export const WorkspaceName = Schema.Trimmed.check(Schema.isNonEmpty()).pipe(
  Schema.brand("WorkspaceName"),
);
export type WorkspaceName = typeof WorkspaceName.Type;

export const WorkspaceIdentityName = Schema.Trimmed.check(Schema.isNonEmpty()).pipe(
  Schema.brand("WorkspaceIdentityName"),
);
export type WorkspaceIdentityName = typeof WorkspaceIdentityName.Type;

export const WorkspaceAvatarUrl = Schema.Trimmed.check(Schema.isNonEmpty()).pipe(
  Schema.brand("WorkspaceAvatarUrl"),
);
export type WorkspaceAvatarUrl = typeof WorkspaceAvatarUrl.Type;

export const WorkspaceRole = Schema.Literals(["owner", "admin", "member", "guest"]);
export type WorkspaceRole = typeof WorkspaceRole.Type;

export const Workspace = Schema.Struct({
  id: WorkspaceId,
  name: WorkspaceName,
});
export interface Workspace extends Schema.Schema.Type<typeof Workspace> {}

export const WorkspaceIdentity = Schema.Struct({
  id: WorkspaceIdentityId,
  workspaceId: WorkspaceId,
  accountId: UserId,
  name: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
});
export interface WorkspaceIdentity extends Schema.Schema.Type<typeof WorkspaceIdentity> {}

export const WorkspaceIdentityProfile = Schema.Struct({
  name: WorkspaceIdentityName,
  avatarUrl: WorkspaceAvatarUrl,
});
export interface WorkspaceIdentityProfile extends Schema.Schema.Type<
  typeof WorkspaceIdentityProfile
> {}

export const WorkspaceMembership = Schema.Struct({
  workspaceId: WorkspaceId,
  identityId: WorkspaceIdentityId,
  role: WorkspaceRole,
  startedAt: Schema.DateFromString,
});
export interface WorkspaceMembership extends Schema.Schema.Type<typeof WorkspaceMembership> {}
