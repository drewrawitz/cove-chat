import {
  CsrfToken,
  CsrfTokenValue,
  MagicLinkToken,
  MagicLinkTokenValue,
  SessionToken,
  SessionTokenValue,
} from "@cove/ports";
import { Redacted } from "effect";

export function makeMagicLinkToken(value: string): MagicLinkToken {
  return MagicLinkToken.make(
    Redacted.make(MagicLinkTokenValue.make(value), { label: "MagicLinkToken" }),
  );
}

export function makeSessionToken(value: string): SessionToken {
  return SessionToken.make(Redacted.make(SessionTokenValue.make(value), { label: "SessionToken" }));
}

export function makeCsrfToken(value: string): CsrfToken {
  return CsrfToken.make(Redacted.make(CsrfTokenValue.make(value), { label: "CsrfToken" }));
}
