import { expect, test } from "vite-plus/test";
import { compactRelativeTime, fullLocalTimestamp, messageTimestampLabel } from "./local-time.ts";

test("formats compact relative timestamps", () => {
  const now = new Date("2026-07-23T14:00:00.000Z");

  expect(compactRelativeTime(new Date("2026-07-23T13:15:00.000Z"), now)).toBe("45m");
  expect(compactRelativeTime(new Date("2026-07-23T09:30:00.000Z"), now)).toBe("4h");
  expect(compactRelativeTime(new Date("2026-07-14T14:00:00.000Z"), now)).toBe("1w");
  expect(compactRelativeTime(new Date("2026-07-23T14:01:00.000Z"), now)).toBe("now");
});

test("uses relative time only when a message is from the same local calendar day", () => {
  const now = new Date(2026, 6, 23, 10);

  expect(messageTimestampLabel(new Date(2026, 6, 23, 9, 15), now)).toBe("45m");
  expect(messageTimestampLabel(new Date(2026, 6, 22, 23, 30), now)).toBe("07/22/26");
});

test("formats the full hover timestamp in the runtime's local timezone", () => {
  const formatted = fullLocalTimestamp(new Date(2026, 6, 22, 23, 30));

  expect(formatted).toContain("Jul 22, 2026");
  expect(formatted).toContain("11:30:00 PM");
  expect(formatted).toMatch(/(?:GMT|UTC|[A-Z]{3,5})/);
});
