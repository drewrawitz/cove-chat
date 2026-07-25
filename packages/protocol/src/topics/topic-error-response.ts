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

const messageCommandConflictDefinition = {
  code: "MESSAGE_COMMAND_CONFLICT",
  message: "This Message command ID was already used for different content.",
} as const;

const staleMessageVersionDefinition = {
  code: "MESSAGE_VERSION_STALE",
  message: "This Message changed after the version you reviewed.",
} as const;

const messageCommandUnavailableDefinition = {
  code: "MESSAGE_COMMAND_UNAVAILABLE",
  message: "Message command status is unavailable.",
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

export const MessageCommandConflictResponse = Schema.Struct({
  code: Schema.Literals([messageCommandConflictDefinition.code]),
  message: Schema.Literals([messageCommandConflictDefinition.message]),
})
  .annotate({ identifier: "MessageCommandConflictResponse" })
  .pipe(HttpApiSchema.status("Conflict"));

export const StaleMessageVersionResponse = Schema.Struct({
  code: Schema.Literals([staleMessageVersionDefinition.code]),
  message: Schema.Literals([staleMessageVersionDefinition.message]),
})
  .annotate({ identifier: "StaleMessageVersionResponse" })
  .pipe(HttpApiSchema.status("Conflict"));

export const MessageCommandUnavailableResponse = Schema.Struct({
  code: Schema.Literals([messageCommandUnavailableDefinition.code]),
  message: Schema.Literals([messageCommandUnavailableDefinition.message]),
})
  .annotate({ identifier: "MessageCommandUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const TopicErrorResponses = {
  archiveCursorInvalid: TopicArchiveCursorInvalidResponse.make(archiveCursorInvalidDefinition),
  messageCommandConflict: MessageCommandConflictResponse.make(messageCommandConflictDefinition),
  messageCommandUnavailable: MessageCommandUnavailableResponse.make(
    messageCommandUnavailableDefinition,
  ),
  messageMutationForbidden: MessageMutationForbiddenResponse.make(
    messageMutationForbiddenDefinition,
  ),
  messageUnavailable: MessageUnavailableResponse.make(messageUnavailableDefinition),
  staleMessageVersion: StaleMessageVersionResponse.make(staleMessageVersionDefinition),
  unavailable: TopicUnavailableResponse.make(unavailableDefinition),
} as const;
