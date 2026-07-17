import { TransactionManager } from "@cove/ports";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { persistenceError } from "./persistence-error.ts";

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return TransactionManager.of({
    run: (effect) =>
      sql
        .withTransaction(effect)
        .pipe(
          Effect.catchTag("SqlError", (cause) =>
            Effect.fail(persistenceError("TransactionManager.run", cause)),
          ),
        ),
  });
});

export const PostgresTransactionManager = Layer.effect(TransactionManager, make);
