import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const unavailableDefinition = {
  code: "WORKSPACE_UNAVAILABLE",
  message: "Workspace is unavailable.",
} as const;

const lastOwnerDefinition = {
  code: "LAST_WORKSPACE_OWNER",
  message: "The final workspace owner cannot leave.",
} as const;

export const WorkspaceUnavailableResponse = Schema.Struct({
  code: Schema.Literals([unavailableDefinition.code]),
  message: Schema.Literals([unavailableDefinition.message]),
})
  .annotate({ identifier: "WorkspaceUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));
export interface WorkspaceUnavailableResponse extends Schema.Schema.Type<
  typeof WorkspaceUnavailableResponse
> {}

export const LastWorkspaceOwnerResponse = Schema.Struct({
  code: Schema.Literals([lastOwnerDefinition.code]),
  message: Schema.Literals([lastOwnerDefinition.message]),
})
  .annotate({ identifier: "LastWorkspaceOwnerResponse" })
  .pipe(HttpApiSchema.status("Conflict"));
export interface LastWorkspaceOwnerResponse extends Schema.Schema.Type<
  typeof LastWorkspaceOwnerResponse
> {}

export const WorkspaceErrorResponses = {
  lastOwner: LastWorkspaceOwnerResponse.make(lastOwnerDefinition),
  unavailable: WorkspaceUnavailableResponse.make(unavailableDefinition),
} as const;
