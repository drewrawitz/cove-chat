import { PersistenceError } from "@cove/ports";

export function persistenceError(operation: string, cause: unknown): PersistenceError {
  return new PersistenceError({ operation, cause });
}
