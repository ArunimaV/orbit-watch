/** Missing or any value other than "off" keeps the demo talking. */
export const VOICE_STORAGE_KEY = "orbit-watch-voice";

type Listener = () => void;

const listeners = new Set<Listener>();
const speechStops = new Set<() => void>();

export function voicePreferenceEnabled(stored: string | null | undefined): boolean {
  return stored !== "off";
}

export function readVoiceEnabled(): boolean {
  try {
    return voicePreferenceEnabled(browserStorage()?.getItem(VOICE_STORAGE_KEY) ?? null);
  } catch {
    return true;
  }
}

export function setVoiceEnabled(enabled: boolean): void {
  try {
    browserStorage()?.setItem(VOICE_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Private mode can reject the write. Listeners still mute this session.
  }
  if (!enabled) {
    for (const stop of [...speechStops]) {
      try {
        stop();
      } catch {
        // One player failing should not leave the others running.
      }
    }
  }
  for (const listener of [...listeners]) listener();
}

export function subscribeVoiceEnabled(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Register a callback that pauses audio the moment voice is turned off. */
export function bindSpeechStop(stop: () => void): () => void {
  speechStops.add(stop);
  return () => {
    speechStops.delete(stop);
  };
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}
