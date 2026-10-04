"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function ShareAlertButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <>
      <button
        type="button"
        aria-label="Share this alert"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void shareAlert(text).then((copiedNow) => {
            if (copiedNow) setCopied(true);
          });
        }}
        className={`shrink-0 rounded border px-2 py-1 text-[11px] font-medium tracking-wide uppercase ${
          copied ? "border-accent bg-accent text-background" : "border-transparent text-muted hover:text-accent"
        }`}
      >
        {copied ? "Copied!" : "Share"}
      </button>
      {copied &&
        createPortal(
          <p
            role="status"
            className="pointer-events-none fixed bottom-8 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-accent px-6 py-3 text-base font-semibold tracking-wide text-background shadow-lg"
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
