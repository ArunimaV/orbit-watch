export interface ApproachTime {
  local: string;
  relative: string | null;
  utc: string;
  label: string;
  speech: string;
}

export function formatLocalTime(iso: string, timeZone: string, now?: Date): string {
  if (now) return formatApproachTime(iso, timeZone, now).label;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return localDateTime(date, safeTimeZone(timeZone));
}

/**
 * Closest-approach wording for the viewer's zone.
 * Same local calendar day at 5 PM or later is "tonight"; earlier that day is
 * "today"; the next calendar day is "tomorrow". Other days keep the weekday
 * already present in the local date.
 */
export function formatApproachTime(iso: string, timeZone: string, now: Date): ApproachTime {
  const date = new Date(iso);
  const zone = safeTimeZone(timeZone);
  if (Number.isNaN(date.getTime())) {
    return { local: iso, relative: null, utc: iso, label: iso, speech: iso };
  }

  const local = localDateTime(date, zone);
  const relative = relativeDay(date, now, zone);
  const utc = utcLine(date);
  const label = relative ? `${local} (${relative})` : local;
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  const speech = relative ? `${relative} at ${clock}` : local;
  return { local, relative, utc, label, speech };
}

export function safeTimeZone(timeZone: string | undefined): string {
  const zone = timeZone?.trim() || "UTC";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

function localDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function utcLine(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} UTC`;
}

function relativeDay(date: Date, now: Date, timeZone: string): string | null {
  const eventDay = calendarDay(date, timeZone);
  const nowDay = calendarDay(now, timeZone);
  const diffDays = Math.round(
    (Date.UTC(eventDay.year, eventDay.month - 1, eventDay.day) -
      Date.UTC(nowDay.year, nowDay.month - 1, nowDay.day)) /
      86_400_000,
  );
  if (diffDays === 0) return eventDay.hour >= 17 ? "tonight" : "today";
  if (diffDays === 1) return "tomorrow";
  return null;
}

function calendarDay(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}
