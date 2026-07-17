import { Schema } from "effect";
import { UserId } from "../identifiers.ts";

export const EmailAddress = Schema.Trimmed.check(
  Schema.isNonEmpty(),
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
).pipe(Schema.brand("EmailAddress"));

export type EmailAddress = typeof EmailAddress.Type;

export const DisplayName = Schema.Trimmed.check(Schema.isNonEmpty()).pipe(
  Schema.brand("DisplayName"),
);

export type DisplayName = typeof DisplayName.Type;

export const User = Schema.Struct({
  id: UserId,
  email: EmailAddress,
  displayName: DisplayName,
});

export interface User extends Schema.Schema.Type<typeof User> {}
