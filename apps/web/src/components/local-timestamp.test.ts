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
  const previousDay = new Date(2026, 6, 22, 23, 30);
  const expectedPreviousDay = new Intl.DateTimeFormat(undefined, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(previousDay);

  expect(messageTimestampLabel(new Date(2026, 6, 23, 9, 15), now)).toBe("45m");
  expect(messageTimestampLabel(previousDay, now)).toBe(expectedPreviousDay);
});

test("formats the full hover timestamp in the runtime's local timezone", () => {
  const timestamp = new Date(2026, 6, 22, 23, 30);
  const expected = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "long",
  }).format(timestamp);

  expect(fullLocalTimestamp(timestamp)).toBe(expected);
});
