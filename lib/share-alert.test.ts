import { describe, expect, it } from "vitest";
import { shareAlertText } from "./share-alert";

const SL8 = {
  ours: { noradId: 35932, name: "SWISSCUBE" },
  other: { noradId: 19831, name: "SL-8 DEB" },
  tca: "2026-10-05T01:26:28.592Z",
  rangeKm: 0.621,
  relSpeedKms: 13.881,
  maxProb: 5.614e-6,
  tier: "Act",
};

describe("shareAlertText", () => {
  it("writes the SwissCube pass as a note ready for a team chat", () => {
    expect(
      shareAlertText({
        satelliteName: "SwissCube",
        event: SL8,
        timeZone: "America/New_York",
      }),
    ).toBe(
      "Orbit Watch alert: SwissCube (NORAD 35932) vs SL-8 DEB (19831). Closest approach Sun Oct 4, 9:26 PM EDT (01:26 UTC). Miss distance 621 m at 13.9 km/s, max probability 5.6e-6. Verdict: Act. Verify: https://celestrak.org/SOCRATES/table-socrates.php?CATNR=35932&ORDER=MINRANGE&MAX=25 · https://orbit-watch-nu.vercel.app",
    );
  });

  it("uses whichever satellite and threat it is given", () => {
    const text = shareAlertText({
      satelliteName: "CubeSat-1",
      event: {
        ours: { noradId: 12345, name: "CUBESAT-1" },
        other: { noradId: 99999, name: "H-2A DEB" },
        tca: "2026-10-08T15:00:00.000Z",
        rangeKm: 12.4,
        relSpeedKms: 0.078,
        maxProb: null,
        tier: "Watch",
      },
      timeZone: "America/New_York",
    });
    expect(text).toContain("Orbit Watch alert: CubeSat-1 (NORAD 12345) vs H-2A DEB (99999).");
    expect(text).toContain("Closest approach Thu Oct 8, 11:00 AM EDT (15:00 UTC).");
    expect(text).toContain("Miss distance 12.40 km at 0.078 km/s, max probability unknown. Verdict: Watch.");
    expect(text).toContain("CATNR=12345");
    expect(text).toContain("https://orbit-watch-nu.vercel.app");
  });
});
