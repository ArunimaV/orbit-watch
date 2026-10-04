"use client";

import { useEffect, useState } from "react";
import { deliverShare, shareAlertText } from "@/lib/share-alert";
import type { RankedEvent } from "@/lib/types";

export function ShareAlertButton({
  event,
  satelliteName,
}: {
  event: RankedEvent;
  satelliteName: string;
}) {
  const [copied, setCopied] = useState(false);
  const name = satelliteName || event.ours.name;

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function onShare() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const text = shareAlertText({
      satelliteName: name,
      satelliteNorad: event.ours.noradId,
      threatName: event.other.name,
      threatNorad: event.other.noradId,
      tca: event.tca,
      timeZone: zone,
      rangeKm: event.rangeKm,
      relSpeedKms: event.relSpeedKms,
      maxProb: event.maxProb,
      tier: event.tier,
      appUrl: window.location.origin,
    });
    const result = await deliverShare(text);
    if (result === "copied") setCopied(true);
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Share this alert: ${name} versus ${event.other.name}`}
        onClick={(click) => {
          click.stopPropagation();
          void onShare();
        }}
        className="shrink-0 text-[10px] tracking-wide text-muted uppercase hover:text-foreground"
      >
        Share
      </button>
      {copied && (
        <span
          role="status"
          className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded border border-edge bg-panel px-3 py-1 text-xs text-foreground"
        >
          Copied!
        </span>
      )}
    </>
  );
}
