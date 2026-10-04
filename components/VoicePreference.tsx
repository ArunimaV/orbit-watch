"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readVoiceEnabled, setVoiceEnabled, subscribeVoiceEnabled } from "@/lib/voice-preference";

interface VoicePreferenceValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const VoicePreferenceContext = createContext<VoicePreferenceValue | null>(null);

export function VoicePreferenceProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    setEnabledState(readVoiceEnabled());
    return subscribeVoiceEnabled(() => setEnabledState(readVoiceEnabled()));
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setVoiceEnabled(value);
  }, []);

  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);
  return <VoicePreferenceContext.Provider value={value}>{children}</VoicePreferenceContext.Provider>;
}

export function useVoicePreference(): VoicePreferenceValue {
  const value = useContext(VoicePreferenceContext);
  if (!value) throw new Error("useVoicePreference must be used within VoicePreferenceProvider");
  return value;
}

export function VoiceToggle() {
  const { enabled, setEnabled } = useVoicePreference();
  return (
    <button
      type="button"
      aria-label={enabled ? "Voice on" : "Voice off"}
      aria-pressed={enabled}
      onClick={() => setEnabled(!enabled)}
      className={`rounded border border-edge p-1 hover:border-accent ${enabled ? "text-accent" : "text-muted"}`}
    >
      <SpeakerIcon off={!enabled} />
    </button>
  );
}

function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6.25h2.1L7.75 3.5v9L4.6 9.75H2.5z" />
      {off ? (
        <path d="M10.25 6.25 13.25 9.75M13.25 6.25 10.25 9.75" />
      ) : (
        <>
          <path d="M10.1 6.15a2.5 2.5 0 0 1 0 3.7" />
          <path d="M11.85 4.55a4.6 4.6 0 0 1 0 6.9" />
        </>
      )}
    </svg>
  );
}
