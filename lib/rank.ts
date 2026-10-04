import type {
  ConjunctionEvent,
  ConfidenceFlags,
  DismissedExample,
  DismissedGroup,
  RankedEvent,
  RankResult,
  ScoreBreakdown,
  Tier,
} from "./types";
import { makeEventId } from "./socrates";

/**
 * CubeSat calibration of the Section 5 ranker. Weights are unchanged.
 *
 * Public SOCRATES max-probabilities for an unmaneuverable CubeSat sit around
 * 1e-6 to 1e-5. The original probability map, (log10(p)+7)/4, treated 1e-3 as
 * the top of the scale and 1e-4 as the Act shortcut (a NASA CARA-style Pc).
 * On that scale SwissCube vs SL-8 DEB — 621 m, 13.881 km/s, 5.614e-6 — scored
 * in the low 60s and never tripped Act.
 *
 * P is now clamp((log10(p)+8)/3, 0, 1): 1e-8 → 0, 1e-5 → 1. Once a typical
 * CubeSat probability is no longer crushed, the close miss and the head-on
 * speed carry SL-8 DEB over the Act score of 70. The Act probability shortcut
 * moved with the same data, from 1e-4 to 1e-5.
 *
 * The co-orbiting cutoff moved from 0.05 km/s to 0.10 km/s. 0.05 caught docked
 * vehicles (ISS–Soyuz at 0.002 km/s) and missed same-launch siblings
 * (BEESAT-1 at 0.078 km/s). 0.10 km/s is still about 100× slower than a
 * glancing LEO pass.
 */
export const CO_ORBIT_SPEED_KMS = 0.1;
export const ACT_SCORE = 70;
export const WATCH_SCORE = 40;
export const ACT_MAX_PROB = 1e-5;
export const LOW_PROB_MAX = 1e-6;
export const LOW_PROB_RANGE_KM = 2;
export const STALE_DSE_DAYS = 3;

export const DISMISS = {
  coOrbiting: "Docked or co-orbiting, not a collision course",
  lowProbability: "Low probability, even assuming worst-case uncertainty",
  alreadyHappened: "Already happened",
  outsideHorizon: "Outside the requested horizon",
  duplicate: "Duplicate pair recurring every orbit",
} as const;

const DISMISS_ORDER = [
  DISMISS.coOrbiting,
  DISMISS.lowProbability,
  DISMISS.alreadyHappened,
  DISMISS.outsideHorizon,
  DISMISS.duplicate,
];

