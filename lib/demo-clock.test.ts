import { describe, expect, it } from "vitest";
import { DEFAULT_DEMO_NOW, readDemoNow } from "./demo-clock";

describe("readDemoNow", () => {
  it("defaults when the flag is empty or not a time", () => {
    expect(readDemoNow("").toISOString()).toBe(DEFAULT_DEMO_NOW);
    expect(readDemoNow("   ").toISOString()).toBe(DEFAULT_DEMO_NOW);
    expect(readDemoNow(undefined).toISOString()).toBe(DEFAULT_DEMO_NOW);
    expect(readDemoNow("bogus").toISOString()).toBe(DEFAULT_DEMO_NOW);
  });

  it("uses a valid ISO instant", () => {
    expect(readDemoNow("2026-10-04T18:00:00Z").toISOString()).toBe("2026-10-04T18:00:00.000Z");
  });
});
