import { describe, expect, it } from "vitest";
import { base64ToPcm16, downsampleToPcm16, pcm16ToBase64 } from "./pcm";

describe("pcm", () => {
  it("downsamples 48 kHz audio to 24 kHz PCM16", () => {
    const input = new Float32Array(480);
    input.fill(0.5);
    const pcm = downsampleToPcm16(input, 48000, 24000);
    expect(pcm.length).toBe(240);
    expect(pcm[0]).toBeGreaterThan(16000);
    expect(pcm[0]).toBeLessThan(17000);
  });

  it("round-trips PCM16 through base64", () => {
    const original = Int16Array.from([0, 1, -1, 32767, -32768]);
    const decoded = base64ToPcm16(pcm16ToBase64(original));
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });
});
