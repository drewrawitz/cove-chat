import { CoveOperationsApi, HealthOkResponse, HealthUnavailableResponse } from "@cove/protocol";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { DatabaseReadiness } from "./database-readiness.ts";

export const HealthApiLive = HttpApiBuilder.group(CoveOperationsApi, "health", (handlers) =>
  handlers
    .handle("live", () => Effect.succeed(HealthOkResponse.make({ status: "ok" })))
    .handle("ready", () =>
      Effect.gen(function* () {
        const database = yield* DatabaseReadiness;
        const isReady = yield* database.check();

        return isReady
          ? HealthOkResponse.make({ status: "ok" })
          : HealthUnavailableResponse.make({ status: "unavailable" });
      }),
    ),
);
