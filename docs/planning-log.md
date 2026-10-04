# Orbit Watch: Planning Log (planned with Grok Bot)

Hackathon: "Make it Legendary" (SpaceXAI). Rules: built with Cursor, real space data, Grok Imagine or Voice API. Bonus for planning with Grok Bot.

## Sat Oct 3, 2026 (ET)
- 5:52 PM: Brainstormed three ideas: Exoplanet Postcards, Talk to Mission Control, Apollo Rewind.
- 5:54 PM: Researched past SpaceX/xAI hackathon winners (Nova, Haggle, ThinkVoice, NASA Space Apps). Pattern: Grok does a real job on real data, one wow demo moment, voice used where it matters.
- 5:56 PM: Looked for a real space-data problem. Picked space traffic (close-approach alert overload in low Earth orbit). Runner-up: Rubin Observatory alert flood.
- 5:59 PM: Decision: build **Orbit Watch**, a Grok voice copilot that ranks public close-approach warnings (CelesTrak), briefs users out loud, and visualizes encounters with Grok Imagine.

## Larger-scope pitch
- Cuts alert fatigue for small operators (e.g. university CubeSat teams).
- Turns dense data tables into a shared, understandable picture.
- Adds up warnings over time to show which orbits are getting crowded.
- Scope note: a demo of AI triage and explanation, not a replacement for official tracking.

## Devpost bonus evidence
- Include a "Planned with Grok Bot" section with chat screenshots and this log.
- Show roughly 10 seconds of the Grok Bot chat in the demo video.

## Next steps
- [x] Write the build plan (data sources, architecture, demo script). See build-plan.md
- [ ] Set up GitHub repo and start first version with Cursor

## Sat Oct 3, 2026 (ET), continued
- 6:01 PM: Arunima said she's on a **CubeSat research team**, so Orbit Watch is aimed at small university operators who can't maneuver and have no dedicated conjunction-assessment staff. Confirmed: **going with Orbit Watch.**
- 6:03 PM: Grok Bot wrote **build-plan.md**. It covers the pitch, verified data sources (CelesTrak SOCRATES Plus + GP/OMM, optional Space-Track), architecture (Next.js + CesiumJS/Resium + satellite.js, server routes calling Grok), MVP vs stretch features, the risk-ranking formula, a weekend schedule, 16 Cursor prompts, a 2-minute demo script, and a Devpost checklist.
  - Checked against live docs on Oct 3: SOCRATES CSV format + query URLs, GP query format (default is now CSV, so pass FORMAT=JSON), CelesTrak usage limits, xAI Voice realtime (`grok-voice-latest`), ephemeral tokens (`/v1/realtime/client_secrets`), TTS (`/v1/tts`), Imagine (`grok-imagine-image-2.0`), text (`grok-4.7` via `/v1/responses`).
  - Still to confirm: the raw SOCRATES CSV URL (`/SOCRATES/sort-minRange.csv`, inferred from jsonDir), Space-Track `cdm_public` class (third-party docs), and the challenge deadline.
  - Real data example found: ISS vs BREEZE-KM R/B, 0.514 km at 13.9 km/s on Thu Oct 8; ISS vs docked Soyuz MS-29 flagged repeatedly at 0.002 km/s (a classic false alarm).

## Next steps (updated)
- [ ] Arunima: send the CubeSat NORAD ID, deadline, team size, and xAI API key status
- [ ] Set up GitHub repo and run Cursor prompts 0–5 (scaffold, ingest, ranker)

