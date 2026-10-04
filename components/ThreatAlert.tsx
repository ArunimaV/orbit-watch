"use client";

import { useEffect, useRef, useState } from "react";
import { ShareAlertButton } from "@/components/ShareAlertButton";
import { useVoicePreference } from "@/components/VoicePreference";
import { threatHeadline } from "@/lib/countdown";
import { shareAlertText } from "@/lib/share-alert";
import { bindSpeechStop, readVoiceEnabled } from "@/lib/voice-preference";
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
  const { enabled: voiceEnabled } = useVoicePreference();
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

  useEffect(
    () =>
      bindSpeechStop(() => {
        audioRef.current?.pause();
      }),
    [],
  );

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-40 px-3 md:top-[42px] md:grid md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(240px,300px)] md:px-0">
      <div
        role="status"
        className="pointer-events-auto orbit-fade-in flex items-center gap-3 rounded border border-act/40 bg-panel/90 px-3 py-1.5 shadow-sm md:col-start-2 md:mx-4"
      >
        <p className="min-w-0 flex-1 text-xs leading-5 text-foreground md:truncate">{headline}</p>
        <div className="flex shrink-0 items-center gap-4">
          {lead && (
            <ShareAlertButton
              tone="banner"
              text={shareAlertText({
                satelliteName,
                event: lead,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              })}
            />
          )}
          {playable && voiceEnabled && (
            <button
              type="button"
              className="text-xs font-medium tracking-[0.16em] text-accent uppercase"
              onClick={() => {
                if (!readVoiceEnabled()) return;
                void audioRef.current?.play().then(() => setPlayable(false)).catch(() => setPlayable(true));
              }}
            >
              Play alert
            </button>
          )}
          <button
            type="button"
            className="text-xs font-medium tracking-[0.16em] text-muted uppercase"
            onClick={() => setVisible(false)}
          >
            Dismiss
          </button>
        </div>
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
  if (!readVoiceEnabled()) return;
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
    if (!readVoiceEnabled()) {
      audio.pause();
      audioRef.current = null;
      URL.revokeObjectURL(url);
      return;
    }
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
