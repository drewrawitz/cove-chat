import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const unavailableDefinition = {
  code: "TOPIC_UNAVAILABLE",
  message: "Topic is unavailable.",
} as const;

const messageUnavailableDefinition = {
  code: "MESSAGE_UNAVAILABLE",
  message: "Message is unavailable.",
} as const;

const messageMutationForbiddenDefinition = {
  code: "MESSAGE_MUTATION_FORBIDDEN",
  message: "Only the Message author can change it.",
} as const;

const archiveCursorInvalidDefinition = {
  code: "TOPIC_ARCHIVE_CURSOR_INVALID",
  message: "Topic archive cursor is invalid.",
} as const;

export const TopicArchiveCursorInvalidResponse = Schema.Struct({
  code: Schema.Literals([archiveCursorInvalidDefinition.code]),
  message: Schema.Literals([archiveCursorInvalidDefinition.message]),
})
  .annotate({ identifier: "TopicArchiveCursorInvalidResponse" })
  .pipe(HttpApiSchema.status("BadRequest"));

export const TopicUnavailableResponse = Schema.Struct({
  code: Schema.Literals([unavailableDefinition.code]),
  message: Schema.Literals([unavailableDefinition.message]),
})
  .annotate({ identifier: "TopicUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const MessageUnavailableResponse = Schema.Struct({
  code: Schema.Literals([messageUnavailableDefinition.code]),
  message: Schema.Literals([messageUnavailableDefinition.message]),
})
  .annotate({ identifier: "MessageUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const MessageMutationForbiddenResponse = Schema.Struct({
  code: Schema.Literals([messageMutationForbiddenDefinition.code]),
  message: Schema.Literals([messageMutationForbiddenDefinition.message]),
})
  .annotate({ identifier: "MessageMutationForbiddenResponse" })
  .pipe(HttpApiSchema.status("Forbidden"));

export const TopicErrorResponses = {
  archiveCursorInvalid: TopicArchiveCursorInvalidResponse.make(archiveCursorInvalidDefinition),
  messageMutationForbidden: MessageMutationForbiddenResponse.make(
    messageMutationForbiddenDefinition,
  ),
  messageUnavailable: MessageUnavailableResponse.make(messageUnavailableDefinition),
  unavailable: TopicUnavailableResponse.make(unavailableDefinition),
} as const;
