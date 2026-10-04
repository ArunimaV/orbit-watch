"use client";

import { useEffect, useRef, useState } from "react";
import { ShareAlertButton } from "@/components/ShareAlertButton";
import { threatHeadline } from "@/lib/countdown";
import { shareAlertText } from "@/lib/share-alert";
import type { RankedEvent } from "@/lib/types";

const SESSION_KEY = "orbit-watch-alert";

export function ThreatAlert({
  armed,
  count,
  satelliteName,
  when,
  lead,
}: {
  armed: boolean;
  count: number;
  satelliteName: string;
  when: string | null;
  lead: RankedEvent | null;
}) {
  const [visible, setVisible] = useState(false);
  const [playable, setPlayable] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const headline = threatHeadline(count, satelliteName, when);
  const headlineRef = useRef(headline);
  headlineRef.current = headline;

  useEffect(() => {
    if (!armed || count < 1) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setVisible(true);
      const alreadySpoken = sessionStorage.getItem(SESSION_KEY) === "1";
      if (!alreadySpoken) sessionStorage.setItem(SESSION_KEY, "1");
      void speakAlert(headlineRef.current, audioRef, setPlayable, !alreadySpoken);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [armed, count]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-40 flex justify-center px-3">
      <div
        role="status"
        className="pointer-events-auto orbit-fade-in flex max-w-md items-center gap-2 rounded border border-act/40 bg-panel/90 px-3 py-1.5 shadow-sm"
      >
        <p className="text-xs leading-snug text-foreground">{headline}</p>
        {lead && (
          <ShareAlertButton
            text={shareAlertText({
              satelliteName,
              event: lead,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            })}
          />
        )}
        {playable && (
          <button
            type="button"
            className="shrink-0 text-[10px] tracking-wide text-accent uppercase"
            onClick={() => {
              void audioRef.current?.play().then(() => setPlayable(false)).catch(() => setPlayable(true));
            }}
          >
            Play alert
          </button>
        )}
        <button
          type="button"
          className="shrink-0 text-[10px] tracking-wide text-muted uppercase"
          onClick={() => setVisible(false)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

async function speakAlert(
  text: string,
  audioRef: { current: HTMLAudioElement | null },
  setPlayable: (value: boolean) => void,
  autoplay: boolean,
) {
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || contentType.includes("application/json")) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => URL.revokeObjectURL(url);
    if (!autoplay) {
      setPlayable(true);
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlayable(true);
    }
  } catch {
    // The banner text is the fallback when speech cannot be fetched or played.
  }
}
