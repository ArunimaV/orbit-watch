import { describe, expect, it } from "vitest";
import { bindSpeechStop, setVoiceEnabled, voicePreferenceEnabled } from "./voice-preference";

describe("voice preference", () => {
  it("stays on unless the saved choice is off", () => {
    expect(voicePreferenceEnabled(null)).toBe(true);
    expect(voicePreferenceEnabled(undefined)).toBe(true);
    expect(voicePreferenceEnabled("on")).toBe(true);
    expect(voicePreferenceEnabled("")).toBe(true);
    expect(voicePreferenceEnabled("off")).toBe(false);
  });

  it("stops speech when voice is turned off", () => {
    let stops = 0;
    const release = bindSpeechStop(() => {
      stops += 1;
    });
    setVoiceEnabled(true);
    expect(stops).toBe(0);
    setVoiceEnabled(false);
    expect(stops).toBe(1);
    release();
    setVoiceEnabled(false);
    expect(stops).toBe(1);
  });
});
