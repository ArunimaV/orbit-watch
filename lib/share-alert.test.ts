import { describe, expect, it, vi } from "vitest";
import { deliverShare, shareAlertText } from "@/lib/share-alert";

const SL8 = {
  satelliteName: "SwissCube",
  satelliteNorad: 35932,
  threatName: "SL-8 DEB",
  threatNorad: 19831,
  tca: "2026-10-05T01:26:28.592Z",
  timeZone: "America/New_York",
  rangeKm: 0.621,
  relSpeedKms: 13.881,
  maxProb: 5.614e-6,
  tier: "Act",
  appUrl: "https://orbit-watch.example",
};

describe("shareAlertText", () => {
  it("writes the SwissCube pass in local time plus UTC", () => {
    expect(shareAlertText(SL8)).toBe(
      "Orbit Watch alert: SwissCube (NORAD 35932) vs SL-8 DEB (19831). Closest approach Sun, Oct 4, 9:26 PM EDT (01:26 UTC). Miss distance 621 m at 13.9 km/s, max probability 5.6e-6. Verdict: Act. Verify: https://celestrak.org/SOCRATES/table-socrates.php?CATNR=35932&ORDER=MINRANGE&MAX=25 · https://orbit-watch.example",
    );
  });

  it("uses the satellite and threat that are actually shown", () => {
    const text = shareAlertText({
      ...SL8,
      satelliteName: "AO-91",
      satelliteNorad: 43017,
      threatName: "FENGYUN 1C DEB",
      threatNorad: 29842,
      tier: "Watch",
      maxProb: null,
      relSpeedKms: 0.078,
      rangeKm: 12.4,
    });
    expect(text).toContain("AO-91 (NORAD 43017) vs FENGYUN 1C DEB (29842)");
    expect(text).toContain("CATNR=43017");
    expect(text).toContain("Verdict: Watch");
    expect(text).toContain("max probability unknown");
    expect(text).toContain("12.40 km");
    expect(text).toContain("0.078 km/s");
  });
});

describe("deliverShare", () => {
  it("uses the Web Share API on a phone and copies on a desktop", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    await expect(
      deliverShare("hello", { share, clipboard: { writeText }, userAgent: "Mozilla/5.0 (iPhone)" }),
    ).resolves.toBe("shared");
    expect(writeText).not.toHaveBeenCalled();

    await expect(
      deliverShare("hello", { share, clipboard: { writeText }, userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }),
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("copies when sharing is missing, and stays quiet if the share sheet is cancelled", async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(deliverShare("hello", { clipboard: { writeText } })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hello");

    const share = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    await expect(
      deliverShare("hello", { share, clipboard: { writeText }, userAgent: "Mozilla/5.0 (iPhone)" }),
    ).resolves.toBe("cancelled");
  });
});
