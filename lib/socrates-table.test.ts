import { describe, expect, it } from "vitest";
import { parseSocratesTable } from "./socrates-table";

const ROWSPAN_PAIR = `
<table>
<tr><td>GP Data</td><td>35932</td><td>SWISSCUBE [+]</td><td>2.483</td>
<td rowspan="2">2026-10-05 01:26:28.592</td><td rowspan="2">0.621</td><td rowspan="2">13.881</td></tr>
<tr><td>50 km All</td><td>19831</td><td>SL-8 DEB [-]</td><td>2.170</td><td>5.614E-06</td><td>0.298</td></tr>
<tr><th>Data</th><th>NORAD Catalog Number</th><th>Name [Ops Status]</th><th>Days Since Epoch</th></tr>
<tr><td>GP Data</td><td>38011</td><td>SSOT [+]</td><td>3.832</td><td></td><td></td><td></td>
<td>2026-10-06 16:57:11.662</td><td>1.206</td><td>14.822</td></tr>
<tr><td>50 km All</td><td>43017</td><td>RADFXSAT (FOX-1B) [+]</td><td>3.859</td><td></td><td>1.125E-06</td><td>0.767</td></tr>
</table>
`;

describe("parseSocratesTable", () => {
  it("reads rowspan pairs and blank-cell pairs, including the satellite on either row", () => {
    const events = parseSocratesTable(`SOCRATES ${ROWSPAN_PAIR}`);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      object1: { noradId: 35932, name: "SWISSCUBE", opsStatus: "+" },
      object2: { noradId: 19831, name: "SL-8 DEB", opsStatus: "-" },
      dse1: 2.483,
      dse2: 2.17,
      tca: "2026-10-05T01:26:28.592Z",
      rangeKm: 0.621,
      relSpeedKms: 13.881,
      maxProb: 5.614e-6,
      dilutionKm: 0.298,
    });
    expect(events[1]).toMatchObject({
      object1: { noradId: 38011, name: "SSOT" },
      object2: { noradId: 43017, name: "RADFXSAT (FOX-1B)" },
      rangeKm: 1.206,
      relSpeedKms: 14.822,
      maxProb: 1.125e-6,
      dilutionKm: 0.767,
    });
  });

  it("returns nothing when the page has no conjunction rows", () => {
    expect(parseSocratesTable("<html><body>SOCRATES Plus Search Results. 0 records found</body></html>")).toEqual([]);
  });
});
