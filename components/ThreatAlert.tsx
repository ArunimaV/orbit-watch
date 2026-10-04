"use client";

import { useEffect, useRef, useState } from "react";
import { ShareAlertButton } from "@/components/ShareAlertButton";
import { useVoicePreference } from "@/components/VoicePreference";
import { threatHeadline } from "@/lib/countdown";
import { grokAlertFeedLine, postMissionFeed } from "@/lib/mission-room";
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
  const [played, setPlayed] = useState(false);
  const { enabled: voiceEnabled } = useVoicePreference();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const replayRef = useRef<(() => Promise<void>) | null>(null);
  const headline = threatHeadline(count, satelliteName, when);
  const headlineRef = useRef(headline);
  headlineRef.current = headline;

  useEffect(() => {
    const audio = audioRef;
    return () => {
      releaseAudio(audio);
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!armed || count < 1) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setVisible(true);
      setPlayed(false);
      setPlayable(false);
      const alreadySpoken = sessionStorage.getItem(SESSION_KEY) === "1";
      if (!alreadySpoken) {
        sessionStorage.setItem(SESSION_KEY, "1");
        postMissionFeed("grok", grokAlertFeedLine(headlineRef.current));
      }
      void speakAlert(headlineRef.current, audioRef, replayRef, {
        showButton: () => setPlayable(true),
        markPlayed: () => {
          setPlayed(true);
          setPlayable(true);
        },
      }, !alreadySpoken);
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
                const replay = replayRef.current;
                if (!replay) return;
                void replay().then(() => setPlayed(true)).catch(() => setPlayable(true));
              }}
            >
              {played ? "Replay alert" : "Play alert"}
            </button>
          )}
          <button
            type="button"
            className="text-xs font-medium tracking-[0.16em] text-muted uppercase"
            onClick={() => {
              audioRef.current?.pause();
              window.speechSynthesis?.cancel();
              setVisible(false);
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function releaseAudio(audioRef: { current: HTMLAudioElement | null }) {
  const previous = audioRef.current;
  if (!previous) return;
  previous.pause();
  if (previous.src.startsWith("blob:")) URL.revokeObjectURL(previous.src);
  audioRef.current = null;
}

function speakInBrowser(text: string): Promise<void> {
  const synth = window.speechSynthesis;
  if (!synth) return Promise.reject(new Error("Speech is not available"));
  synth.cancel();
  synth.getVoices();
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(startTimer);
      if (ok) resolve();
      else reject(new Error("Speech did not play"));
    };
    const startTimer = window.setTimeout(() => {
      if (!synth.speaking && !synth.pending) finish(false);
    }, 700);
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    synth.speak(utterance);
  });
}

async function speakAlert(
  text: string,
  audioRef: { current: HTMLAudioElement | null },
  replayRef: { current: (() => Promise<void>) | null },
  callbacks: { showButton: () => void; markPlayed: () => void },
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
    if (response.ok && !contentType.includes("application/json")) {
      const blob = await response.blob();
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        releaseAudio(audioRef);
        audioRef.current = audio;
        replayRef.current = async () => {
          if (!readVoiceEnabled()) return;
          audio.currentTime = 0;
          await audio.play();
        };
        if (!readVoiceEnabled()) {
          audio.pause();
          releaseAudio(audioRef);
          replayRef.current = null;
          return;
        }
        if (!autoplay) {
          callbacks.showButton();
          return;
        }
        try {
          await audio.play();
          callbacks.markPlayed();
        } catch {
          callbacks.showButton();
        }
        return;
      }
    }
  } catch {
    // Fall through to the browser voice when the server has no speech bytes.
  }
  replayRef.current = () => speakInBrowser(text);
  if (!autoplay) {
    callbacks.showButton();
    return;
  }
  try {
    await replayRef.current();
    callbacks.markPlayed();
  } catch {
    callbacks.showButton();
  }
}