interface Normalized {
  event: ConjunctionEvent;
  oursNorad: number;
  otherNorad: number;
  tcaMs: number;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function probabilityTerm(maxProb: number | null): number {
  if (maxProb === null || !(maxProb > 0)) return 0;
  return clamp((Math.log10(maxProb) + 8) / 3, 0, 1);
}

function urgencyTerm(hoursToTca: number): number {
  if (hoursToTca < 6) return 0.6;
  if (hoursToTca <= 72) return 1;
  return 0.4;
}

function severityTerm(opsStatus: string): number {
  if (opsStatus === "-") return 1;
  if (opsStatus === "+") return 0.6;
  return 0.8;
}

export function scoreEvent(
  event: Pick<ConjunctionEvent, "rangeKm" | "relSpeedKms" | "maxProb">,
  opsStatus: string,
  hoursToTca: number,
): ScoreBreakdown {
  const p = probabilityTerm(event.maxProb);
  const r = Math.exp(-event.rangeKm / 1);
  const v = clamp(event.relSpeedKms / 15, 0, 1);
  const t = urgencyTerm(hoursToTca);
  const s = severityTerm(opsStatus);
  const score = 100 * (0.4 * p + 0.25 * r + 0.15 * v + 0.1 * t + 0.1 * s);
  return { p, r, v, t, s, score };
}

export function tierFor(score: number, maxProb: number | null): Tier {
  if (score >= ACT_SCORE || (maxProb !== null && maxProb >= ACT_MAX_PROB)) return "Act";
  if (score >= WATCH_SCORE) return "Watch";
  return "Info";
}

function normalize(event: ConjunctionEvent, ourNorad: number): Normalized | null {
  const isFirst = event.object1.noradId === ourNorad;
  const isSecond = event.object2.noradId === ourNorad;
  if (isFirst === isSecond) return null;
  const tcaMs = Date.parse(event.tca);
  if (Number.isNaN(tcaMs)) return null;
  const otherNorad = isFirst ? event.object2.noradId : event.object1.noradId;
  return { event, oursNorad: ourNorad, otherNorad, tcaMs };
}

function oursSide(event: ConjunctionEvent, ourNorad: number) {
  if (event.object1.noradId === ourNorad) {
    return {
      ours: event.object1,
      other: event.object2,
      dseOurs: event.dse1,
      dseOther: event.dse2,
    };
  }
  return {
    ours: event.object2,
    other: event.object1,
    dseOurs: event.dse2,
    dseOther: event.dse1,
  };
}

function flagsFor(event: ConjunctionEvent, dseOurs: number | null, dseOther: number | null): ConfidenceFlags {
  const known = [dseOurs, dseOther].filter((value): value is number => value !== null);
  const staleDays = known.length > 0 ? Math.max(...known) : null;
  const diluted =
    event.dilutionKm !== null &&
    event.dilutionKm > 0 &&
    (event.rangeKm === 0 || event.dilutionKm > event.rangeKm);
  return {
    stale: staleDays !== null && staleDays > STALE_DSE_DAYS,
    diluted,
    staleDays,
  };
}

function dismissReason(
  event: ConjunctionEvent,
  tcaMs: number,
  nowMs: number,
  horizonMs: number,
  keepPast = false,
): string | null {
  if (event.relSpeedKms < CO_ORBIT_SPEED_KMS) return DISMISS.coOrbiting;
  if (
    event.maxProb !== null &&
    event.maxProb < LOW_PROB_MAX &&
    event.rangeKm > LOW_PROB_RANGE_KM
  ) {
    return DISMISS.lowProbability;
  }
  if (tcaMs < nowMs) return keepPast ? null : DISMISS.alreadyHappened;
  if (tcaMs > horizonMs) return DISMISS.outsideHorizon;
  return null;
}

function toExample(item: Normalized, passes: number, detail?: string): DismissedExample {
  const side = oursSide(item.event, item.oursNorad);
  return {
    id: makeEventId(item.oursNorad, item.otherNorad, item.event.tca),
    otherNorad: side.other.noradId,
    otherName: side.other.name,
    otherOpsStatus: side.other.opsStatus,
    tca: item.event.tca,
    rangeKm: item.event.rangeKm,
    relSpeedKms: item.event.relSpeedKms,
    maxProb: item.event.maxProb,
    passes,
    detail,
  };
}

function toRanked(item: Normalized, passes: number, nowMs: number): RankedEvent {
  const side = oursSide(item.event, item.oursNorad);
  const hoursToTca = (item.tcaMs - nowMs) / 3_600_000;
  const breakdown = scoreEvent(item.event, side.other.opsStatus, hoursToTca);
  return {
    id: makeEventId(item.oursNorad, item.otherNorad, item.event.tca),
    ours: side.ours,
    other: side.other,
    tca: item.event.tca,
    rangeKm: item.event.rangeKm,
    relSpeedKms: item.event.relSpeedKms,
    maxProb: item.event.maxProb,
    dilutionKm: item.event.dilutionKm,
    dseOurs: side.dseOurs,
    dseOther: side.dseOther,
    score: breakdown.score,
    breakdown,
    tier: tierFor(breakdown.score, item.event.maxProb),
    flags: flagsFor(item.event, side.dseOurs, side.dseOther),
    passes,
    hoursToTca,
    provenance: item.event.provenance,
    syntheticFields: item.event.syntheticFields,
    note: item.event.note,
  };
}

function pickRepresentative(group: Normalized[], nowMs: number, horizonMs: number): Normalized {
  const sorted = [...group].sort((a, b) => a.tcaMs - b.tcaMs);
  return (
    sorted.find((item) => item.tcaMs >= nowMs && item.tcaMs <= horizonMs) ??
    sorted.find((item) => item.tcaMs > horizonMs) ??
    sorted[sorted.length - 1]
  );
}

export interface RankOptions {
  /** Fixture demo: keep these NORAD ids even when their TCA is already past. */
  preservePastNorads?: readonly number[];
}

/**
 * Rank conjunctions for one satellite.
 * `now` is the evaluation instant. Times inside events stay UTC.
 * `horizonHours` defaults to the 7-day SOCRATES screen.
 */
export function rankConjunctions(
  events: ConjunctionEvent[],
  ourNorad: number,
  now: Date,
  horizonHours = 24 * 7,
  options: RankOptions = {},
): RankResult {
  const nowMs = now.getTime();
  const horizonMs = nowMs + horizonHours * 3_600_000;
  const groups = new Map<number, Normalized[]>();

  for (const event of events) {
    const normalized = normalize(event, ourNorad);
    if (!normalized) continue;
    const list = groups.get(normalized.otherNorad) ?? [];
    list.push(normalized);
    groups.set(normalized.otherNorad, list);
  }

  const dismissed = new Map<string, DismissedGroup>();
  const addDismissed = (reason: string, example: DismissedExample) => {
    const group = dismissed.get(reason) ?? { reason, count: 0, examples: [] };
    group.count += 1;
    if (group.examples.length < 3) group.examples.push(example);
    dismissed.set(reason, group);
  };

  const ranked: RankedEvent[] = [];

  for (const group of groups.values()) {
    const representative = pickRepresentative(group, nowMs, horizonMs);
    const extras = group.filter((item) => item !== representative);
    const passes = group.length;
    if (extras.length > 0) {
      const detail = `the same pair, ${passes} passes`;
      for (const extra of extras) {
        addDismissed(DISMISS.duplicate, toExample(extra, passes, detail));
      }
    }

    const keepPast = options.preservePastNorads?.includes(representative.otherNorad) ?? false;
    const reason = dismissReason(representative.event, representative.tcaMs, nowMs, horizonMs, keepPast);
    if (reason) {
      addDismissed(reason, toExample(representative, passes));
      continue;
    }
    ranked.push(toRanked(representative, passes, nowMs));
  }

  ranked.sort((a, b) => b.score - a.score || (b.maxProb ?? 0) - (a.maxProb ?? 0) || a.tca.localeCompare(b.tca));

  return {
    ranked,
    dismissed: DISMISS_ORDER.map((reason) => dismissed.get(reason)).filter((group): group is DismissedGroup => Boolean(group)),
  };
}
