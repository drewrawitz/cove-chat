interface LocalTimeOptions {
  readonly locale?: string | ReadonlyArray<string>;
  readonly timeZone?: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const formatter = (
  name: string,
  options: LocalTimeOptions,
  formatOptions: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  const locales = options.locale;
  const localeKey = typeof locales === "string" ? locales : (locales?.join(",") ?? "default");
  const key = `${name}:${localeKey}:${options.timeZone ?? "local"}`;
  const cached = formatterCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const created = new Intl.DateTimeFormat(locales, {
    ...formatOptions,
    ...(options.timeZone === undefined ? {} : { timeZone: options.timeZone }),
  });
  formatterCache.set(key, created);
  return created;
};

export const compactRelativeTime = (value: Date, now: Date): string => {
  const elapsedMilliseconds = Math.max(0, now.getTime() - value.getTime());
  const minutes = Math.floor(elapsedMilliseconds / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 28) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
};

const calendarDay = (value: Date, options: LocalTimeOptions): string => {
  const parts = formatter("calendar-day", options, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const messageTimestampLabel = (
  value: Date,
  now: Date,
  options: LocalTimeOptions = {},
): string =>
  calendarDay(value, options) === calendarDay(now, options)
    ? compactRelativeTime(value, now)
    : formatter("message-date", options, {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
      }).format(value);

export const fullLocalTimestamp = (value: Date, options: LocalTimeOptions = {}): string =>
  formatter("full-timestamp", options, {
    dateStyle: "medium",
    timeStyle: "long",
  }).format(value);
