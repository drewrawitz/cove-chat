export const TOPIC_TITLE_MAX_BYTES = 512;
export const CHANNEL_PURPOSE_MAX_BYTES = 2 * 1024;
export const MESSAGE_BODY_MAX_BYTES = 8 * 1024;
export const TOPIC_SUMMARY_PREVIEW_MAX_BYTES = 512;

const utf8Encoder = new TextEncoder();

export const utf8ByteLength = (value: string): number => utf8Encoder.encode(value).byteLength;

export const isWithinUtf8ByteLimit =
  (maximumBytes: number) =>
  (value: string): boolean =>
    utf8ByteLength(value) <= maximumBytes;

export function truncateUtf8(value: string, maximumBytes: number): string {
  if (utf8ByteLength(value) <= maximumBytes) return value;

  let bytes = 0;
  let truncated = "";
  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (bytes + characterBytes > maximumBytes) break;
    bytes += characterBytes;
    truncated += character;
  }
  return truncated;
}
