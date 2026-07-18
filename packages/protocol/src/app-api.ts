import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { AuthApiGroup } from "./auth/index.ts";

export const CoveAppApi = HttpApi.make("CoveAppApi")
  .add(AuthApiGroup)
  .annotate(OpenApi.Title, "Cove App API")
  .annotate(OpenApi.Description, "The first-party HTTP interface used by Cove applications.")
  .annotate(OpenApi.Version, "1.0.0");
