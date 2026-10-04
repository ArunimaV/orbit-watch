# Orbit Watch: Hackathon Build Plan

*SpaceXAI "Make it Legendary" challenge. Planned with Grok Bot for Arunima V (CubeSat research team). Written Sat Oct 3, 2026, 6:03 PM ET.*

> **Verification key.** ✅ = I checked it against the official page on Oct 3, 2026 (links given). ⚠️ = inferred or from a third-party source, so confirm it before you depend on it. Nothing here is a made-up endpoint or model name. Anything I couldn't confirm is marked ⚠️.

---

## 1. The pitch (one paragraph)

Every university CubeSat team shares the same quiet worry. Their satellite has no thrusters and nobody watches it full time, and it orbits through the busiest stretch of low Earth orbit there has ever been. CelesTrak's public SOCRATES screening flags **more than 180,000 close approaches a week** (the Oct 3 run listed 183,612). Nearly all of them are noise: objects docked together, deployment siblings drifting side by side, or 4.9 km "misses" computed from week-old orbit data. **Orbit Watch is a Grok voice copilot that does the triage a professional conjunction-assessment team would do, for teams that don't have one.** You give it your NORAD ID. It pulls the real public screening data and ranks every warning by probability, miss distance, impact energy, time to closest approach, and data quality, then tells you out loud which one actually matters and why. It also flies a live 3D globe to the encounter and shows a Grok Imagine rendering of the moment the two objects pass. Collected over time, the same data shows which orbital shells are filling up fastest. That's where the next collision risk is building, and where the next CubeSat shouldn't be deployed.

**One-line version:** *"Space traffic control for the 99% of operators who don't have a control room."*

---

## 2. Verified data sources

### 2.1 CelesTrak SOCRATES Plus (primary: conjunction warnings) ✅
- **About/methodology:** https://celestrak.org/SOCRATES/
  - Runs STK/CAT + SGP4 against the full public GP catalog and screens **active payloads against all objects** for the next **7 days**. The threshold is **5 km at TCA**. It reports both min range and **maximum probability** (Alfano method).
  - SOCRATES Plus **no longer screens fully operational satellites in the same constellation against each other**. Your CubeSat will still show up against other payloads, debris, and rocket bodies.
  - Your CubeSat appears as a primary **only if CelesTrak's SATCAT marks it active**. Check this first.
- **Format docs:** https://celestrak.org/SOCRATES/socrates-format.php
  - CSV columns (RFC 4180, header row): `NORAD_CAT_ID_1, OBJECT_NAME_1, DSE_1, NORAD_CAT_ID_2, OBJECT_NAME_2, DSE_2, TCA, TCA_RANGE, TCA_RELATIVE_SPEED, MAX_PROB, DILUTION`
  - Units (from the table notes): range in **km**, relative speed in **km/s**, TCA in **UTC**. `DSE` = days from the GP epoch to TCA, which is a proxy for data age and accuracy. `OBJECT_NAME_n` has the **ops status in brackets**, e.g. `ISS (ZARYA) [+]`, `BREEZE-KM R/B [-]`.
  - Object 1 vs object 2 is **not** primary vs secondary. Normalize so your satellite is always "ours".
- **Per-satellite query (HTML table, max 1,000 rows)** ✅ (I tested it live):
  `https://celestrak.org/socrates/table-socrates.php?CATNR=<NORAD>,&ORDER=MAXPROB&MAX=100`
  - `ORDER` ∈ `MAXPROB | MINRANGE | TCA | RELSPEED | SSC`. `NAME=` also works (partial names, up to 2 comma-separated).
  - The docs have shown both `/socrates/` and `/SOCRATES-Plus/` paths over time. **`/socrates/table-socrates.php` worked on Oct 3.**
- **Latest-run directory (check before downloading)** ✅: `https://celestrak.org/SOCRATES/jsonDir.php`
  - Returned on Oct 3: `[{"FILE_NAME":"sort-minRange.csv","FILE_SIZE":20789719,"FILE_MTIME":"2026-10-03 16:16:02 UTC"}]`
  - ⚠️ **Raw CSV URL inferred** as `https://celestrak.org/SOCRATES/sort-minRange.csv` (the file name comes from jsonDir). Open it once in a browser to confirm. It's about **21 MB**.
- **Usage policy (important)** ✅: https://celestrak.org/usage-policy.php
  - SOCRATES updates **every 10–11 hours**. Poll `jsonDir.php` **no more than once an hour** and download only when `FILE_MTIME` changes.
  - **Stop at the first non-200 response** (301/403/404/50x). Repeated errors (50 in 2 hours) get your IP firewalled.
