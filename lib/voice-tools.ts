import { DEFAULT_HORIZON_HOURS, KNOWN_SATELLITES } from "./constants";
import { propagateEncounter, type TrackSample } from "./encounter";
import { getOmm } from "./gp";
import { findEventById, eventsForNorad, loadConjunctionSource } from "./socrates";
import { rankConjunctions } from "./rank";
import { formatLocalTime, safeTimeZone } from "./time-format";
import type { DismissedExample, DismissedGroup, RankedEvent } from "./types";
import { isVoiceToolName } from "./voice-tool-schema";

export interface VoiceToolOptions {
  now?: Date;
  horizonHours?: number;
  root?: string;
  offline?: boolean;
}

export interface VoiceContext {
  norad: number;
  satelliteName: string;
  satelliteDetail: string | null;
  horizonHours: number;
  totalEvents: number;
  ranked: RankedEvent[];
  dismissed: DismissedGroup[];
  dismissedCount: number;
  source: "snapshot" | "fixture";
}

export function loadVoiceContext(norad: number, options: VoiceToolOptions = {}): VoiceContext {
  if (!Number.isInteger(norad) || norad <= 0) {
    throw new Error("norad must be a positive integer");
  }
  const horizonHours = options.horizonHours ?? DEFAULT_HORIZON_HOURS;
  const loaded = loadConjunctionSource(options.root);
  const events = eventsForNorad(loaded.snapshot, norad);
  const result = rankConjunctions(events, norad, options.now ?? new Date(), horizonHours);
  const known = KNOWN_SATELLITES[norad];
  const dismissedCount = result.dismissed.reduce((sum, group) => sum + group.count, 0);
  return {
    norad,
    satelliteName: known?.name ?? result.ranked[0]?.ours.name ?? `NORAD ${norad}`,
    satelliteDetail: known?.detail ?? null,
    horizonHours,
    totalEvents: events.length,
    ranked: result.ranked,
    dismissed: result.dismissed,
    dismissedCount,
    source: loaded.source,
  };
}

function readArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  return args as Record<string, unknown>;
}

function readNorad(args: Record<string, unknown>): number {
  const value = args.norad;
  const norad = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(norad) || norad <= 0) {
    throw new Error("norad must be a positive integer");
  }
  return norad;
}

function readId(args: Record<string, unknown>): string {
  const value = args.id;
  if (typeof value !== "string" || !value.trim()) throw new Error("id must be an encounter id");
  return value.trim();
}

function readZone(args: Record<string, unknown>): string {
  return safeTimeZone(typeof args.timeZone === "string" ? args.timeZone : undefined);
}

export function compactRanked(event: RankedEvent, timeZone: string) {
  return {
    id: event.id,
    other: event.other.name,
    otherNorad: event.other.noradId,
    opsStatus: event.other.opsStatus,
    tier: event.tier,
    score: Math.round(event.score * 10) / 10,
    missMeters: Math.round(event.rangeKm * 1000),
    relSpeedKms: event.relSpeedKms,
    maxProb: event.maxProb,
    tcaUtc: event.tca,
    tcaLocal: formatLocalTime(event.tca, timeZone),
    stale: event.flags.stale,
    staleDays: event.flags.staleDays,
    diluted: event.flags.diluted,
    passes: event.passes,
  };
}

function compactDismissed(group: DismissedGroup) {
  return {
    reason: group.reason,
    count: group.count,
    examples: group.examples.slice(0, 3).map((example) => ({
      id: example.id,
      other: example.otherName,
      otherNorad: example.otherNorad,
      missMeters: Math.round(example.rangeKm * 1000),
      relSpeedKms: example.relSpeedKms,
      tcaUtc: example.tca,
      passes: example.passes,
      detail: example.detail ?? null,
    })),
  };
}

function rankedPayload(context: VoiceContext, timeZone: string) {
  return {
    norad: context.norad,
    satelliteName: context.satelliteName,
    satelliteDetail: context.satelliteDetail,
    horizonHours: context.horizonHours,
    screened: context.totalEvents,
    kept: context.ranked.length,
    dismissedCount: context.dismissedCount,
    ranked: context.ranked.slice(0, 8).map((event) => compactRanked(event, timeZone)),
    dismissed: context.dismissed.map(compactDismissed),
    timeZone,
  };
}

interface Located {
  ranked: RankedEvent | null;
  dismissed: { reason: string; example: DismissedExample } | null;
}

