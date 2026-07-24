import { describe, expect, it } from "vite-plus/test";
import {
  channelPurposeValidity,
  messageBodyValidity,
  topicTitleValidity,
} from "./content-bounds.ts";

describe("participant-facing content bounds", () => {
  it("measures Topic titles and Channel purposes in UTF-8 bytes", () => {
    expect(topicTitleValidity("é".repeat(256))).toBe("");
    expect(topicTitleValidity("é".repeat(257))).toContain("512 bytes");
    expect(channelPurposeValidity("é".repeat(1024))).toBe("");
    expect(channelPurposeValidity("é".repeat(1025))).toContain("2 KiB");
    expect(messageBodyValidity("é".repeat(4096))).toBe("");
    expect(messageBodyValidity("é".repeat(4097))).toContain("8 KiB");
  });
});
