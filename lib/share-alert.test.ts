import { describe, expect, it, vi } from "vitest";
import { deliverShare, shareAlertText, type ShareAlertFacts } from "./share-alert";

const NOW = "2026-10-04T16:00:00.000Z";
const SL8 = "2026-10-05T01:26:28.592Z";

const swisscube: ShareAlertFacts = {
  satelliteName: "SwissCube",
  satelliteNorad: 35932,
  otherName: "SL-8 DEB",
  otherNorad: 19831,
  tca: SL8,
  nowIso: NOW,
  rangeKm: 0.621,
  relSpeedKms: 13.881,
  maxProb: 5.614e-6,
  tier: "Act",
};

describe("shareAlertText", () => {
  it("writes the SwissCube pass in local time plus UTC", () => {
    const text = shareAlertText(swisscube, "America/New_York", "https://orbit-watch.example");
    expect(text).toBe(
      "Orbit Watch alert: SwissCube (NORAD 35932) vs SL-8 DEB (19831). Closest approach Sun, Oct 4, 9:26 PM EDT (01:26 UTC). Miss distance 621 m at 13.9 km/s, max probability 5.6e-6. Verdict: Act. Verify: https://celestrak.org/SOCRATES/table-socrates.php?CATNR=35932&ORDER=MINRANGE&MAX=25 · https://orbit-watch.example",
    );
  });

  it("uses the viewer's zone and the threat on the card", () => {
    const text = shareAlertText(
      {
        ...swisscube,
        satelliteName: "AO-91",
        satelliteNorad: 43017,
        otherName: "STARLINK-34664",
        otherNorad: 64806,
        rangeKm: 1.281,
        relSpeedKms: 15.026,
        maxProb: 0.00002846,
        tier: "Watch",
      },
      "UTC",
      "https://orbit-watch.example/lookup",
    );
    expect(text).toContain("AO-91 (NORAD 43017) vs STARLINK-34664 (64806)");
    expect(text).toContain("Verdict: Watch");
    expect(text).toContain("CATNR=43017");
    expect(text).toContain("https://orbit-watch.example/lookup");
    expect(text).toContain("1,281 m at 15.0 km/s");
    expect(text).toMatch(/max probability 2\.8e-5/);
  });
});

describe("deliverShare", () => {
  it("copies on a desktop even if a share function exists", async () => {
    const writeText = vi.fn(async () => undefined);
    const share = vi.fn(async () => undefined);
    const result = await deliverShare("note", {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0",
      share,
      clipboard: { writeText },
    });
    expect(result).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("note");
    expect(share).not.toHaveBeenCalled();
  });

  it("opens the share sheet on a phone", async () => {
    const writeText = vi.fn(async () => undefined);
    const share = vi.fn(async () => undefined);
    const result = await deliverShare("note", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      share,
      clipboard: { writeText },
    });
    expect(result).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "note" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("does not copy when the phone share sheet is cancelled", async () => {
    const writeText = vi.fn(async () => undefined);
    const result = await deliverShare("note", {
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
      share: async () => {
        throw new DOMException("Share canceled", "AbortError");
      },
      clipboard: { writeText },
    });
    expect(result).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies when a phone has no share function", async () => {
    const writeText = vi.fn(async () => undefined);
    const result = await deliverShare("note", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      clipboard: { writeText },
    });
    expect(result).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("note");
  });
});
