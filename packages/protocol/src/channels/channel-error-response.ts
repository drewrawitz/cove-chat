import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const unavailableDefinition = {
  code: "CHANNEL_UNAVAILABLE",
  message: "Channel is unavailable.",
} as const;

const administrationForbiddenDefinition = {
  code: "CHANNEL_ADMINISTRATION_FORBIDDEN",
  message: "The account cannot administer this Channel.",
} as const;

const memberUnavailableDefinition = {
  code: "CHANNEL_MEMBER_UNAVAILABLE",
  message: "Channel member is unavailable.",
} as const;

export const ChannelUnavailableResponse = Schema.Struct({
  code: Schema.Literals([unavailableDefinition.code]),
  message: Schema.Literals([unavailableDefinition.message]),
})
  .annotate({ identifier: "ChannelUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const ChannelAdministrationForbiddenResponse = Schema.Struct({
  code: Schema.Literals([administrationForbiddenDefinition.code]),
  message: Schema.Literals([administrationForbiddenDefinition.message]),
})
  .annotate({ identifier: "ChannelAdministrationForbiddenResponse" })
  .pipe(HttpApiSchema.status("Forbidden"));

export const ChannelMemberUnavailableResponse = Schema.Struct({
  code: Schema.Literals([memberUnavailableDefinition.code]),
  message: Schema.Literals([memberUnavailableDefinition.message]),
})
  .annotate({ identifier: "ChannelMemberUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const ChannelErrorResponses = {
  administrationForbidden: ChannelAdministrationForbiddenResponse.make(
    administrationForbiddenDefinition,
  ),
  memberUnavailable: ChannelMemberUnavailableResponse.make(memberUnavailableDefinition),
  unavailable: ChannelUnavailableResponse.make(unavailableDefinition),
} as const;
