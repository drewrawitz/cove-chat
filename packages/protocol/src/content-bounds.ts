import { Schema } from "effect";

export const protocolUtf8ByteLimit = (maximumBytes: number) =>
  Schema.makeFilter((value: string) => new TextEncoder().encode(value).byteLength <= maximumBytes);
