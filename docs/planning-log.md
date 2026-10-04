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
