import { Schema } from "effect";

export const MagicLinkTokenValue = Schema.NonEmptyString.pipe(Schema.brand("MagicLinkToken"));
export type MagicLinkTokenValue = typeof MagicLinkTokenValue.Type;

export const MagicLinkToken = Schema.Redacted(MagicLinkTokenValue, {
  label: "MagicLinkToken",
  disallowJsonEncode: true,
});
export type MagicLinkToken = typeof MagicLinkToken.Type;

export const SessionTokenValue = Schema.NonEmptyString.pipe(Schema.brand("SessionToken"));
export type SessionTokenValue = typeof SessionTokenValue.Type;

export const SessionToken = Schema.Redacted(SessionTokenValue, {
  label: "SessionToken",
  disallowJsonEncode: true,
});
export type SessionToken = typeof SessionToken.Type;

export const CsrfTokenValue = Schema.NonEmptyString.pipe(Schema.brand("CsrfToken"));
export type CsrfTokenValue = typeof CsrfTokenValue.Type;

export const CsrfToken = Schema.Redacted(CsrfTokenValue, {
  label: "CsrfToken",
  disallowJsonEncode: true,
});
export type CsrfToken = typeof CsrfToken.Type;