function locate(context: VoiceContext, id: string): Located {
  const ranked = context.ranked.find((event) => event.id === id) ?? null;
  if (ranked) return { ranked, dismissed: null };
  for (const group of context.dismissed) {
    const example = group.examples.find((item) => item.id === id);
    if (example) return { ranked: null, dismissed: { reason: group.reason, example } };
  }
  return { ranked: null, dismissed: null };
}

function altitudeAt(samples: TrackSample[], tca: string): number | null {
  const target = Date.parse(tca);
  let best: TrackSample | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const delta = Math.abs(Date.parse(sample.t) - target);
    if (delta < bestDelta) {
      best = sample;
      bestDelta = delta;
    }
  }
  return best ? best.geodetic.altKm : null;
}

async function encounterPayload(id: string, timeZone: string, options: VoiceToolOptions) {
  const root = options.root;
  const loaded = loadConjunctionSource(root);
  const found = findEventById(loaded.snapshot, id);
  if (!found) return { error: "Unknown encounter", id };

  const context = loadVoiceContext(found.oursNorad, options);
  const located = locate(context, id);
  const event = found.event;
  const oursIsFirst = event.object1.noradId === found.oursNorad;
  const ours = oursIsFirst ? event.object1 : event.object2;
  const other = oursIsFirst ? event.object2 : event.object1;

  const base = {
    id,
    focus: false,
    ours: ours.name,
    oursNorad: ours.noradId,
    other: other.name,
    otherNorad: other.noradId,
    opsStatus: other.opsStatus,
    missMeters: Math.round(event.rangeKm * 1000),
    relSpeedKms: event.relSpeedKms,
    maxProb: event.maxProb,
    tcaUtc: event.tca,
    tcaLocal: formatLocalTime(event.tca, timeZone),
    tier: located.ranked?.tier ?? null,
    score: located.ranked ? Math.round(located.ranked.score * 10) / 10 : null,
    stale: located.ranked?.flags.stale ?? false,
    dismissedReason: located.dismissed?.reason ?? null,
  };

  try {
    const [oursOmm, otherOmm] = await Promise.all([
      getOmm(found.oursNorad, { root, offline: options.offline }),
      getOmm(found.otherNorad, { root, offline: options.offline }),
    ]);
    if (!oursOmm.omm || !otherOmm.omm) {
      return {
        ...base,
        propagation: null,
        note: "Orbital elements are not available, so this is the screening miss distance only.",
      };
    }
    const propagation = propagateEncounter(oursOmm.omm, otherOmm.omm, event.tca);
    const fixture = oursOmm.source === "fixture" || otherOmm.source === "fixture";
    return {
      ...base,
      propagation: {
        altitudeKm: altitudeAt(propagation.ours, event.tca),
        computedMissKm: propagation.computedMinRangeKm,
        computedMissTimeLocal: formatLocalTime(propagation.computedMinRangeTime, timeZone),
      },
      note: fixture
        ? "Element sets are fixtures, so the computed miss will not match the screening miss. Cite the screening miss distance."
        : "Computed with satellite.js from OMM JSON. Cite the screening miss distance unless asked about the recompute.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Propagation failed";
    return { ...base, propagation: null, note: message };
  }
}

export async function runVoiceTool(
  name: string,
  rawArgs: unknown,
  options: VoiceToolOptions = {},
): Promise<unknown> {
  if (!isVoiceToolName(name)) {
    return { error: `Unknown tool: ${name}` };
  }
  const args = readArgs(rawArgs);
  const timeZone = readZone(args);

  try {
    if (name === "get_ranked_warnings") {
      return rankedPayload(loadVoiceContext(readNorad(args), options), timeZone);
    }
    if (name === "explain_dismissed") {
      const context = loadVoiceContext(readNorad(args), options);
      const payload = rankedPayload(context, timeZone);
      return {
        norad: payload.norad,
        satelliteName: payload.satelliteName,
        screened: payload.screened,
        dismissedCount: payload.dismissedCount,
        dismissed: payload.dismissed,
        timeZone,
      };
    }
    if (name === "get_encounter") {
      return encounterPayload(readId(args), timeZone, options);
    }
    const id = readId(args);
    const details = await encounterPayload(id, timeZone, options);
    if (details && typeof details === "object" && "error" in details) return details;
    return { ...details, focus: true, id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed";
    return { error: message };
  }
}
