"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function ShareAlertButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <button
        type="button"
        aria-label="Share this alert"
        onClick={(event) => {
          event.stopPropagation();
          void shareAlert(text).then((copiedNow) => {
            if (copiedNow) setCopied(true);
          });
        }}
        className="text-[10px] tracking-wide text-muted uppercase hover:text-accent"
      >
        Share
      </button>
      {copied &&
        createPortal(
          <p
            role="status"
            className="pointer-events-none fixed bottom-14 left-1/2 z-[60] -translate-x-1/2 rounded border border-accent/50 bg-panel px-3 py-1.5 text-xs tracking-wide text-foreground shadow-lg"
          >
            Copied!
          </p>,
          document.body,
        )}
    </>
  );
}

async function shareAlert(text: string): Promise<boolean> {
  const payload = { title: "Orbit Watch alert", text };
  if (typeof navigator.share === "function") {
    try {
      const allowed = typeof navigator.canShare !== "function" || navigator.canShare(payload);
      if (allowed) {
        await navigator.share(payload);
        return false;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
    }
  }
  await copyText(text);
  return true;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the selection copy for browsers that block the async API.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
}
