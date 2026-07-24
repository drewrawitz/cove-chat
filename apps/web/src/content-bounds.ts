const utf8Encoder = new TextEncoder();

const utf8ByteLength = (value: string): number => utf8Encoder.encode(value.trim()).byteLength;

export const topicTitleValidity = (value: string): string =>
  utf8ByteLength(value) <= 512 ? "" : "Topic titles are limited to 512 bytes.";

export const channelPurposeValidity = (value: string): string =>
  utf8ByteLength(value) <= 2 * 1024 ? "" : "Channel purposes are limited to 2 KiB.";

export const messageBodyValidity = (value: string): string =>
  utf8ByteLength(value) <= 8 * 1024 ? "" : "Messages are limited to 8 KiB.";

export const applyTopicTitleValidity = (input: HTMLInputElement): void => {
  input.setCustomValidity(topicTitleValidity(input.value));
};

export const applyChannelPurposeValidity = (input: HTMLTextAreaElement): void => {
  input.setCustomValidity(channelPurposeValidity(input.value));
};

export const applyMessageBodyValidity = (input: HTMLTextAreaElement): void => {
  input.setCustomValidity(messageBodyValidity(input.value));
};
