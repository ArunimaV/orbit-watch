# Orbit Watch

Space traffic triage for university CubeSat teams. This slice ingests public [CelesTrak SOCRATES](https://celestrak.org/SOCRATES/) close-approach warnings, ranks them, and shows the result on a three-panel dashboard. The demo satellite is **SwissCube** (NORAD 35932), an EPFL 1U CubeSat in a roughly 685 km sun-synchronous orbit with no thrusters.

Voice, the Cesium globe, and Grok Imagine are later phases. They are not in this build.

**Not for operational use.** Orbit Watch does not replace 18 SDS, a conjunction-assessment team, or a maneuver decision. It is a demo of triage and explanation.

## Setup

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The left panel loads `/api/conjunctions?norad=35932&horizon=168`. ISS (NORAD 25544) is still available if you type that id; it is a secondary example, not the demo.

Copy `.env.example` to `.env.local` when you need secrets. Phase 0–1 does not call xAI.

| Variable | Required now | Purpose |
|---|---|---|
| `XAI_API_KEY` | No | Server-only key for later voice, brief, and image routes. Never ship it to the browser. |
| `NEXT_PUBLIC_CESIUM_ION_TOKEN` | No | Optional Cesium ion imagery in a later phase. |
| `ORBIT_WATCH_OFFLINE` | No | Set to `1` to skip CelesTrak and serve `data/fixtures/` only. |

`npm run ingest` checks SOCRATES `jsonDir.php` (at most once an hour) and downloads the CSV only when `FILE_MTIME` changes. Any non-200 response stops the script. There are no retries.

## Data sources

Primary screen: [CelesTrak SOCRATES Plus](https://celestrak.org/SOCRATES/) (methodology, [format](https://celestrak.org/SOCRATES/socrates-format.php)). Orbits for propagation: [CelesTrak GP / OMM](https://celestrak.org/NORAD/documentation/gp-data-formats.php), always requested with `FORMAT=JSON`. Propagation uses satellite.js v7 `json2satrec` on that OMM. TLEs are not used, because catalog numbers already exceed five digits.

Orbit Watch follows the [CelesTrak usage policy](https://celestrak.org/usage-policy.php):

- Cache responses under `data/`.
- Poll `jsonDir.php` no more than once an hour, and download the screen only when `FILE_MTIME` changes.
- Refetch a GP element set only when the cache is older than two hours.
- Stop on the first non-200 response, including redirects. Log it. Do not retry.

Data courtesy of [CelesTrak](https://celestrak.org/) (Dr. T.S. Kelso).

### Fixture, because CelesTrak did not answer here

Both a `jsonDir.php` request and one request to `table-socrates.php?CATNR=35932` timed out from this environment. Nothing was retried. `data/fixtures/socrates-sample.json` is what the API serves until `npm run ingest` writes a snapshot.

Reported from the 2026-10-03 00:19 UTC SOCRATES Plus run for SwissCube:

| Other object | What was supplied |
|---|---|
| SL-8 DEB (19831) `[-]` | TCA 2026-10-05 01:26:28.592 UTC, range 0.621 km, relative speed 13.881 km/s, max probability 5.614e-6, DSE about 2.5 and 2.2 |
| BEESAT-1 (35933) `[+]` | Range 4.368 km, relative speed 0.078 km/s (same 2009 launch, co-orbiting) |
| Fengyun-1C debris | Range 1.741 km, TCA 2026-10-10 00:38 UTC |
| Cosmos 2251 debris | Range 2.933 km, TCA 2026-10-03 04:44 UTC |

Anything else on those rows — dilution, BEESAT's TCA and probability, the debris catalog numbers, and the debris speeds and probabilities — is listed in `syntheticFields` and was not taken from SOCRATES. Placeholder NORAD ids 990101–990204 are not real catalog numbers. Extra rows (low probability, already happened, outside the horizon, a repeated pair) are synthetic on purpose so each dismissal rule has an example.

ISS vs BREEZE-KM R/B and ISS vs SOYUZ-MS 29 from the build plan are in the same file as a secondary example. GP files in `data/fixtures/gp/` are synthetic element sets so `satellite.js` can propagate offline. A computed miss distance from those elements will not match SOCRATES.

## How the ranker is calibrated

Section 5 of the build plan scored probability with `(log10(p)+7)/4` (1e-7 maps to 0, 1e-3 maps to 1) and treated max probability ≥ 1e-4 as Act. That scale fits an ISS-class event. Public SOCRATES probabilities for a CubeSat that cannot maneuver sit around 1e-6 to 1e-5, so the same formula left SwissCube vs SL-8 DEB — 621 m, head-on at 13.881 km/s, probability 5.614e-6 — in the low 60s, under the Act line, and the 1e-4 shortcut never fired.

The weights are unchanged (0.40 probability, 0.25 miss distance, 0.15 relative speed, 0.10 time-to-TCA, 0.10 whether the other object can be coordinated with). Two inputs moved:

- Probability is now `clamp((log10(p)+8)/3, 0, 1)`, so 1e-8 maps to 0 and 1e-5 maps to 1. A 5.6e-6 event is near the top of the CubeSat range instead of the middle of an ISS range.
- Act is score ≥ 70 or max probability ≥ 1e-5. Watch is 40–70. Info is below 40.

With that map, the 621 m miss (`R ≈ 0.54`) and the 13.9 km/s closing speed (`V ≈ 0.93`) carry SL-8 DEB to about 84 while it is 6–72 hours away, which is Act. The justification is the geometry: once a typical CubeSat probability is no longer crushed, a sub-kilometer head-on pass is the warning the team should look at. ISS vs BREEZE-KM R/B still scores Act. The 1e-4 NASA CARA figure is an operational Pc threshold, not what this public screen reports for SwissCube, so it is not the Act gate here.

Co-orbiting uses relative speed under 0.10 km/s, up from 0.05 km/s. 0.05 caught docked vehicles (ISS–Soyuz at 0.002 km/s) and missed same-launch siblings. BEESAT-1 at 0.078 km/s is dismissed as "Docked or co-orbiting, not a collision course". 0.10 km/s is still about a hundred times slower than a glancing pass in low Earth orbit.

Stale data (`max(DSE) > 3` days) and dilution (dilution larger than the miss) are flags on the card. They do not change the score.

## API

- `GET /api/conjunctions?norad=35932&horizon=168` — ranked cards plus `dismissed: N` grouped by reason.
- `GET /api/encounter/[id]` — both OMMs through `json2satrec`, positions every 10 s from TCA−15 min to TCA+15 min, ECI then ECF then geodetic, and this app's own minimum separation.

## Credits

CelesTrak (Dr. T.S. Kelso). satellite.js. The build plan and planning log in `docs/` were written with Grok Bot before this implementation.
