import { describe, expect, it } from "vitest";
import { countdownClockMs, formatCountdown, socratesTableUrl, threatHeadline } from "./countdown";

const DEMO_NOW = Date.parse("2026-10-04T16:00:00.000Z");
const SL8 = Date.parse("2026-10-05T01:26:28.592Z");

describe("countdown clock", () => {
  it("uses the wall clock while the pass is still ahead", () => {
    const wall = Date.parse("2026-10-04T18:00:00.000Z");
    expect(countdownClockMs(SL8, wall, DEMO_NOW, 60_000)).toBe(wall);
  });

  it("advances DEMO_NOW once the wall clock is past the TCA", () => {
    const wall = Date.parse("2026-10-06T00:00:00.000Z");
    expect(countdownClockMs(SL8, wall, DEMO_NOW, 90_000)).toBe(DEMO_NOW + 90_000);
  });

  it("formats the SwissCube gap from the demo clock as hours and minutes", () => {
    expect(formatCountdown(SL8, DEMO_NOW)).toBe("in 9h 26m");
    expect(formatCountdown(DEMO_NOW + (5 * 3600 + 26 * 60) * 1000, DEMO_NOW)).toBe("in 5h 26m");
  });

  it("links the primary catalog number on the SOCRATES screen", () => {
    expect(socratesTableUrl(35932)).toBe(
      "https://celestrak.org/SOCRATES/table-socrates.php?CATNR=35932&ORDER=MINRANGE&MAX=25",
    );
  });

  it("writes the heads-up in one line", () => {
    expect(threatHeadline(1, "SwissCube", "tonight")).toBe("Heads up: 1 real threat to SwissCube tonight");
    expect(threatHeadline(2, "SwissCube", null)).toBe("Heads up: 2 real threats to SwissCube");
  });
});
