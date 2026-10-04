import { describe, expect, it } from "vitest";
import { placeCallout } from "./globe-callout";

describe("placeCallout", () => {
  it("sits to the right of the point with a gap", () => {
    const placed = placeCallout(200, 180, 140, 64, 800, 500);
    expect(placed.left).toBeGreaterThan(200);
    expect(placed.left - 200).toBeGreaterThanOrEqual(56);
    expect(placed.anchorX).toBe(placed.left);
    expect(placed.top).toBeLessThan(180);
  });

  it("flips to the left when the right side is too close to the edge", () => {
    const placed = placeCallout(720, 180, 140, 64, 800, 500);
    expect(placed.left + 140).toBeLessThan(720);
    expect(placed.anchorX).toBe(placed.left + 140);
  });

  it("keeps the box inside the globe", () => {
    const placed = placeCallout(10, 10, 140, 64, 800, 500);
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.top).toBeGreaterThanOrEqual(8);
    expect(placed.left + 140).toBeLessThanOrEqual(800);
    expect(placed.top + 64).toBeLessThanOrEqual(500);
  });
});
