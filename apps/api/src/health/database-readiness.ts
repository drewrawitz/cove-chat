import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";

export interface DatabaseReadinessService {
  readonly check: () => Effect.Effect<boolean>;
}

export class DatabaseReadiness extends Context.Service<
  DatabaseReadiness,
  DatabaseReadinessService
>()("@cove/api/DatabaseReadiness") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return DatabaseReadiness.of({
    check: Effect.fn("DatabaseReadiness.check")(() =>
      sql`SELECT 1`.pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      ),
    ),
  });
});

export const PostgresDatabaseReadiness = Layer.effect(DatabaseReadiness, make);
