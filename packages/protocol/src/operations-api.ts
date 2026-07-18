import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { HealthApiGroup } from "./health/index.ts";

export const CoveOperationsApi = HttpApi.make("CoveOperationsApi")
  .add(HealthApiGroup)
  .annotate(OpenApi.Title, "Cove Operations API")
  .annotate(OpenApi.Description, "The operational HTTP interface used to monitor Cove.")
  .annotate(OpenApi.Version, "1.0.0");
