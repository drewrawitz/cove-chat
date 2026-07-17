import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { AuthApiGroup } from "./auth/index.ts";
import { HealthApiGroup } from "./health/index.ts";

export const CoveApi = HttpApi.make("CoveApi")
  .add(AuthApiGroup)
  .add(HealthApiGroup)
  .annotate(OpenApi.Title, "Cove API")
  .annotate(OpenApi.Version, "1.0.0");
