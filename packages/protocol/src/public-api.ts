import { HttpApi, OpenApi } from "effect/unstable/httpapi";

export const CovePublicApi = HttpApi.make("CovePublicApi")
  .annotate(OpenApi.Title, "Cove Public API")
  .annotate(OpenApi.Description, "The stable HTTP interface supported for Cove integrations.")
  .annotate(OpenApi.Version, "1.0.0");
