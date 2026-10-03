import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OMMJsonObject } from "satellite.js";
import { propagateEncounter } from "./encounter";

function readOmm(norad: number): OMMJsonObject {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/fixtures/gp", `${norad}.json`), "utf8")) as OMMJsonObject;
}

describe("propagateEncounter", () => {
  it("propagates SwissCube and SL-8 DEB across a 30-minute window", () => {
    const result = propagateEncounter(readOmm(35932), readOmm(19831), "2026-10-05T01:26:28.592Z");
    expect(result.stepSeconds).toBe(10);
    expect(result.windowMinutes).toBe(15);
    expect(result.ours).toHaveLength(181);
    expect(result.other).toHaveLength(181);
    expect(result.computedMinRangeKm).toBeGreaterThan(0);
    expect(Number.isFinite(result.computedMinRangeKm)).toBe(true);
    expect(result.ours[0]?.geodetic.latDeg).toBeGreaterThan(-90);
    expect(result.ours[0]?.geodetic.latDeg).toBeLessThan(90);
    expect(result.ours[90]?.ecf.x).not.toBe(result.ours[90]?.eci.x);
  });

  it("accepts a catalog number above 5 digits", () => {
    const result = propagateEncounter(readOmm(25544), readOmm(100057), "2026-10-03T02:00:11.000Z");
    expect(result.computedMinRangeKm).toBeGreaterThan(0);
    expect(result.computedMinRangeKm).toBeLessThan(500);
  });
});
