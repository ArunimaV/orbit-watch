"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function ShareAlertButton({ text, tone = "card" }: { text: string; tone?: "card" | "banner" }) {
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
          void shareAlert(text, () => setCopied(true));
        }}
        className={`shrink-0 rounded border font-medium uppercase ${
          tone === "banner"
            ? `py-0 text-xs tracking-[0.16em] ${copied ? "px-1.5" : "px-0"}`
            : "px-2 py-1 text-[11px] tracking-wide"
        } ${copied ? "border-accent bg-accent text-background" : "border-transparent text-muted hover:text-accent"}`}
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

async function shareAlert(text: string, onCopied: () => void): Promise<void> {
  const payload: ShareData = { title: "Orbit Watch alert", text };
  if (shouldUseWebShare(payload)) {
    try {
      await navigator.share(payload);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  // Selection copy has to happen in this click, before any await, or the browser rejects it.
  if (copyWithSelection(text)) {
    onCopied();
    return;
  }
  try {
    await navigator.clipboard?.writeText(text);
    onCopied();
  } catch {
    // Leave the button unchanged when nothing was copied.
  }
}

function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
}
