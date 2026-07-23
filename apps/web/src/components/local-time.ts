import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInMonths,
  differenceInWeeks,
  differenceInYears,
  intlFormat,
  isAfter,
  isSameDay,
} from "date-fns";

export const compactRelativeTime = (value: Date, now: Date): string => {
  if (isAfter(value, now)) return "now";

  const minutes = differenceInMinutes(now, value);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;

  const hours = differenceInHours(now, value);
  if (hours < 24) return `${hours}h`;

  const days = differenceInDays(now, value);
  if (days < 7) return `${days}d`;
  if (days < 28) return `${differenceInWeeks(now, value)}w`;
  if (days < 365) return `${Math.max(1, differenceInMonths(now, value))}mo`;
  return `${Math.max(1, differenceInYears(now, value))}y`;
};

export const messageTimestampLabel = (value: Date, now: Date): string =>
  isSameDay(value, now)
    ? compactRelativeTime(value, now)
    : intlFormat(value, { year: "2-digit", month: "2-digit", day: "2-digit" });

export const fullLocalTimestamp = (value: Date): string =>
  intlFormat(value, { dateStyle: "medium", timeStyle: "long" });