## Sat Oct 3, 2026 (ET): demo CubeSat chosen
- 6:15 PM: Arunima has no CubeSat in orbit, so we picked a real university CubeSat as a stand-in instead of the ISS. Checked the CelesTrak `cubesat` GP group and SOCRATES Plus (run of Oct 3, 00:19 UTC, window Oct 3–10). All three candidates show as operational `[+]` in SATCAT.
  - **Chosen: SWISSCUBE (NORAD 35932)**, EPFL's 1U CubeSat, about 685 km, sun-synchronous, no propulsion. Top event: **SL-8 DEB (19831)**, TCA 2026-10-05 01:26:28.592 UTC (**Sun Oct 4, 9:26 PM ET**), **0.621 km**, **13.881 km/s**, max prob **5.614E-06**. The same feed also has a built-in false alarm for the ranker to dismiss: BEESAT-1 (35933, its 2009 launch sibling) at 4.368 km and **0.078 km/s**. It also passes Fengyun-1C and Cosmos 2251 debris, which makes a good story for the demo.
  - Runner-up: FORESAIL-1 PRIME (66778, Aalto Univ., ~507 km). Best "alert fatigue" example: three rideshare siblings flagged at 0.08–0.13 km/s, plus a repeating same-pair event with IRIDE-MS1-EAGLET 2-9.
  - Alternate: ROBUSTA-3A (60243, Univ. of Montpellier, ~527 km). Closest event is CZ-6A DEB, 0.940 km at 14.913 km/s. The debris orbit data is 8.7 days old, so it's a good "stale data, get better data" example.
  - Note: these probabilities (around 1e-6 to 1e-5) are much lower than the ISS–Breeze-KM 5.2E-04 event. Update the demo narration and the ranker test fixtures to use SwissCube's numbers, and pull a fresh SOCRATES snapshot before recording, since this event happens Sunday night.

## Sat Oct 3, 2026, 6:17 PM ET
- Demo is Sun Oct 4, 1-4 PM ET. Compressed schedule: tonight = data + ranker + globe; Sun morning until ~11 AM = Grok Voice + Imagine, demo locked on fixtures; 11 AM-1 PM = rehearse, backup recording, Devpost writeup. Stretch features only if time allows.
- SwissCube's SL-8 DEB pass (Sun 9:26 PM ET) will still be upcoming during the demo.

## Sat Oct 3, 2026, 6:18 PM ET
- Submission deadline confirmed: Sun Oct 4, 12:00 PM ET; demo 1-4 PM. Plan: tonight = data + ranker + globe; until 9:30 AM = Grok Voice + Imagine + demo locked; 9:30-11:30 AM = video + Devpost writeup; submit by 11:30 AM.
- Correction 6:18 PM ET: judging is Sun Oct 4, 12:30-2:30 PM ET (not 1-4). Demo must run reliably on committed fixtures through that window.

## 2026-10-03 6:40 PM ET: PR #1 ready, globe started
- Cloud agent opened https://github.com/ArunimaV/orbit-watch/pull/1 (draft): three-panel dashboard, SOCRATES ingest + GP client, `/api/conjunctions`, `/api/encounter/[id]`, ranker, 18 tests passing, build green.
- Ranker recalibrated for CubeSat-scale probabilities: prob term = clamp((log10(p)+8)/3, 0, 1); Act if score >= 70 or Pmax >= 1e-5; co-orbiting cutoff 0.10 km/s. Result: SwissCube vs SL-8 DEB = #1, Act, score 84.0; BEESAT-1 dismissed as co-orbiting.
- Risk found: CelesTrak timed out from the agent's VM (and from Grok Bot's computer), so some fixture fields and GP element sets are synthetic. Headline SL-8 DEB numbers are real from earlier research. Decision: retry real data once in Phase 2; otherwise refresh fixtures from the user's machine before locking the demo.
- Queued Phase 2 (3D globe with Cesium/Resium, fly-to encounter, default view on SwissCube vs SL-8 DEB) on the same PR.