- **Real example from the Oct 3 run** (the "Data current as of 2026 Oct 03 00:19:27 UTC" run), which also works as a test fixture:

  | Ours | Other object | TCA (UTC) | Min range | Rel. speed | Max prob | DSE |
  |---|---|---|---|---|---|---|
  | ISS (ZARYA) [+] 25544 | BREEZE-KM R/B [-] 42970 | 2026-10-08 19:59:21.677 (Thu Oct 8, 3:59 PM ET) | 0.514 km | 13.942 km/s | 5.243E-04 | 5.98 |
  | ISS (ZARYA) [+] 25544 | SOYUZ-MS 29 [+] 100057 | 2026-10-03 02:00:11 (and every ~93 min after) | 2.104 km | **0.002 km/s** | 6.048E-05 | 0.23 |

  The second row is the whole pitch in one line. It's a **docked spacecraft** that SOCRATES flags again and again. Its relative speed is near zero, so the ranker must dismiss it. The first row is a real head-on pass with a dead rocket body. These numbers will have changed by demo day, so pull fresh data.

### 2.2 CelesTrak GP orbital data (for propagation and the 3D view) ✅
- **Docs:** https://celestrak.org/NORAD/documentation/gp-data-formats.php
- **Query pattern:** `https://celestrak.org/NORAD/elements/gp.php?{QUERY}=VALUE&FORMAT=VALUE`
  - `QUERY` (uppercase) ∈ `CATNR`, `INTDES`, `GROUP`, `NAME`, `SPECIAL`
  - `FORMAT` ∈ `TLE|3LE|2LE|XML|KVN|JSON|JSON-PRETTY|CSV`. **The default is CSV** (since 2026 May 09), so always pass `FORMAT=JSON` explicitly.
  - Example: `https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON`
