import { CoveApiError } from "./api/cove-fetch.ts";

export type AuthoritativeChannelAccess = "available" | "checking" | "revoked";
export type SynchronizedChannelAccess = "available" | "checking" | "revoked";
export type PrivateChannelAccessState = "available" | "checking" | "offline" | "revoked";

interface PrivateChannelAccessInput {
  readonly visibility: "private" | "public";
  readonly connection:
    | "closed"
    | "connected"
    | "connecting"
    | "disconnected"
    | "error"
    | "needs-auth";
  readonly authoritativeAccess: AuthoritativeChannelAccess;
  readonly synchronizedAccess: SynchronizedChannelAccess;
}

interface AuthoritativeChannelAccessInput {
  readonly error: unknown;
  readonly isFetching: boolean;
  readonly isPending: boolean;
}

export function authoritativeChannelAccessState({
  error,
  isFetching,
  isPending,
}: AuthoritativeChannelAccessInput): AuthoritativeChannelAccess {
  if (isFetching || isPending) return "checking";
  if (error === undefined || error === null) return "available";
  return error instanceof CoveApiError && [401, 403, 404].includes(error.status)
    ? "revoked"
    : "checking";
}

export function privateChannelAccessState({
  visibility,
  connection,
  authoritativeAccess,
  synchronizedAccess,
}: PrivateChannelAccessInput): PrivateChannelAccessState {
  if (visibility === "public") return "available";
  if (authoritativeAccess === "revoked" || synchronizedAccess === "revoked") return "revoked";
  if (connection !== "connected") return "offline";
  if (authoritativeAccess === "checking" || synchronizedAccess === "checking") return "checking";
  return "available";
}