## 2026-10-03 6:58 PM ET: Parallel overnight build
- To let the user sleep, launched a second Cursor cloud agent (https://cursor.com/agents/bc-48f4c11a-087d-55d3-96ff-b31f1418e400) to build Grok Voice (ephemeral token route, realtime WebSocket, function tools, text+TTS fallback) and Grok Imagine (cached encounter render) in parallel with the globe agent. It builds in mock mode with no key; the xAI key gets added tomorrow.

## 2026-10-03 7:02 PM ET: xAI key verified, first Imagine render
- User saved the xAI key through the secure field. Grok Bot confirmed live: /v1/models (grok-4.7, grok-imagine-image-2.0 available), /v1/realtime/client_secrets (returns value + expires_at), /v1/images/generations, /v1/tts (audio/mpeg).
- Generated the first Grok Imagine render (SwissCube vs SL-8 DEB over Earth at night) and gave it to the voice agent to commit as the cached demo render, so judging never depends on a live image call. Passed the confirmed API shapes to the agent too.

## 2026-10-03 7:16 PM ET: Voice PR #2 landed and verified live
- Second agent opened https://github.com/ArunimaV/orbit-watch/pull/2 (targets the PR #1 branch): ephemeral token route, push-to-talk realtime voice, 4 function tools (ranked warnings, encounter, explain dismissed, focus globe), "Brief me" fallback (grok-4.7 + TTS), cached Imagine route with the chosen photoreal render. 40 tests, build green.
- Grok Bot verified with the real key: realtime WebSocket with the `xai-client-secret.` subprotocol connects and returns audio. Event names (response.output_audio.delta, response.output_audio_transcript.delta) match the PR's handlers. /v1/responses output parses as message > output_text, matching the PR.
- Render upgraded to grok-imagine-image-quality (ISS-photo style); rejected a version with incorrect NASA logos on SwissCube (it's an EPFL satellite).

## 2026-10-03 7:25 PM ET: Globe landed; real data unblocked
- PR #1 now has a Cesium/Resium globe (no ion token): opens on SwissCube vs SL-8 DEB, flies to the pass, animates both tracks, pulsing TCA marker "621 m · 13.881 km/s", scrubber.
- Problem: tracks were drawn from synthetic element sets because CelesTrak HTTPS timed out. Grok Bot found plain http://celestrak.org responds, and fetched real GP for 11 objects plus the real SwissCube SOCRATES table (confirms SL-8 DEB 0.621 km / 13.881 km/s / 5.614E-06; BEESAT-1 4.368 km / 0.078 km/s). Handed to the globe agent to replace all synthetic fixtures.
- Also asked it to merge the voice PR #2 into the PR #1 branch, wire voice "focus" to the globe, and show the Imagine render, so there's one PR to merge in the morning.

## 2026-10-03 7:40 PM ET: One PR, real data, full flow working
- PR #1 is ready for review with the voice PR merged in. All fixtures are real: SwissCube SOCRATES table (21 rows, data as of 2026-10-03 00:19:27 UTC) and real Oct 3 GP element sets. Propagated SwissCube vs SL-8 DEB miss from real elements: 0.691 km vs SOCRATES 0.621 km (the gap is epoch difference). 43 tests, build green.
- Ranker on real data: 21 screened, 19 dismissed with reasons (1 co-orbiting, 16 low probability, 2 duplicate passes), 2 kept (SL-8 DEB Act 84.0, SL-8 R/B Watch 66.9).
- Polish for the morning: show TCA in the user's local time (9:26 PM ET "tonight") instead of UTC in cards and the briefing; live voice test with the key; deploy.

## 2026-10-03 8:18 PM ET: Pulling the morning work into tonight
- User asked to finish tonight. Queued final polish: local-time TCAs ("Sun Oct 4, 9:26 PM EDT (tonight)"), a pinned demo clock so ranking stays stable during judging, a "How it works" panel plus CelesTrak credit, and Vercel deploy readiness.
- Wrote the 30-second judge pitch (183,612 weekly conjunctions; SwissCube 21 warnings, 19 dismissed; SL-8 DEB at 621 m, 13.9 km/s, Sunday 9:26 PM ET).

## 2026-10-03 9:24 PM ET: Live, voice working, final UX
- Deployed to Vercel at https://orbit-watch-nu.vercel.app. Debugged with the user: Vercel key was missing (added + redeploy), then local .env.local (key had been put in .gitignore by mistake; not committed). Live voice tested by the user and working.
- PR #3 merged: local-time TCAs, pinned demo clock (DEMO_NOW 2026-10-04T16:00Z), per-card live Imagine renders, natural Grok briefing, How it works, Vercel Cesium fix.
- PR #4: transcript shows only the latest exchange (user request).
- Validation for judges: CelesTrak's own SOCRATES page for CATNR 35932 shows the SL-8 DEB row (0.621 km, 13.881 km/s, 2026-10-05 01:26:28 UTC); app's independent propagation gives 0.691 km.
- 2026-10-03 21:32 ET: Arunima captured dated CelesTrak SOCRATES proof (data current 2026 Oct 03 00:19 UTC, SwissCube vs SL-8 DEB 0.621 km, 183,612 conjunctions). Saved as ow-real/celestrak-proof-dated.png.
- 2026-10-03 21:44 ET: Discussed mitigation playbook with Grok Bot (refine data via Space-Track/LeoLabs, re-screen as TCA nears, small along-track burn if propulsive, differential drag if not, coordinate or safe-mode). SwissCube Pmax 5.6e-6 is far below the ~1e-4 maneuver threshold, so the decision is watch. Queued: 'What should I do?' advice feature, 'Built for teams like mine' story, 0.691 vs 0.621 km independent check.
- 2026-10-03 21:46 ET: Grok Bot drafted the project README (real SwissCube numbers, funnel, mermaid flow, stack verified against package.json); Arunima to commit it from the Cursor editor. Also asked agents to commit small and often, and added a subtle Clear chat button to the alert/countdown PR.
- 2026-10-03 22:10 ET: PR #5 ready (9 commits): heads-up alert, live TCA countdowns, Verify on CelesTrak links, Clear chat, Show all dismissed (19), radar favicon designed with Grok Bot. Vercel preview passed.
- 2026-10-03 23:43 ET: PR #6 merged and tested by Arunima: card countdowns, Show all 16, heads-up on every refresh, stacking transcript with Clear all working. Small backup-timer PR for the banner in progress.

## Sun Oct 4, ~12:55–1:15 AM ET: Brief me diagnosis and parallel agents
- User: "Brief me" slow even on stable Wi-Fi, and it spoke filler ("I'll focus the globe on the one close pass...").
- Grok Bot measured it: 18–50 s click-to-sound. Causes: reasoning model (grok-4.7) spending 600–860 hidden tokens on a 60-word brief, TTS buffered instead of streamed, and a briefing prompt that reused tool-calling instructions with no tools (hence the filler).
- Plan: switch the brief to the fast non-reasoning model, use a brief-only prompt with a localBriefing fallback, stream TTS, show text instantly. Target is about 2–3 s.
- Decided to parallelize with Cursor cloud agents: (1) main agent does any-CubeSat lookup PR #8 then globe polish, (2) new agent does Fix slow Brief me, (3) new agent does Share this alert + voice on/off toggle. Each is its own PR, with small commits; user tests each preview before merging.
- Demo script drafted (hook, real alert, ask Grok, Imagine render, CelesTrak proof, any-CubeSat, close).

## Sun Oct 4, ~1:30–3:15 AM ET — Merge sprint with Grok Bot
- Merged #11 (Brief me fix: fast non-reasoning model, streamed TTS, instant text) and #10 (Share this alert + voice on/off toggle).
- Decided SpacetimeDB is the core real-time backend for a shared "team mode" mission room; launched a cloud agent for it (#13, draft, for morning review).
- To finish faster, told agents to skip demo videos and just merge main and build. Grok Bot closed duplicate Share PR #14 (Share already shipped in #10).
- Merged #8 (look up any CubeSat), #9 (side label, colored orbits, Show dismissed, Replay alert), and #15 (heads-up banner layout tidy, after Arunima flagged it overlapping the header). Grok Bot sequenced the merges so each branch included main first, so there were no conflicts.
- Arunima's testing found that after switching to BEESAT-1 (35933), the voice panel and briefing text still said SwissCube. Grok Bot queued a small fix PR so all text and voice follow the selected satellite.
- 3:19 AM: Merged #16 (voice, Brief me, and the mic hint follow the selected CubeSat). Arunima verified it with BEESAT-1. Features are frozen for the night; the mission room (#13) is up for review in the morning.
- 3:35 AM: Mission room PR #13 is caught up with main (it includes #15 and #16) and marked ready. The agent tested it with two windows: presence went 1 to 2 watching, status and notes synced, and Brief me posted to the shared feed. With SpacetimeDB off, the app is unchanged. Next: in the morning, merge it, publish the database, and set the Vercel env vars.
- 3:58 AM: Merged #13 and published the SpacetimeDB database 'orbit-watch' to Maincloud. Arunima verified syncing locally (status, notes, presence, feed) and saw the tables in both spacetime sql and the dashboard. The Vercel env vars for the room are optional; she may demo the room on localhost.
