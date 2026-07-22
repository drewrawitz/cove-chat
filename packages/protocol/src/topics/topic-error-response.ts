import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const unavailableDefinition = {
  code: "TOPIC_UNAVAILABLE",
  message: "Topic is unavailable.",
} as const;

const contributionUnavailableDefinition = {
  code: "CONTRIBUTION_UNAVAILABLE",
  message: "Contribution is unavailable.",
} as const;

const contributionMutationForbiddenDefinition = {
  code: "CONTRIBUTION_MUTATION_FORBIDDEN",
  message: "Only the Contribution author can change it.",
} as const;

export const TopicUnavailableResponse = Schema.Struct({
  code: Schema.Literals([unavailableDefinition.code]),
  message: Schema.Literals([unavailableDefinition.message]),
})
  .annotate({ identifier: "TopicUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const ContributionUnavailableResponse = Schema.Struct({
  code: Schema.Literals([contributionUnavailableDefinition.code]),
  message: Schema.Literals([contributionUnavailableDefinition.message]),
})
  .annotate({ identifier: "ContributionUnavailableResponse" })
  .pipe(HttpApiSchema.status("NotFound"));

export const ContributionMutationForbiddenResponse = Schema.Struct({
  code: Schema.Literals([contributionMutationForbiddenDefinition.code]),
  message: Schema.Literals([contributionMutationForbiddenDefinition.message]),
})
  .annotate({ identifier: "ContributionMutationForbiddenResponse" })
  .pipe(HttpApiSchema.status("Forbidden"));

export const TopicErrorResponses = {
  contributionMutationForbidden: ContributionMutationForbiddenResponse.make(
    contributionMutationForbiddenDefinition,
  ),
  contributionUnavailable: ContributionUnavailableResponse.make(contributionUnavailableDefinition),
  unavailable: TopicUnavailableResponse.make(unavailableDefinition),
} as const;
