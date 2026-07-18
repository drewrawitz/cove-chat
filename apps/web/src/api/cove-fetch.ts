import type { ZodType } from "zod";
import type { CoveAppErrorResponse as ApiErrorInfo } from "./generated/schemas/coveAppErrorResponse.zod.ts";

export type { ApiErrorInfo };

export class CoveApiError<ErrorInfo extends ApiErrorInfo = ApiErrorInfo> extends Error {
  readonly info: ErrorInfo;
  readonly status: number;

  constructor(status: number, info: ErrorInfo) {
    super(`Cove API request failed with status ${status}.`);
    this.name = "CoveApiError";
    this.info = info;
    this.status = status;
  }
}

export function parseApiError<ErrorInfo extends ApiErrorInfo>(
  body: string | null,
  schema: ZodType<ErrorInfo>,
): ErrorInfo {
  if (body === null) throw new TypeError("Expected a Cove API error response body.");

  const input: unknown = JSON.parse(body);
  return schema.parse(input);
}

function cookieValue(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;

  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);

  return value === undefined ? undefined : decodeURIComponent(value);
}

export const coveFetch: typeof globalThis.fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  const csrfToken = cookieValue("cove_csrf");
  if (csrfToken !== undefined && !headers.has("x-csrf-token")) {
    headers.set("x-csrf-token", csrfToken);
  }

  return globalThis.fetch(input, {
    ...init,
    credentials: init?.credentials ?? "same-origin",
    headers,
  });
};
