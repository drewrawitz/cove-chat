import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { AuthApiGroup } from "./auth/index.ts";
import { WorkspaceApiGroup } from "./workspaces/index.ts";

export const CoveAppApi = HttpApi.make("CoveAppApi")
  .add(AuthApiGroup)
  .add(WorkspaceApiGroup)
  .annotate(OpenApi.Title, "Cove App API")
  .annotate(OpenApi.Description, "The first-party HTTP interface used by Cove applications.")
  .annotate(OpenApi.Version, "1.0.0");
