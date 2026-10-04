"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { deliverShare, shareAlertText, type ShareAlertFacts } from "@/lib/share-alert";

export function ShareAlertButton({ facts }: { facts: ShareAlertFacts }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <button
        type="button"
        aria-label="Share this alert"
        className="shrink-0 text-[10px] tracking-wide text-muted uppercase hover:text-accent"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
          const text = shareAlertText(facts, zone, window.location.origin);
          void deliverShare(text, navigator)
            .then((result) => {
              if (result === "copied") setCopied(true);
            })
            .catch(() => setCopied(false));
        }}
      >
        Share
      </button>
      {copied &&
        createPortal(
          <div
            role="status"
            className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded border border-accent/40 bg-panel px-3 py-1 text-xs text-accent shadow-sm"
          >
            Copied!
          </div>,
          document.body,
        )}
    </>
  );
}