- **Use OMM JSON, not TLEs.** The TLE format can't hold catalog numbers above 5 digits, and new objects (e.g. 100057 above) already go past that.
- **Rate limits:** GP data updates **every 2 hours**. `GROUP=active` (and Starlink) is enforced at **one download per update**, and a second request gets a 403. Cache to disk and re-download only if the file is more than 2 hours old.
- **Propagation:** **satellite.js ≥ 6** has `json2satrec(omm)`, which takes CelesTrak OMM JSON directly ✅ (https://github.com/shashwatak/satellite-js; latest 7.1.0, Jul 2026). v7 adds a WASM bulk-propagation API and shadow calculation, which helps with "is the encounter in sunlight?" for Imagine prompts.

### 2.3 Space-Track.org (optional, needs an account) ✅ / ⚠️
- **Docs:** https://www.space-track.org/documentation
- **Access:** you need a **free registered account** (accept the user agreement). Log in with `POST https://www.space-track.org/ajaxauth/login` (form fields `identity`, `password`) to get a session cookie ⚠️ (login details come from a third-party OpenAPI spec, so confirm them in the official API help).
- **Official throttles:** fewer than **30 requests/min and 300/hour**. **CDM: 3/day** for all-constellation pulls and **1/hour** for a specific event. GP: 1/hour.
- **Public CDMs** ⚠️: a `cdm_public` class reportedly exists for registered users, e.g. `https://www.space-track.org/basicspacedata/query/class/cdm_public/TCA/%3Enow/PC/%3E0.0001/orderby/TCA%20asc/format/json/`, with fields like `CDM_ID, TCA, MIN_RNG (m), PC, SAT1_ID, SAT1_NAME, SAT1_OBJECT_TYPE, SAT1_RCS, SAT2_*, EMERGENCY_REPORTABLE`. This is **from third-party docs (apis.io / api-evangelist)**. Confirm it after you log in. Full CDMs with covariance require expanded access.
- **The CubeSat angle (this matters):** the official docs say 18 SDS screens all active satellites and sends **Close Approach emails + CDMs to registered owners/operators for free**. To sign up, email `SPOC.SPACE.DataSharing@spaceforce.mil` with your contacts, Space-Track usernames, and NORAD IDs. **Ask your team's ops lead whether you already get these.** If you do, a "drop in a CDM, Grok explains it" importer is a strong stretch feature. **Don't put your team's real CDMs in a public demo** without checking sharing rules. Use SOCRATES for anything public.
- **Recommendation:** build the MVP on **CelesTrak only** (no auth, no account risk). Add Space-Track only if you have time.

### 2.4 xAI Grok APIs ✅ (all from docs.x.ai, checked Oct 3)
Auth for every endpoint: `Authorization: Bearer $XAI_API_KEY`, base `https://api.x.ai/v1`. **Never ship the key to the browser.**

| Capability | Endpoint | Model / params | Docs |
|---|---|---|---|
| **Voice agent (speech-to-speech, core)** | `wss://api.x.ai/v1/realtime?model=grok-voice-latest` | `grok-voice-latest` (alias of `grok-voice-think-fast-2.0`). Configure with a `session.update` event: `voice` (e.g. `"eve"`), `instructions`, `turn_detection:{type:"server_vad"}`, `tools:[{type:"function",...}]`, `audio` formats (default PCM16 24 kHz) | https://docs.x.ai/docs/guides/voice/agent |
| **Browser auth for voice** | `POST https://api.x.ai/v1/realtime/client_secrets` body `{"expires_after":{"seconds":300}}` → `{value, expires_at}` | Browser connects with `new WebSocket(url, ["xai-client-secret." + value])` | https://docs.x.ai/developers/model-capabilities/audio/ephemeral-tokens |
| **Function calling in voice** | Server sends `response.function_call_arguments.done` (`name`, `call_id`, `arguments`). You reply with `conversation.item.create` `{type:"function_call_output", call_id, output}`, then `response.create` | Wait for playback to finish before `response.create` so audio doesn't overlap | same as voice agent |
| **Scripted spoken line** | `conversation.item.create` with `item.type:"force_message"` (xAI extension) | Good for the proactive "heads up" alert | same |
| **Text-to-speech (fallback / alerts)** | `POST https://api.x.ai/v1/tts` JSON `{text, voice_id:"eve", language:"en"}` → MP3 bytes | | https://docs.x.ai/docs/guides/voice |
| **Reasoning / written brief** | `POST https://api.x.ai/v1/responses` | `grok-4.7` (the docs' recommended model for chat and code). Supports function tools. The Vercel AI SDK uses `xai.responses('grok-4.7')` | https://docs.x.ai/docs/guides/function-calling, https://docs.x.ai/docs/models |
| **Grok Imagine (encounter visuals)** | `POST https://api.x.ai/v1/images/generations` `{model, prompt, aspect_ratio:"16:9", resolution:"1k", response_format:"url"\|"b64_json", n}` | `grok-imagine-image-2.0` ($0.04/image). Returned URLs are **temporary**, so download them | https://docs.x.ai/developers/model-capabilities/images/generation |
| **Imagine video (stretch)** | `POST https://api.x.ai/v1/videos/generations` → poll `GET /v1/videos/{request_id}` until `status:"done"` | `grok-imagine-video-1.5`, up to 15 s | https://docs.x.ai/docs/guides/image-generations |

Pricing (docs.x.ai/docs/models): voice is $0.08/min, so a full weekend of testing costs a few dollars. Images cost $0.04 each.

---

## 3. Architecture (keep it simple)

```
                      ┌──────────────────────────── Browser (Next.js page) ───────────────────────────┐
                      │  CesiumJS globe (Resium)  │  Ranked warning cards  │  Mic button + transcript │
                      │        ▲ flyTo(event)     │        ▲               │   WebSocket ─────────────┼──► wss://api.x.ai/v1/realtime
                      │        └── UI actions ◄───┴── voice function calls ┘   (ephemeral token)     │      grok-voice-latest
                      └───────────────┬───────────────────────────────────────────────────────────────┘
                                      │ fetch
            ┌─────────────────────────▼──────────────── Next.js API routes (server) ───────────────────────┐
            │ /api/voice/token  → POST /v1/realtime/client_secrets                                         │
            │ /api/conjunctions?norad= → ranked list (from cached SOCRATES snapshot + GP)                  │
            │ /api/encounter/:id → both objects' OMM + satellite.js tracks ±15 min around TCA              │
            │ /api/brief/:id    → grok-4.7 (Responses API) → structured "why it matters" JSON              │
            │ /api/imagine/:id  → grok-imagine-image-2.0 (prompt built from real numbers) → cached PNG     │
            │ /api/shells       → conjunction counts per 25 km altitude band, per snapshot                 │
            └─────────────────────────┬────────────────────────────────────────────────────────────────────┘
                                      │ (polite, cached, ≤1/hr check)
            ┌─────────────────────────▼──────────┐       ┌─────────────────────────────────────┐
            │ ingest script (npm run ingest)     │──────►│ data/ (JSON snapshots, committed     │
            │ jsonDir → sort-minRange.csv → parse│       │ fixture for demo reliability)        │
            │ GP: CATNR lookups + 1× GROUP=active│       └─────────────────────────────────────┘
            └────────────────────────────────────┘
```

**Stack**
- **Next.js (App Router) + TypeScript**, deployed on **Vercel**. One repo, with the API routes and the UI in the same place.
- **CesiumJS via Resium** for the globe. It's the most impressive option and has a real-scale Earth and time controls. Cesium in Next.js needs its static assets (`Workers`, `Assets`, `Widgets`, `ThirdParty`) copied to `/public/cesium` and `window.CESIUM_BASE_URL` set. Load it with `dynamic(() => import(...), { ssr: false })`. Default imagery needs a free Cesium ion token. You can skip that with the bundled Natural Earth II imagery or OpenStreetMap. **Fallback if Cesium fights you for more than an hour:** `globe.gl` (three.js), which is far simpler.
- **satellite.js 7** for SGP4 propagation from OMM JSON.
- **Storage:** JSON files in `data/` (plus `better-sqlite3` locally if you want). No database service. For the weekend, the ingest runs locally or from a GitHub Action cron every 6 hours (that's within CelesTrak policy) and commits the snapshot.
- **Grok calls:** plain `fetch` to the endpoints above, or the Vercel AI SDK `@ai-sdk/xai` for text and images. The voice WebSocket is hand-rolled in the browser (about 150 lines with an AudioWorklet at 24 kHz PCM16).
- **Secrets:** `XAI_API_KEY` (server only), `NEXT_PUBLIC_CESIUM_ION_TOKEN` (optional), and `SPACETRACK_USER/PASS` (optional, server only).

**Voice function tools (this is what makes it agentic, not a chat box)**

| Tool | What it does | UI side effect |
|---|---|---|
| `get_ranked_conjunctions(norad_id, horizon_hours?)` | Returns the top N ranked events, plus counts of dismissed ones grouped by reason | Card list fills in |
| `explain_conjunction(event_id)` | Returns the full numbers, score breakdown, and data-quality flags | Card expands |
| `focus_encounter(event_id)` | Propagates both objects around TCA | **Globe flies to the encounter and time jumps to TCA** |
| `render_encounter(event_id)` | Calls Imagine with a data-built prompt | Image fades in over the globe |
| `get_crowded_shells(alt_min?, alt_max?)` | Returns conjunction density per altitude band | Heatmap rings on the globe |
| `compare_with_fresh_data(event_id)` | Re-propagates with the newest GP and recomputes miss distance | Shows "SOCRATES said 514 m, today's data says X m" |
| `draft_operator_note(event_id)` (stretch) | Writes a plain-language note to the team or a data-request email | Text box (never auto-sent) |

---

## 4. Features: MVP vs stretch

**MVP (must work for the demo, in priority order)**
1. **Ingest + normalize SOCRATES** for one NORAD ID ("ours" is always object 1), with a committed snapshot fixture.
2. **Risk ranker** (Section 5) with a **"dismissed: N, here's why" summary**, e.g. "31 docked/co-orbiting, 12 low-probability, 4 stale data".
3. **Grok voice briefing** with function tools. You say "check on our CubeSat" and it calls the tools and speaks the triage.
4. **3D globe** that flies to the top encounter and draws both orbit tracks ±15 min around TCA with a closest-approach marker.
5. **Grok Imagine encounter render**: one image per top event, with the prompt built from real values (altitude, speed, object type, sunlit vs shadow). It's labeled "artist's rendering from real orbital data".
6. **Written brief card** (grok-4.7) that matches the spoken brief, for people watching with sound off.

**Stretch (in order of demo impact)**
1. **Proactive alert:** when a new SOCRATES run lands and a new event crosses the threshold, Orbit Watch **speaks first** (`force_message` or TTS). Phone-call version: xAI ships a Twilio phone-agent demo, so Grok can call the team lead. ⚠️ I haven't checked Twilio setup time, so only try it if the MVP is done by Sunday noon.
2. **Crowded shells view:** conjunctions per 25 km altitude band (and inclination) across every snapshot collected over the weekend, drawn as glowing rings. "This is where your next CubeSat shouldn't go."
3. **Fresh-data recheck:** re-propagate with the latest GP and show how the miss distance changed. This is real conjunction-assessment practice.
4. **Fleet mode:** a whole university or rideshare batch (`INTDES=` query) at once.
5. **CDM importer:** paste a Space-Track CDM and Grok explains it.
6. **Imagine video:** a 6–12 s `grok-imagine-video-1.5` clip animating the encounter still.
7. **Differential-drag hint:** for CubeSats with deployables, explain attitude-based drag changes as the only "maneuver" available. Present it as educational only.

**Out of scope (say so in the writeup):** making real maneuver decisions or replacing 18 SDS or the operator's own assessment. Show the disclaimer "Not for operational use" in the UI.

---

## 5. Risk-ranking approach

SOCRATES gives you, per event: `TCA_RANGE` (km), `TCA_RELATIVE_SPEED` (km/s), `MAX_PROB`, `DILUTION` (km), `DSE_1/2` (days), TCA, and the ops status in each name. Use those directly and keep the formula explainable, so Grok can read it out loud.

**Step 1: dismiss with a reason (this is the "alert fatigue" win)**

| Rule | Reason Grok says out loud |
|---|---|
| `rel_speed < 0.05 km/s` | "Docked or flying in formation, not a collision course" (e.g. ISS–Soyuz above, or **rideshare deployment siblings**, which matters a lot for CubeSats) |
| `MAX_PROB < 1e-6` **and** `range > 2 km` | "Low probability, even assuming worst-case uncertainty" |
| TCA already passed / outside horizon | "Already happened" |
| Duplicate pair recurring every orbit | Collapse into one event: "the same pair, 7 passes" |

**Step 2: score what's left (0–100)**

```
P   = clamp((log10(MAX_PROB) + 7) / 4, 0, 1)        # 1e-7 → 0, 1e-3 → 1   (weight 0.40)
R   = exp(-range_km / 1.0)                          # 0 km → 1, 1 km → 0.37, 5 km → ~0  (weight 0.25)
V   = clamp(rel_speed_kms / 15, 0, 1)               # impact energy ∝ v², head-on LEO ≈ 10–15 km/s (weight 0.15)
T   = time-to-TCA urgency: 1.0 if 6–72 h out (time to act), 0.6 if <6 h, 0.4 if >72 h   (weight 0.10)
S   = secondary severity: debris/dead R/B [-] = 1.0 (can't dodge), active payload [+] = 0.6 (can coordinate)  (weight 0.10)

score = 100 * (0.40P + 0.25R + 0.15V + 0.10T + 0.10S)
```

**Step 3: confidence flags (shown and spoken, but not used in the score)**
- **Stale data:** `max(DSE_1, DSE_2) > 3` days. "Orbit data is 6 days old at TCA. Treat this as a heads-up, and recheck as it gets closer."
- **Diluted:** `DILUTION` large relative to range. Per CelesTrak, "obtain better data and reassess", so use max probability as the conservative number.
- **Fresh-data delta (stretch):** your own satellite.js recompute vs the SOCRATES range.

**Step 4: tiers.** 🔴 Act (score ≥ 70 or MAX_PROB ≥ 1e-4), 🟠 Watch (40–70), 🟢 Info (< 40). For reference, NASA's CARA practice often treats Pc ≥ 1e-4 as the action threshold. ⚠️ That's commonly cited; check the NASA CA Best Practices Handbook (linked from Space-Track docs) before quoting it on stage.

**What the CubeSat can actually do:** most CubeSats can't maneuver, so "Act" means: notify the team, check you're registered with 18 SDS for CDMs, request better data, plan ops around TCA, and (stretch) differential drag. Saying this honestly makes the pitch stronger.

Calibrate the weights against the live data on Saturday night. If the top 3 don't look like what an expert would pick, adjust and write down why. That tuning story is good Devpost material.

---

## 6. Phased build schedule (about one weekend)

⚠️ **I haven't confirmed the challenge's submission deadline.** Check the Devpost page and change the times below if needed. All times are ET.

| Phase | When | Goal | Done when |
|---|---|---|---|
| **0. Setup** | Sat 7–9 PM | Repo, Next.js scaffold, `.cursor/rules`, env vars, xAI key works (test with one TTS curl) | `npm run dev` shows a blank globe page; `curl /v1/tts` returns an MP3 |
| **1. Data + ranker** | Sat 9 PM–1 AM | Ingest script, SOCRATES parser, GP fetch + cache, ranker + unit tests, fixture committed | `/api/conjunctions?norad=25544` returns ranked JSON with the ISS–Soyuz pair dismissed and ISS–Breeze-KM on top |
| **2. Globe** | Sun 9 AM–12 PM | Cesium globe, orbit tracks around TCA, closest-approach marker, `flyTo` | Clicking a card flies to the encounter |
| **3. Voice** | Sun 12–3 PM | Token route, browser WebSocket, mic/speaker audio, 5 function tools wired to UI | You say "check on our CubeSat" and it speaks the triage while the globe moves on its own |
| **4. Imagine + brief** | Sun 3–5 PM | `/api/imagine` with data-built prompts + caching; grok-4.7 brief card | Top event shows a rendering in under 15 s (pre-warm the cache for the demo) |
| **5. Stretch** | Sun 5–7 PM | Pick ONE: proactive alert, or crowded shells | Works on the demo path |
| **6. Ship** | Sun 7–10 PM | Deploy to Vercel, record 2-min video, Devpost writeup, screenshots | Submitted, with a backup recording |

**Rules for the weekend:** commit at least every hour (that's Cursor-usage evidence too). Freeze features 3 hours before the deadline. Always demo from the committed fixture, with a "LIVE" toggle if the network cooperates.

---

## 7. Cursor prompts / tasks (copy-paste, one per Cursor Agent run)

Use Cursor Agent mode for each. Keep `.cursor/rules/orbit-watch.mdc` in the repo (prompt 0) so every run has context. Screenshot a few runs for Devpost.

0. **Rules file:** *"Create `.cursor/rules/orbit-watch.mdc` describing this project: Next.js App Router + TypeScript, CesiumJS via Resium, satellite.js v7 (use `json2satrec` with OMM JSON, never TLE), xAI APIs (base https://api.x.ai/v1, key only on the server in XAI_API_KEY). CelesTrak etiquette: cache everything, check SOCRATES jsonDir.php at most once an hour, GP at most once per 2 hours, stop on any non-200 and log it. All times are UTC internally and shown in the user's local time."*
1. **Scaffold:** *"Scaffold a Next.js 15 App Router TypeScript app called orbit-watch with Tailwind. Add pages: `/` (dashboard with left panel for ranked warnings, center globe, right panel for transcript). Add `.env.example` with XAI_API_KEY, NEXT_PUBLIC_CESIUM_ION_TOKEN (optional). Add vitest."*
2. **SOCRATES ingest:** *"Write `scripts/ingest-socrates.ts`. GET https://celestrak.org/SOCRATES/jsonDir.php, read FILE_NAME and FILE_MTIME. If FILE_MTIME is newer than `data/socrates/latest.json`'s mtime, download `https://celestrak.org/SOCRATES/<FILE_NAME>` (stream it; it's ~21 MB). Parse the RFC 4180 CSV with header `NORAD_CAT_ID_1,OBJECT_NAME_1,DSE_1,NORAD_CAT_ID_2,OBJECT_NAME_2,DSE_2,TCA,TCA_RANGE,TCA_RELATIVE_SPEED,MAX_PROB,DILUTION`. Split the ops status out of names like `ISS (ZARYA) [+]`. Write `data/socrates/<mtime>.json` indexed by NORAD id, plus a `latest.json` pointer. On any non-200 response, throw and stop with no retries."*
3. **Fixture fallback:** *"Add a fallback: if the network fetch fails, load `data/fixtures/socrates-sample.json`. Create that fixture from the HTML table at https://celestrak.org/socrates/table-socrates.php?CATNR=<OUR_NORAD>,&ORDER=MAXPROB&MAX=200 (parse the table rows; each conjunction is two `<tr>`s)."*
4. **GP client:** *"Write `lib/gp.ts`: `getOmm(catnr)` fetches `https://celestrak.org/NORAD/elements/gp.php?CATNR=<n>&FORMAT=JSON`, caches to `data/gp/<n>.json`, and only re-fetches if the cache is more than 2 hours old. Handle non-200 by returning the cached copy and logging a warning."*
5. **Ranker:** *"Implement `lib/rank.ts` exactly as in this spec: [paste Section 5]. Export `rankConjunctions(events, ourNorad, now)` returning `{ranked, dismissed: {reason, count, examples}[]}`. Normalize so 'ours' is always the primary. Collapse recurring same-pair events. Write vitest tests: ISS–SOYUZ-MS 29 at 0.002 km/s gets dismissed as docked; ISS–BREEZE-KM R/B at 0.514 km / 13.942 km/s / 5.243e-4 is tier Act."*
6. **API routes:** *"Create `/api/conjunctions?norad=&horizon=` and `/api/encounter/[id]`. Encounter: load both objects' OMM, `json2satrec`, propagate every 10 s from TCA−15 min to TCA+15 min, convert ECI→ECF→geodetic, return tracks plus our own computed min distance and its time, so we can compare with SOCRATES."*
7. **Globe:** *"Add a client-only `<Globe>` component using Resium, loaded with `next/dynamic` ssr:false. Copy Cesium static assets to `/public/cesium` in a postinstall script and set CESIUM_BASE_URL. Render the two tracks as glowing polylines (ours cyan, other red), a pulsing point at closest approach, and expose `flyToEncounter(id)` through a zustand store so non-React code (voice tools) can call it. If the ion token is missing, use bundled NaturalEarthII imagery."*
8. **Voice token:** *"Create `/api/voice/token` (POST) that calls `https://api.x.ai/v1/realtime/client_secrets` with body `{expires_after:{seconds:300}}` and the server XAI_API_KEY, and returns `{value, expires_at}`."*
9. **Voice client:** *"Build `lib/voice.ts`: open `new WebSocket('wss://api.x.ai/v1/realtime?model=grok-voice-latest', ['xai-client-secret.'+token])`. On open, send `session.update` with voice 'eve', server_vad, PCM16 24 kHz in and out, the instructions in `prompts/voice.md`, and function tools get_ranked_conjunctions, explain_conjunction, focus_encounter, render_encounter, get_crowded_shells (JSON schemas). Capture the mic with an AudioWorklet → PCM16 base64 → `input_audio_buffer.append`. Play `response.output_audio.delta` chunks gaplessly. On `response.function_call_arguments.done`, run the tool (call our API routes and the zustand store), send `conversation.item.create` with type function_call_output, wait for playback to drain, then send `response.create`. Show the transcript in the right panel."*
10. **Voice persona prompt:** *"Write `prompts/voice.md`: you are Orbit Watch, a calm flight-dynamics copilot for a university CubeSat team. Always call tools for numbers and never invent them. Lead with the one thing that matters, then say how many warnings were dismissed and why, in one sentence. Say distances in meters, speeds in km/s and 'times faster than a bullet' once. Times in the listener's local time. If data is stale, say so. Never recommend a maneuver as an order. End with one suggested next step."*
11. **Imagine:** *"Create `/api/imagine/[id]`: build a prompt from real values, e.g. 'Photorealistic view in low Earth orbit at {alt} km above {region}, a 3U CubeSat with deployed solar panels, a tumbling {secondary type, e.g. spent Breeze-KM upper stage} streaking past at {rel_speed} km/s, {sunlit|in Earth's shadow}, Earth's limb below, cinematic, accurate scale'. POST https://api.x.ai/v1/images/generations with model grok-imagine-image-2.0, aspect_ratio 16:9, response_format b64_json. Save to `public/renders/<id>.png` (URLs are temporary). Return the cached file if it exists."*
12. **Brief:** *"Create `/api/brief/[id]` calling POST https://api.x.ai/v1/responses with model grok-4.7. Input: the event JSON + score breakdown. Ask for structured JSON {headline, why_it_matters, confidence_note, next_step}. Render it as the expanded card."*
13. **Crowded shells (stretch):** *"Write `lib/shells.ts`: for each snapshot, map each conjunction's primary to altitude using its OMM mean motion (a = (μ/n²)^(1/3), alt = a − 6378.137 km), bin into 25 km bands, count events and events with MAX_PROB>1e-5. `/api/shells` returns a time series. Render translucent rings on the globe sized by count."*
14. **Proactive alert (stretch):** *"Add a 'watch' mode: every hour, poll the conjunctions API (which respects the cache rules). If a new event enters tier Act, send a `force_message` over the open voice session: 'Heads up: new close approach for {sat} in {hours} hours…', then let Grok continue with explain_conjunction."*
15. **Polish + deploy:** *"Add loading skeletons, a 'Not for operational use' footer, a DEMO/LIVE toggle (DEMO = committed fixtures), an OG image, and deploy to Vercel with the env vars. Write the README with setup, data sources, and credits to CelesTrak and the Space-Track citation."*

---

## 8. Two-minute demo script

| Time | On screen | Say / hear |
|---|---|---|
| 0:00–0:15 | Black screen → number counter ticks to **183,612** | **You:** "This week, the public screening flagged 183,612 possible collisions in orbit. My university CubeSat team has zero people whose job is to read them. Neither do most teams." |
| 0:15–0:25 | Orbit Watch dashboard, globe slowly spinning, dense dots | **You:** "So we built Orbit Watch. It runs on real CelesTrak data." Click the mic. |
| 0:25–0:55 | **WOW MOMENT.** You say *"Orbit Watch, how's our CubeSat looking this week?"* Cards cascade: dozens go grey with "dismissed" chips, and one card goes red. **The globe flies on its own** to the encounter and time scrubs to TCA as two tracks converge. | **Grok (voice):** "I checked 40 warnings for your satellite. 37 don't matter. Most are deployment siblings drifting alongside you at walking speed, and the rest are long shots. **One does.** Thursday at 3:59 PM, a dead Russian Breeze-KM rocket stage passes about 500 meters from you, head-on, at nearly 14 kilometers a second." |
| 0:55–1:10 | **Imagine render fades in** full-screen: CubeSat, rocket body streaking past, Earth's limb | **Grok:** "Here's roughly what that moment looks like." **You:** "Every detail in this image comes from the real numbers: altitude, speed, and whether they're in sunlight." |
| 1:10–1:30 | You ask *"How sure are you?"* The confidence flags light up and the fresh-data delta appears. | **Grok:** "Moderately. That orbit data is about six days old at closest approach, so treat this as a heads-up, not a verdict. I've rechecked with today's data, and the miss distance is holding at around 500 meters. Next step: confirm you're registered with the 18th Space Defense Squadron for official warnings." |
| 1:30–1:45 | Zoom out → **crowded-shell rings** glowing around Earth | **You:** "Collected over time, Orbit Watch shows where risk is building. This band is where our team's next CubeSat shouldn't go." |
| 1:45–1:55 | Quick montage: Cursor agent runs, commit graph, **Grok Bot planning chat** (about 3 s) | **You:** "Built entirely in Cursor, planned with Grok Bot, powered by Grok Voice and Grok Imagine." |
| 1:55–2:00 | Logo + "Space traffic control for everyone else." | |

**Numbers in the spoken lines are placeholders** (the 0.514 km / 13.942 km/s / Thu 3:59 PM ET values come from the real Oct 3 ISS example; the warning counts and the "holding at 500 m" recheck are made up for the script). Swap in real values from your own run.

**Demo safety:** pre-pick the event (use the real top event for your satellite on demo day, or the ISS as a stand-in if yours has nothing interesting). Pre-warm the Imagine cache. Record a backup take. Update the script's numbers to match whatever the data says that day.

---

## 9. Devpost checklist

- [ ] **Title + tagline:** "Orbit Watch: a Grok voice copilot that triages space traffic for CubeSat teams"
- [ ] **Inspiration:** your CubeSat team and the 183k-warnings-a-week stat (cite the SOCRATES run date)
- [ ] **What it does / How we built it:** architecture diagram (Section 3) + ranking formula (Section 5)
- [ ] **Real space data:** links to CelesTrak SOCRATES Plus, GP/OMM, and Space-Track if used. Include the data-usage etiquette you followed (caching, once-per-update)
- [ ] **Grok APIs used:** Voice (realtime speech-to-speech + function calling, `grok-voice-latest`), Imagine (`grok-imagine-image-2.0`), plus `grok-4.7` for briefs. Show a code snippet of each
- [ ] **Built with Cursor (more is better):** screenshots of 3–5 Agent runs, the `.cursor/rules` file, the commit history (lots of small commits), and a sentence on which parts the Cursor agents wrote
- [ ] **🟣 "Planned with Grok Bot" section (bonus):**
  - [ ] 2–3 screenshots of this chat: the idea brainstorm, the past-winner research, and the decision to build Orbit Watch
  - [ ] Link or attach `planning-log.md` (timestamped decisions) and this `build-plan.md`
  - [ ] One sentence: "Grok Bot researched past SpaceX/xAI winners, chose the problem, verified every API endpoint, and wrote this build plan and the Cursor task list"
  - [ ] Show about 3–10 s of the Grok Bot chat in the demo video
- [ ] **Challenges:** e.g. docked/co-orbiting false alarms, stale-data honesty, Cesium bundling, audio over WebSocket
- [ ] **Accomplishments + what's next:** fleet mode, CDM import, phone alerts, open-sourcing for other CubeSat teams
- [ ] **Disclaimer:** "Not for operational collision-avoidance decisions"
- [ ] **Credits:** CelesTrak (Dr. T.S. Kelso), Space-Track/USSPACECOM citation if used, satellite.js, CesiumJS
- [ ] **Links:** public GitHub repo, live Vercel URL, 2-min video (YouTube/Loom)
- [ ] **Team members** added on Devpost; submitted before the deadline ⚠️ (check the time)

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| CelesTrak blocks or rate-limits you (or the network fails during the demo) | Commit fixtures and use DEMO mode by default. Respect the once-per-update rules. Stop on any non-200. *Note: Grok Bot's own sandbox got TLS resets when it curled celestrak.org directly, though web fetches worked. Some cloud IPs may be blocked, so test from Vercel early.* |
| Your CubeSat has no interesting events this week (or isn't marked active) | Use the ISS or another active smallsat as a stand-in and say so honestly, or use fleet mode on a rideshare launch (`INTDES=`) |
| Voice audio plumbing eats Sunday | Start from xAI's Web Agent demo (linked in the voice docs). Fallback: push-to-talk → `/v1/stt` → grok-4.7 tools → `/v1/tts`, which still counts as Voice API |
| Cesium + Next.js bundling | Time-box it to 1 hour, then switch to globe.gl |
| Imagine is slow or inaccurate | Pre-generate and cache. Label it an artist's rendering. Keep prompts grounded in data |
| Overclaiming | Say it's triage and explanation, not operations. Judges respect that |

---

## 11. Open items for Arunima
1. **Your CubeSat's NORAD ID** (or the planned launch, if it isn't in orbit yet). Is it marked active on CelesTrak?
2. Does your team already get 18 SDS CDMs / have Space-Track operator access?
3. **Submission deadline** and team size. Will anyone else build with you?
4. Do you have an xAI API key with credits? (console.x.ai; budget about $10 covers the weekend)
5. GitHub repo name and whether it should be public.
