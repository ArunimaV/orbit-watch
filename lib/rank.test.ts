import { describe, expect, it } from "vitest";
import { DISMISS, rankConjunctions } from "./rank";
import { eventsForNorad, hydrateEvent, loadFixtureSnapshot } from "./socrates";
import type { ConjunctionEventInput } from "./types";

const NOW = new Date("2026-10-03T00:00:00.000Z");

function iss(object2: ConjunctionEventInput["object2"], fields: Partial<ConjunctionEventInput>): ConjunctionEventInput {
  return {
    object1: {
      noradId: 25544,
      name: "ISS (ZARYA)",
      rawName: "ISS (ZARYA) [+]",
      opsStatus: "+",
    },
    object2,
    dse1: 1,
    dse2: 1,
    dilutionKm: null,
    provenance: "secondary-example",
    syntheticFields: [],
    tca: "2026-10-04T00:00:00.000Z",
    rangeKm: 1,
    relSpeedKms: 10,
    maxProb: 1e-5,
    ...fields,
  };
}

describe("rankConjunctions", () => {
  it("dismisses ISS–SOYUZ-MS 29 at 0.002 km/s as docked", () => {
    const soyuz = hydrateEvent(
      iss(
        { noradId: 100057, name: "SOYUZ-MS 29", rawName: "SOYUZ-MS 29 [+]", opsStatus: "+" },
        {
          tca: "2026-10-03T02:00:11.000Z",
          rangeKm: 2.104,
          relSpeedKms: 0.002,
          maxProb: 6.048e-5,
          dse1: 0.23,
          dse2: 0.23,
        },
      ),
    );
    const result = rankConjunctions([soyuz], 25544, NOW);
    expect(result.ranked).toHaveLength(0);
    expect(result.dismissed.map((group) => group.reason)).toContain(DISMISS.coOrbiting);
    const docked = result.dismissed.find((group) => group.reason === DISMISS.coOrbiting);
    expect(docked?.count).toBe(1);
    expect(docked?.examples[0]?.otherName).toBe("SOYUZ-MS 29");
    expect(docked?.reason.toLowerCase()).toContain("docked");
  });

  it("ranks ISS–BREEZE-KM R/B at 0.514 km / 13.942 km/s / 5.243e-4 as Act", () => {
    const breeze = hydrateEvent(
      iss(
        { noradId: 42970, name: "BREEZE-KM R/B", rawName: "BREEZE-KM R/B [-]", opsStatus: "-" },
        {
          tca: "2026-10-08T19:59:21.677Z",
          rangeKm: 0.514,
          relSpeedKms: 13.942,
          maxProb: 5.243e-4,
          dse1: 5.98,
          dse2: 5.98,
        },
      ),
    );
    const result = rankConjunctions([breeze], 25544, NOW);
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0]?.tier).toBe("Act");
    expect(result.ranked[0]?.score).toBeGreaterThanOrEqual(70);
    expect(result.ranked[0]?.flags.stale).toBe(true);
    expect(result.ranked[0]?.other.noradId).toBe(42970);
  });

  it("still ranks the Breeze body as Act when the columns are swapped", () => {
    const swapped = hydrateEvent({
      object1: { noradId: 42970, name: "BREEZE-KM R/B", rawName: "BREEZE-KM R/B [-]", opsStatus: "-" },
      object2: { noradId: 25544, name: "ISS (ZARYA)", rawName: "ISS (ZARYA) [+]", opsStatus: "+" },
      dse1: 5.98,
      dse2: 5.98,
      tca: "2026-10-08T19:59:21.677Z",
      rangeKm: 0.514,
      relSpeedKms: 13.942,
      maxProb: 5.243e-4,
      dilutionKm: null,
      provenance: "secondary-example",
      syntheticFields: [],
    });
    const result = rankConjunctions([swapped], 25544, NOW);
    expect(result.ranked[0]?.ours.noradId).toBe(25544);
    expect(result.ranked[0]?.other.name).toBe("BREEZE-KM R/B");
    expect(result.ranked[0]?.tier).toBe("Act");
  });

  it("dismisses SwissCube vs BEESAT-1 at 0.078 km/s as co-orbiting and ranks SL-8 DEB first as Act", () => {
    const fixture = loadFixtureSnapshot();
    const result = rankConjunctions(eventsForNorad(fixture, 35932), 35932, NOW);

    const coOrbiting = result.dismissed.find((group) => group.reason === DISMISS.coOrbiting);
    expect(coOrbiting?.reason.toLowerCase()).toContain("co-orbiting");
    expect(coOrbiting?.examples.some((example) => example.otherNorad === 35933)).toBe(true);
    expect(result.ranked.some((event) => event.other.noradId === 35933)).toBe(false);

    expect(result.ranked[0]?.other.noradId).toBe(19831);
    expect(result.ranked[0]?.other.name).toBe("SL-8 DEB");
    expect(result.ranked[0]?.tier).toBe("Act");
    expect(result.ranked[0]?.score).toBeGreaterThanOrEqual(70);
    expect(result.ranked[0]?.rangeKm).toBe(0.621);
    expect(result.ranked[0]?.relSpeedKms).toBe(13.881);
    expect(result.ranked[0]?.maxProb).toBeCloseTo(5.614e-6, 12);
  });

  it("collapses the real Fengyun 1C debris repeats and dismisses the far low-probability misses", () => {
    const fixture = loadFixtureSnapshot();
    const result = rankConjunctions(eventsForNorad(fixture, 35932), 35932, NOW, 24 * 7);
    const reasons = result.dismissed.map((group) => group.reason);
    expect(reasons).toContain(DISMISS.lowProbability);
    expect(reasons).toContain(DISMISS.duplicate);
    const duplicate = result.dismissed.find((group) => group.reason === DISMISS.duplicate);
    expect(duplicate?.examples[0]?.otherNorad).toBe(29842);
    expect(duplicate?.examples[0]?.detail).toMatch(/the same pair, 3 passes/);
    expect(duplicate?.count).toBe(2);
    expect(result.ranked.some((event) => event.other.noradId === 29842)).toBe(false);
  });

  it("dismisses a past TCA and a TCA past the horizon", () => {
    const past = hydrateEvent(
      iss(
        { noradId: 990202, name: "SL-16 R/B", rawName: "SL-16 R/B [-]", opsStatus: "-" },
        { tca: "2026-10-01T12:00:00.000Z", rangeKm: 1.1, relSpeedKms: 12, maxProb: 2e-5 },
      ),
    );
    const later = hydrateEvent(
      iss(
        { noradId: 990203, name: "CZ-4B DEB", rawName: "CZ-4B DEB [-]", opsStatus: "-" },
        { tca: "2026-10-20T00:00:00.000Z", rangeKm: 0.9, relSpeedKms: 12.4, maxProb: 2e-5 },
      ),
    );
    const result = rankConjunctions([past, later], 25544, NOW, 24 * 7);
    const reasons = result.dismissed.map((group) => group.reason);
    expect(reasons).toContain(DISMISS.alreadyHappened);
    expect(reasons).toContain(DISMISS.outsideHorizon);
    expect(result.ranked).toHaveLength(0);
  });
});
