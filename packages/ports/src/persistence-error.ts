import { Schema } from "effect";

export class PersistenceError extends Schema.TaggedErrorClass<PersistenceError>()(
  "Ports.PersistenceError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}
