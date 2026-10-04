import { socratesTableUrl } from "@/lib/countdown";
import { safeTimeZone } from "@/lib/time-format";

export interface ShareAlertInput {
  satelliteName: string;
  satelliteNorad: number;
  threatName: string;
  threatNorad: number;
  tca: string;
  timeZone: string;
  rangeKm: number;
  relSpeedKms: number;
  maxProb: number | null;
  tier: string;
  appUrl: string;
}

export function shareAlertText(input: ShareAlertInput): string {
  const date = new Date(input.tca);
  const zone = safeTimeZone(input.timeZone);
  const local = Number.isNaN(date.getTime())
    ? input.tca
    : new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(date);
  const utc = Number.isNaN(date.getTime()) ? input.tca : utcClock(date);
  const probability =
    input.maxProb === null || !Number.isFinite(input.maxProb) ? "unknown" : input.maxProb.toExponential(1);
  return [
    `Orbit Watch alert: ${input.satelliteName} (NORAD ${input.satelliteNorad}) vs ${input.threatName} (${input.threatNorad}).`,
    `Closest approach ${local} (${utc}).`,
    `Miss distance ${formatRange(input.rangeKm)} at ${formatSpeed(input.relSpeedKms)} km/s, max probability ${probability}.`,
    `Verdict: ${input.tier}.`,
    `Verify: ${socratesTableUrl(input.satelliteNorad)} · ${input.appUrl}`,
  ].join(" ");
}

function formatSpeed(kms: number): string {
  if (!Number.isFinite(kms)) return "unknown";
  return kms >= 1 ? kms.toFixed(1) : kms.toFixed(3);
}

function formatRange(km: number): string {
  const meters = km * 1000;
  if (meters < 10_000) return `${Math.round(meters).toLocaleString("en-US")} m`;
  return `${km.toFixed(2)} km`;
}

function utcClock(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")} UTC`;
}

type ShareHost = {
  share?: (data: { title?: string; text?: string }) => Promise<void>;
  clipboard?: { writeText: (value: string) => Promise<void> };
  userAgent?: string;
};

function useWebShare(nav: ShareHost): boolean {
  if (typeof nav.share !== "function") return false;
  const ua = nav.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

export async function deliverShare(
  text: string,
  host?: ShareHost,
): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const nav = host ?? (typeof navigator === "undefined" ? undefined : navigator);
  if (nav && useWebShare(nav)) {
    try {
      await nav.share({ title: "Orbit Watch alert", text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    if (!nav?.clipboard?.writeText) return "failed";
    await nav.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
