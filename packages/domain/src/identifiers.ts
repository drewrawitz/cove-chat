import { Effect, Schema } from "effect";

const Identifier = Schema.Trimmed.check(Schema.isNonEmpty());

export const WorkspaceId = Identifier.pipe(Schema.brand("WorkspaceId"));
export type WorkspaceId = typeof WorkspaceId.Type;

export const WorkspaceIdentityId = Identifier.pipe(Schema.brand("WorkspaceIdentityId"));
export type WorkspaceIdentityId = typeof WorkspaceIdentityId.Type;

export const UserId = Identifier.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const ChannelId = Identifier.pipe(Schema.brand("ChannelId"));
export type ChannelId = typeof ChannelId.Type;

export class InvalidIdentifier extends Schema.TaggedErrorClass<InvalidIdentifier>()(
  "Domain.InvalidIdentifier",
  {
    identifier: Schema.Literals(["workspace", "workspace-identity", "user", "channel"]),
    reason: Schema.Literals(["empty", "not-trimmed"]),
  },
) {}

function invalidIdentifier(
  identifier: InvalidIdentifier["identifier"],
  value: string,
): InvalidIdentifier {
  return new InvalidIdentifier({
    identifier,
    reason: value.trim().length === 0 ? "empty" : "not-trimmed",
  });
}

export function makeWorkspaceId(value: string) {
  return WorkspaceId.makeEffect(value).pipe(
    Effect.mapError(() => invalidIdentifier("workspace", value)),
  );
}

export function makeWorkspaceIdentityId(value: string) {
  return WorkspaceIdentityId.makeEffect(value).pipe(
    Effect.mapError(() => invalidIdentifier("workspace-identity", value)),
  );
}

export function makeUserId(value: string) {
  return UserId.makeEffect(value).pipe(Effect.mapError(() => invalidIdentifier("user", value)));
}

export function makeChannelId(value: string) {
  return ChannelId.makeEffect(value).pipe(
    Effect.mapError(() => invalidIdentifier("channel", value)),
  );
}
