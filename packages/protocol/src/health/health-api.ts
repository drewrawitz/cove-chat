import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { HealthOkResponse, HealthUnavailableResponse } from "./health-response.ts";

const LiveEndpoint = HttpApiEndpoint.get("live", "/health/live", {
  success: HealthOkResponse,
});

const ReadyEndpoint = HttpApiEndpoint.get("ready", "/health/ready", {
  success: [HealthOkResponse, HealthUnavailableResponse],
});

export const HealthApiGroup = HttpApiGroup.make("health").add(LiveEndpoint, ReadyEndpoint);
