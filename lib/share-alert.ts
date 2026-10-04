import { socratesTableUrl } from "./countdown";
import { safeTimeZone } from "./time-format";

/** Live demo the shared note should point a teammate at. */
export const ORBIT_WATCH_PUBLIC_URL = "https://orbit-watch-nu.vercel.app";

export interface ShareAlertEvent {
  ours: { noradId: number; name: string };
  other: { noradId: number; name: string };
  tca: string;
  rangeKm: number;
  relSpeedKms: number;
  maxProb: number | null;
  tier: string;
}

/**
 * Plain-English note for a team chat. `satelliteName` is the label the
 * dashboard already shows, so a later catalog lookup flows through unchanged.
 */
export function shareAlertText(options: {
  satelliteName: string;
  event: ShareAlertEvent;
  timeZone: string;
}): string {
  const { event } = options;
  const oursName = options.satelliteName.trim() || event.ours.name;
  const when = formatShareApproach(event.tca, options.timeZone);
  const verify = socratesTableUrl(event.ours.noradId);
  return [
    `Orbit Watch alert: ${oursName} (NORAD ${event.ours.noradId}) vs ${event.other.name} (${event.other.noradId}).`,
    `Closest approach ${when}.`,
    `Miss distance ${formatShareMiss(event.rangeKm)} at ${formatShareSpeed(event.relSpeedKms)}, max probability ${formatShareProb(event.maxProb)}.`,
    `Verdict: ${event.tier}.`,
    `Verify: ${verify} · ${ORBIT_WATCH_PUBLIC_URL}`,
  ].join(" ");
}

export function formatShareApproach(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const zone = safeTimeZone(timeZone);
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(date);
  const utc = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const day = `${part(local, "weekday")} ${part(local, "month")} ${part(local, "day")}`;
  const clock = `${part(local, "hour")}:${part(local, "minute")} ${part(local, "dayPeriod")} ${part(local, "timeZoneName")}`.trim();
  return `${day}, ${clock} (${part(utc, "hour")}:${part(utc, "minute")} UTC)`;
}

function formatShareMiss(rangeKm: number): string {
  if (!Number.isFinite(rangeKm)) return "unknown";
  const meters = rangeKm * 1000;
  if (Math.abs(meters) < 10_000) return `${Math.round(meters)} m`;
  return `${rangeKm.toFixed(2)} km`;
}

function formatShareSpeed(kms: number): string {
  if (!Number.isFinite(kms)) return "unknown speed";
  const digits = Math.abs(kms) >= 1 ? 1 : 3;
  return `${kms.toFixed(digits)} km/s`;
}

function formatShareProb(prob: number | null): string {
  if (prob === null || !Number.isFinite(prob) || prob <= 0) return "unknown";
  return prob.toExponential(1);
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}
