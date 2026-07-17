import { Context, type Effect } from "effect";
import type { PersistenceError } from "./persistence-error.ts";

export interface TransactionManagerService {
  readonly run: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | PersistenceError, R>;
}

export class TransactionManager extends Context.Service<
  TransactionManager,
  TransactionManagerService
>()("@cove/ports/TransactionManager") {}
