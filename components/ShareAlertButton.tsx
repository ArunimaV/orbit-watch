"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function ShareAlertButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2400);
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
        className="shrink-0 text-[10px] tracking-wide text-muted uppercase hover:text-accent"
      >
        Share
      </button>
      {copied &&
        createPortal(
          <p
            role="status"
            className="pointer-events-none fixed top-20 left-1/2 z-[80] -translate-x-1/2 rounded border border-accent bg-background px-4 py-2 text-sm font-medium tracking-wide text-accent shadow-lg"
          >
            Copied!
          </p>,
          document.body,
        )}
    </>
  );
}

function shouldUseWebShare(payload: ShareData): boolean {
  if (typeof navigator.share !== "function") return false;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  if (!coarsePointer || navigator.maxTouchPoints < 1) return false;
  return typeof navigator.canShare !== "function" || navigator.canShare(payload);
}

async function shareAlert(text: string): Promise<boolean> {
  const payload: ShareData = { title: "Orbit Watch alert", text };
  if (shouldUseWebShare(payload)) {
    try {
      await navigator.share(payload);
      return false;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
    }
  }
  try {
    await copyText(text);
  } catch {
    return false;
  }
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
