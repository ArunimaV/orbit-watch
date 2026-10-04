import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseCsvStream } from "./csv";
import { loadFixtureSnapshot, parseObjectName, parseSocratesCsv } from "./socrates";

const SAMPLE = [
  "NORAD_CAT_ID_1,OBJECT_NAME_1,DSE_1,NORAD_CAT_ID_2,OBJECT_NAME_2,DSE_2,TCA,TCA_RANGE,TCA_RELATIVE_SPEED,MAX_PROB,DILUTION",
  '35932,"SWISSCUBE [+]",2.5,19831,"SL-8 DEB [-]",2.2,2026-10-05 01:26:28.592,0.621,13.881,5.614E-06,1.5',
  "",
].join("\n");

describe("SOCRATES parsing", () => {
  it("splits the ops-status bracket off the name", () => {
    expect(parseObjectName("ISS (ZARYA) [+]")).toEqual({ name: "ISS (ZARYA)", opsStatus: "+" });
    expect(parseObjectName("BREEZE-KM R/B [-]")).toEqual({ name: "BREEZE-KM R/B", opsStatus: "-" });
    expect(parseObjectName("FENGYUN 1C DEB [synthetic] [-]").opsStatus).toBe("-");
  });

  it("parses a quoted SOCRATES row, including scientific notation", () => {
    const events = parseSocratesCsv(SAMPLE);
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event?.object1).toMatchObject({ noradId: 35932, name: "SWISSCUBE", opsStatus: "+" });
    expect(event?.object2).toMatchObject({ noradId: 19831, name: "SL-8 DEB", opsStatus: "-" });
    expect(event?.tca).toBe("2026-10-05T01:26:28.592Z");
    expect(event?.rangeKm).toBe(0.621);
    expect(event?.relSpeedKms).toBe(13.881);
    expect(event?.maxProb).toBeCloseTo(5.614e-6, 12);
  });

  it("parses the same CSV from a stream", async () => {
    const stream = Readable.toWeb(Readable.from([Buffer.from(SAMPLE)])) as ReadableStream<Uint8Array>;
    const rows = await parseCsvStream(stream);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.[3]).toBe("19831");
  });

  it("indexes the fixture by NORAD, with SwissCube as the demo satellite", () => {
    const snapshot = loadFixtureSnapshot();
    expect(snapshot.demoNorad).toBe(35932);
    expect(snapshot.byNorad["35932"]?.length).toBeGreaterThan(0);
    expect(snapshot.byNorad["25544"]).toHaveLength(2);
    expect(snapshot.byNorad["19831"]?.[0]?.object2.noradId).toBe(19831);
    const top = snapshot.byNorad["35932"]?.find((event) => event.object2.noradId === 19831);
    expect(top?.syntheticFields).toEqual([]);
    expect(top?.provenance).toBe("reported");
    expect(top?.dilutionKm).toBe(0.298);
    expect(top?.dse1).toBeCloseTo(2.483);
    expect(top?.dse2).toBeCloseTo(2.17);
    const beesat = snapshot.byNorad["35932"]?.find((event) => event.object2.noradId === 35933);
    expect(beesat?.syntheticFields).toEqual([]);
    expect(beesat?.tca).toBe("2026-10-06T11:51:08.166Z");
    expect(beesat?.maxProb).toBeCloseTo(2.313e-7, 12);
    expect(beesat?.relSpeedKms).toBe(0.078);
    const fengyun = snapshot.byNorad["35932"]?.find((event) => event.object2.noradId === 29842);
    expect(fengyun?.object2.name).toBe("FENGYUN 1C DEB");
    expect(fengyun?.rangeKm).toBe(1.741);
    const cosmos = snapshot.byNorad["35932"]?.find((event) => event.object2.noradId === 35759);
    expect(cosmos?.object2.name).toBe("COSMOS 2251 DEB");
    expect(cosmos?.rangeKm).toBe(2.933);
  });
});
