# Orbit Watch

Space traffic triage for university CubeSat teams. This slice ingests public [CelesTrak SOCRATES](https://celestrak.org/SOCRATES/) close-approach warnings, ranks them, and shows the result on a three-panel dashboard. The demo satellite is **SwissCube** (NORAD 35932), an EPFL 1U CubeSat in a roughly 685 km sun-synchronous orbit with no thrusters.

The center panel is a CesiumJS globe (Resium, client-only). The right panel is the Grok voice copilot: hold to talk, or use Brief me if the mic or the realtime API is unavailable. The Imagine render of the selected encounter sits on the globe and under the transcript.

**Not for operational use.** Orbit Watch does not replace 18 SDS, a conjunction-assessment team, or a maneuver decision. It is a demo of triage and explanation.

## Setup

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The left panel loads `/api/conjunctions?norad=35932&horizon=168`. ISS (NORAD 25544) is still available if you type that id; it is a secondary example, not the demo.

Copy `.env.example` to `.env.local` and set `XAI_API_KEY` for live voice, briefs, and new images. There is no key in the repo. Without it, the app stays in mock mode: the panel says the key is missing, Brief me still writes a briefing from the ranker, and the image is the committed render.

| Variable | Required now | Purpose |
|---|---|---|
| `XAI_API_KEY` | No | Server-only key for voice, `/v1/responses`, TTS, and Imagine. Never ship it to the browser. |
| `NEXT_PUBLIC_CESIUM_ION_TOKEN` | No | Unused. The globe uses the Natural Earth II imagery shipped with Cesium, not Cesium ion. |
| `ORBIT_WATCH_OFFLINE` | No | Set to `1` to skip CelesTrak and serve `data/fixtures/` only. |
| `DEMO_NOW` | No | Fixture-mode clock, ISO. Empty uses `2026-10-04T16:00:00Z` (noon US Eastern on Oct 4) so ranking and “tonight” stay stable. |

`npm run ingest` checks SOCRATES `jsonDir.php` (at most once an hour) and downloads the CSV only when `FILE_MTIME` changes. Any non-200 response stops the script. There are no retries.

## Data sources

Primary screen: [CelesTrak SOCRATES Plus](https://celestrak.org/SOCRATES/) (methodology, [format](https://celestrak.org/SOCRATES/socrates-format.php)). Orbits for propagation: [CelesTrak GP / OMM](https://celestrak.org/NORAD/documentation/gp-data-formats.php), always requested with `FORMAT=JSON`. Propagation uses satellite.js v7 `json2satrec` on that OMM. TLEs are not used, because catalog numbers already exceed five digits.

Orbit Watch follows the [CelesTrak usage policy](https://celestrak.org/usage-policy.php):

- Cache responses under `data/`.
- Poll `jsonDir.php` no more than once an hour, and download the screen only when `FILE_MTIME` changes.
- Refetch a GP element set only when the cache is older than two hours.
- Stop on the first non-200 response, including redirects. Log it. Do not retry.

While the API is serving the fixture, ranking uses `DEMO_NOW` (default `2026-10-04T16:00:00Z`). That is noon US Eastern on Sunday, Oct 4, so the SL-8 DEB pass at 9:26 PM EDT reads as tonight. In fixture mode that pass is kept even if the clock is after the TCA, so a judge opening the app later still sees the demo warning. A live snapshot uses the browser's clock instead. Set `DEMO_NOW` to another ISO instant to move the fixture clock.

Data courtesy of [CelesTrak](https://celestrak.org/) (Dr. T.S. Kelso).

HTTPS requests to `celestrak.org` time out from some networks, including this one. A transport failure (timeout, abort, or connection error) is tried once more as `http://celestrak.org` with the same path. A non-200, including a redirect, still stops immediately. The hourly `jsonDir.php` cap and the `FILE_MTIME` check are unchanged. There is no retry of the same URL.

### What is real

`data/fixtures/socrates-sample.json` is what the API serves until `npm run ingest` writes a snapshot. The SwissCube rows in that file are the real SOCRATES Plus screen for NORAD 35932, data current as of 2026-10-03 00:19:27 UTC (`table-socrates.php?CATNR=35932&ORDER=MINRANGE&MAX=25`, 21 rows). On those rows, these fields are from the table and are not synthetic: catalog numbers, names, ops status, days since epoch, TCA, range, relative speed, max probability, and dilution.

| Other object | From the table |
|---|---|
| SL-8 DEB (19831) `[-]` | TCA 2026-10-05 01:26:28.592 UTC, 0.621 km, 13.881 km/s, max probability 5.614e-6, dilution 0.298 km, DSE 2.483 and 2.170 |
| BEESAT-1 (35933) `[+]` | TCA 2026-10-06 11:51:08.166 UTC, 4.368 km, 0.078 km/s, max probability 2.313e-7, dilution 1.030 km |
| FENGYUN 1C DEB (29842) `[-]` | 1.741 km, TCA 2026-10-10 00:38:31.042 UTC, plus two later passes of the same object |
| COSMOS 2251 DEB (35759) `[-]` | 2.933 km, TCA 2026-10-03 04:44:41.108 UTC |

GP files in `data/fixtures/gp/` are real CelesTrak GP JSON fetched 2026-10-03 (about 19:20 ET) for 35932, 19831, 35933, 25544, 100057, 42970, 29842, 3048, 55214, 35759, and 28898. Propagating SwissCube vs SL-8 DEB from those elements gives a closest approach of **0.691 km** at the SOCRATES TCA. The screen reports 0.621 km. The 70 m gap is the epoch difference (the elements are from later on Oct 3, not the screening epoch).

ISS vs BREEZE-KM R/B and ISS vs SOYUZ-MS 29 stay in the fixture as the secondary example from the build-plan writeup. Their GP files are the real element sets. Dilution was not in that writeup, so `dilutionKm` is null and is the only field still listed in `syntheticFields`. Some later SwissCube secondaries in the table have no committed GP file, so the globe says elements are unavailable for that pair.

## How the ranker is calibrated

Section 5 of the build plan scored probability with `(log10(p)+7)/4` (1e-7 maps to 0, 1e-3 maps to 1) and treated max probability ≥ 1e-4 as Act. That scale fits an ISS-class event. Public SOCRATES probabilities for a CubeSat that cannot maneuver sit around 1e-6 to 1e-5, so the same formula left SwissCube vs SL-8 DEB — 621 m, head-on at 13.881 km/s, probability 5.614e-6 — in the low 60s, under the Act line, and the 1e-4 shortcut never fired.

The weights are unchanged (0.40 probability, 0.25 miss distance, 0.15 relative speed, 0.10 time-to-TCA, 0.10 whether the other object can be coordinated with). Two inputs moved:

- Probability is now `clamp((log10(p)+8)/3, 0, 1)`, so 1e-8 maps to 0 and 1e-5 maps to 1. A 5.6e-6 event is near the top of the CubeSat range instead of the middle of an ISS range.
- Act is score ≥ 70 or max probability ≥ 1e-5. Watch is 40–70. Info is below 40.

With that map, the 621 m miss (`R ≈ 0.54`) and the 13.9 km/s closing speed (`V ≈ 0.93`) carry SL-8 DEB to about 84 while it is 6–72 hours away, which is Act. The justification is the geometry: once a typical CubeSat probability is no longer crushed, a sub-kilometer head-on pass is the warning the team should look at. ISS vs BREEZE-KM R/B still scores Act. The 1e-4 NASA CARA figure is an operational Pc threshold, not what this public screen reports for SwissCube, so it is not the Act gate here.

Co-orbiting uses relative speed under 0.10 km/s, up from 0.05 km/s. 0.05 caught docked vehicles (ISS–Soyuz at 0.002 km/s) and missed same-launch siblings. BEESAT-1 at 0.078 km/s is dismissed as "Docked or co-orbiting, not a collision course". 0.10 km/s is still about a hundred times slower than a glancing pass in low Earth orbit.

Stale data (`max(DSE) > 3` days) and dilution (dilution larger than the miss) are flags on the card. They do not change the score.

## Globe

`npm install`, `npm run build`, and `next build` all copy `Cesium.js` plus Workers, Assets, Widgets, and ThirdParty into `public/cesium` (gitignored). The Next.js config runs that copy when it loads, so Vercel's Next.js preset (`next build`, not `npm run build`) still publishes `/cesium/Cesium.js` and the worker and imagery files. The copy fails if `node_modules/cesium/Build/Cesium/Cesium.js` is missing. The viewer is loaded with `next/dynamic` and `ssr: false`. Imagery is the bundled Natural Earth II tiles. Terrain is the WGS84 ellipsoid, so the app does not call Cesium ion.

On load the SwissCube vs SL-8 DEB card is selected. The camera flies to the pair. Both tracks are the encounter API's samples from TCA−15 min to TCA+15 min. A pulsing marker sits on SwissCube's TCA sample and labels the SOCRATES miss, relative speed, and the closest approach in the viewer's local time. Play/pause and the scrubber step those samples. A card whose other object has no committed GP file shows an error on the globe instead of a track.

## API

- `GET /api/conjunctions?norad=35932&horizon=168` — ranked cards plus `dismissed: N` grouped by reason. `now` is the evaluation clock (the demo clock in fixture mode). SwissCube on first load stays on this saved demo.
- `GET /api/lookup?norad=43017&horizon=168` — the same ranked payload for any other catalog number. One `http://celestrak.org/SOCRATES/table-socrates.php` request, 8 second timeout, cached for 10 hours. A failure or an empty screen leaves the current view in place.
- `GET /api/encounter/[id]` — both OMMs through `json2satrec`, positions every 10 s from TCA−15 min to TCA+15 min, ECI then ECF then geodetic, and this app's own minimum separation.
- `POST /api/voice/token` — mints an ephemeral realtime client secret (`value`, `expires_at` only). `GET` reports whether a key is set and does not mint.
- `POST /api/voice/tools` — `get_ranked_warnings`, `get_encounter`, `explain_dismissed`, `focus_encounter`.
- `POST /api/brief` — grok-4.7 briefing, or the ranker text when the key or the API is missing.
- `POST /api/tts` — Eve, English, `audio/mpeg`.
- `GET /api/imagine/[id]` — cached JPEG, or the committed `public/renders/swisscube-sl8deb.jpg` for the SwissCube / SL-8 pass and as the fallback. New images are written to `public/renders` when that directory is writable, otherwise to `/tmp/orbit-watch-renders` and served from `GET /api/renders/[id]`. If the write fails, the committed JPEG is returned.

`focus_encounter` dispatches `window` event `orbitwatch:focus` with `{ id }`. The warning list selects that card, and the globe flies to it even when that card was already selected. The same selection loads the Imagine render onto the globe.

## Deploy to Vercel

The Vercel project can keep the Next.js preset. That preset runs `next build`, which does not run the npm `build` or `prebuild` scripts. `next.config.ts` copies `node_modules/cesium/Build/Cesium` into `public/cesium` as soon as the config loads, including `Cesium.js`, Workers, Assets, Widgets, and ThirdParty. `npm install` (postinstall) and `npm run build` run the same copy. The files are gitignored, so they have to be created on the build machine. The script exits if `Cesium.js` or the Natural Earth II tiles are missing after the copy.

Set `XAI_API_KEY` in the Vercel project for live voice, briefs, and new images. Leave it unset for mock mode: Brief me still reads the ranker, and the image is the committed render.

`DEMO_NOW` defaults to `2026-10-04T16:00:00Z` while the app is serving the fixture, so SL-8 DEB stays listed and reads as tonight in US Eastern during judging (about 12:30–2:30 PM ET on Oct 4). `ORBIT_WATCH_OFFLINE=1` forces the fixtures.

Generated images go to `public/renders` when that directory is writable. On a read-only filesystem the cache is written to `/tmp/orbit-watch-renders` and served by `/api/renders/[id]`. If that write also fails, the generated bytes stay in memory and are still served from `/api/renders/[id]`. The committed `public/renders/swisscube-sl8deb.jpg` is the SwissCube / SL-8 default and the fallback when generation itself fails. `/api/imagine/[id]` allows 60 seconds for that call.

## Credits

CelesTrak (Dr. T.S. Kelso). satellite.js. The build plan and planning log in `docs/` were written with Grok Bot before this implementation.
