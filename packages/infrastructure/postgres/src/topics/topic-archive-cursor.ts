import { ChannelId, TopicId, UserId, WorkspaceId } from "@cove/domain";
import { Config, Context, Effect, Layer, Option, Redacted, Schema } from "effect";
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

const TopicArchiveCursorScope = Schema.Struct({
  actorAccountId: UserId,
  workspaceId: WorkspaceId,
  channelId: ChannelId,
});
export interface TopicArchiveCursorScope extends Schema.Schema.Type<
  typeof TopicArchiveCursorScope
> {}

const TopicArchiveCursor = Schema.Struct({
  version: Schema.Literals([1]),
  ...TopicArchiveCursorScope.fields,
  afterLastActivityAt: Schema.DateFromString,
  afterTopicId: TopicId,
});

export interface TopicArchiveCursor extends Schema.Schema.Type<typeof TopicArchiveCursor> {}

export interface TopicArchiveCursorCodecService {
  readonly encode: (cursor: TopicArchiveCursor) => string;
  readonly decodeForScope: (
    cursor: string,
    scope: TopicArchiveCursorScope,
  ) => Option.Option<TopicArchiveCursor>;
}

export class TopicArchiveCursorCodec extends Context.Service<
  TopicArchiveCursorCodec,
  TopicArchiveCursorCodecService
>()("@cove/infrastructure-postgres/TopicArchiveCursorCodec") {}

const signingKeyConfig = Config.schema(
  Schema.RedactedFromValue(Schema.String.check(Schema.isMinLength(32)), {
    label: "Topic archive cursor signing key",
    disallowEncode: true,
  }),
  "TOPIC_ARCHIVE_CURSOR_SIGNING_KEY",
);

export const makeTopicArchiveCursorCodec = (
  signingKey: Redacted.Redacted<string>,
): TopicArchiveCursorCodecService => {
  const signatureFor = (payload: string): Buffer =>
    createHmac("sha256", Redacted.value(signingKey)).update(payload).digest();

  const encode = (cursor: TopicArchiveCursor): string => {
    const payload = Buffer.from(
      JSON.stringify({
        ...cursor,
        afterLastActivityAt: cursor.afterLastActivityAt.toISOString(),
      }),
      "utf8",
    ).toString("base64url");
    return `${payload}.${signatureFor(payload).toString("base64url")}`;
  };

  const decode = (cursor: string): Option.Option<TopicArchiveCursor> => {
    try {
      const parts = cursor.split(".");
      if (parts.length !== 2) return Option.none();
      const [payload, encodedSignature] = parts;
      if (payload === undefined || encodedSignature === undefined) return Option.none();

      const signature = Buffer.from(encodedSignature, "base64url");
      const expectedSignature = signatureFor(payload);
      if (
        signature.length !== expectedSignature.length ||
        !timingSafeEqual(signature, expectedSignature)
      ) {
        return Option.none();
      }

      const cursorJson = Buffer.from(payload, "base64url").toString("utf8");
      return Schema.decodeUnknownOption(TopicArchiveCursor)(JSON.parse(cursorJson));
    } catch {
      return Option.none();
    }
  };

  const decodeForScope = (
    cursor: string,
    scope: TopicArchiveCursorScope,
  ): Option.Option<TopicArchiveCursor> => {
    const decoded = Option.getOrUndefined(decode(cursor));
    if (
      decoded === undefined ||
      decoded.actorAccountId !== scope.actorAccountId ||
      decoded.workspaceId !== scope.workspaceId ||
      decoded.channelId !== scope.channelId
    ) {
      return Option.none();
    }
    return Option.some(decoded);
  };

  return TopicArchiveCursorCodec.of({ encode, decodeForScope });
};

export const topicArchiveCursorCodecLayer = (signingKey: Redacted.Redacted<string>) =>
  Layer.succeed(TopicArchiveCursorCodec, makeTopicArchiveCursorCodec(signingKey));

export const TopicArchiveCursorCodecLive = Layer.effect(
  TopicArchiveCursorCodec,
  Effect.map(signingKeyConfig, makeTopicArchiveCursorCodec),
);
