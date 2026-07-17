import { Redacted } from "effect";
import { createHash, randomBytes } from "node:crypto";

export function makeOpaqueToken<A extends string>(
  makeValue: (value: string) => A,
  label: string,
): Redacted.Redacted<A> {
  return Redacted.make(makeValue(randomBytes(32).toString("base64url")), { label });
}

export function hashOpaqueToken(token: Redacted.Redacted<string>): string {
  return createHash("sha256").update(Redacted.value(token)).digest("hex");
}
