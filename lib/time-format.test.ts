import { describe, expect, it } from "vitest";
import { formatApproachTime, formatLocalTime } from "./time-format";

const NOW = new Date("2026-10-04T16:00:00.000Z");
const SL8 = "2026-10-05T01:26:28.592Z";

describe("formatApproachTime", () => {
  it("says tonight for the SL-8 pass in US Eastern at the demo clock", () => {
    const when = formatApproachTime(SL8, "America/New_York", NOW);
    expect(when.local).toBe("Sun, Oct 4, 9:26 PM EDT");
    expect(when.relative).toBe("tonight");
    expect(when.label).toBe("Sun, Oct 4, 9:26 PM EDT (tonight)");
    expect(when.speech).toBe("tonight at 9:26 PM EDT");
    expect(when.utc).toBe("2026-10-05 01:26 UTC");
  });

  it("says tomorrow for the next local calendar day", () => {
    const when = formatApproachTime("2026-10-05T16:00:00.000Z", "America/New_York", NOW);
    expect(when.relative).toBe("tomorrow");
    expect(when.speech).toMatch(/^tomorrow at /);
    expect(when.label).toMatch(/\(tomorrow\)$/);
  });

  it("keeps the weekday when the pass is further out, and says today before evening", () => {
    const later = formatApproachTime("2026-10-08T15:00:00.000Z", "America/New_York", NOW);
    expect(later.relative).toBeNull();
    expect(later.label).toMatch(/^Thu, Oct 8,/);
    expect(later.speech).toBe(later.local);

    const morning = formatApproachTime("2026-10-04T14:00:00.000Z", "America/New_York", NOW);
    expect(morning.relative).toBe("today");
  });

  it("leaves formatLocalTime unchanged unless a clock is passed", () => {
    expect(formatLocalTime(SL8, "UTC")).toMatch(/UTC/);
    expect(formatLocalTime(SL8, "UTC")).not.toMatch(/tonight/);
    expect(formatLocalTime(SL8, "America/New_York", NOW)).toBe("Sun, Oct 4, 9:26 PM EDT (tonight)");
  });
});
