import { socratesTableUrl } from "@/lib/countdown";
import { formatApproachTime } from "@/lib/time-format";
import type { RankedEvent } from "@/lib/types";

export interface ShareAlertFacts {
  satelliteName: string;
  satelliteNorad: number;
  otherName: string;
  otherNorad: number;
  tca: string;
  nowIso: string;
  rangeKm: number;
  relSpeedKms: number;
  maxProb: number | null;
  tier: string;
}

export interface ShareTarget {
  userAgent: string;
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export function shareFactsFromRanked(event: RankedEvent, nowIso: string): ShareAlertFacts {
  return {
    satelliteName: event.ours.name,
    satelliteNorad: event.ours.noradId,
    otherName: event.other.name,
    otherNorad: event.other.noradId,
    tca: event.tca,
    nowIso,
    rangeKm: event.rangeKm,
    relSpeedKms: event.relSpeedKms,
    maxProb: event.maxProb,
    tier: event.tier,
  };
}

/** Plain-English note for a team chat. Local time is the viewer's zone; UTC is the clock time. */
export function shareAlertText(facts: ShareAlertFacts, timeZone: string, appUrl: string): string {
  const now = new Date(facts.nowIso);
  const when = formatApproachTime(facts.tca, timeZone, Number.isNaN(now.getTime()) ? new Date() : now);
  const prob =
    facts.maxProb === null || !Number.isFinite(facts.maxProb) ? "unknown" : facts.maxProb.toExponential(1);
  return [
    `Orbit Watch alert: ${facts.satelliteName} (NORAD ${facts.satelliteNorad}) vs ${facts.otherName} (${facts.otherNorad}).`,
    `Closest approach ${when.local} (${utcClock(facts.tca)}).`,
    `Miss distance ${formatMiss(facts.rangeKm)} at ${facts.relSpeedKms.toFixed(1)} km/s, max probability ${prob}.`,
    `Verdict: ${facts.tier}.`,
    `Verify: ${socratesTableUrl(facts.satelliteNorad)} · ${appUrl}`,
  ].join(" ");
}

/** Phones open the share sheet. Everywhere else copies. Cancelling the sheet does not copy. */
export async function deliverShare(text: string, target: ShareTarget): Promise<"shared" | "copied" | "cancelled"> {
  const share = target.share;
  if (prefersWebShare(target.userAgent) && typeof share === "function") {
    try {
      await share({ text });
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
    }
  }
  const writeText = target.clipboard?.writeText;
  if (typeof writeText !== "function") throw new Error("Clipboard is not available");
  await writeText.call(target.clipboard, text);
  return "copied";
}

function prefersWebShare(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Android/i.test(userAgent);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function formatMiss(km: number): string {
  const meters = Math.round(km * 1000);
  if (meters < 10_000) return `${meters.toLocaleString("en-US")} m`;
  return `${km.toFixed(2)} km`;
}

function utcClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")} UTC`;
}
