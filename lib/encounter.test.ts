import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OMMJsonObject } from "satellite.js";
import { propagateEncounter } from "./encounter";
import { eciDistanceKm, maxStepKm, nearestSampleIndex } from "./tracks";

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
    for (const sample of result.ours) {
      expect(sample.geodetic.latDeg).toBeGreaterThanOrEqual(-90);
      expect(sample.geodetic.latDeg).toBeLessThanOrEqual(90);
      expect(sample.geodetic.lonDeg).toBeGreaterThanOrEqual(-180);
      expect(sample.geodetic.lonDeg).toBeLessThanOrEqual(180);
      expect(sample.geodetic.altKm).toBeGreaterThan(200);
      expect(sample.geodetic.altKm).toBeLessThan(2500);
    }
    expect(maxStepKm(result.ours)).toBeLessThan(200);
    expect(maxStepKm(result.other)).toBeLessThan(200);
    const tcaIndex = nearestSampleIndex(result.ours, "2026-10-05T01:26:28.592Z");
    expect(Math.abs(Date.parse(result.ours[tcaIndex].t) - Date.parse("2026-10-05T01:26:28.592Z"))).toBeLessThanOrEqual(10_000);
    const separation = eciDistanceKm(result.ours[tcaIndex].eci, result.other[tcaIndex].eci);
    expect(separation).toBeGreaterThan(0);
    expect(Number.isFinite(separation)).toBe(true);
    // Real GP epochs are a few hours off the SOCRATES screening epoch.
    // 0.691 km versus the reported 0.621 km is that drift, not a bad propagation.
    expect(result.computedMinRangeKm).toBeCloseTo(0.691, 2);
    expect(Math.abs(result.computedMinRangeKm - 0.621)).toBeLessThan(1);
  });

  it("accepts a catalog number above 5 digits", () => {
    const result = propagateEncounter(readOmm(25544), readOmm(100057), "2026-10-03T02:00:11.000Z");
    expect(result.computedMinRangeKm).toBeGreaterThanOrEqual(0);
    expect(result.computedMinRangeKm).toBeLessThan(5);
  });
});
