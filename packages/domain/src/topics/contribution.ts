import { Schema } from "effect";
import { ContributionId, TopicId, WorkspaceId, WorkspaceIdentityId } from "../identifiers.ts";
import { ContributionBody } from "./contribution-body.ts";

export const ContributionPosition = Schema.Int.check(Schema.isGreaterThan(0));
export type ContributionPosition = typeof ContributionPosition.Type;

export const Contribution = Schema.Struct({
  id: ContributionId,
  workspaceId: WorkspaceId,
  topicId: TopicId,
  authorIdentityId: WorkspaceIdentityId,
  body: Schema.optionalKey(ContributionBody),
  position: ContributionPosition,
  createdAt: Schema.Date,
  editedAt: Schema.optionalKey(Schema.Date),
  deletedAt: Schema.optionalKey(Schema.Date),
});

export interface Contribution extends Schema.Schema.Type<typeof Contribution> {}
