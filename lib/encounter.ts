import {
  eciToEcf,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  radiansToDegrees,
  type OMMJsonObject,
  type SatRec,
} from "satellite.js";

const WINDOW_MS = 15 * 60 * 1000;
const STEP_MS = 10 * 1000;

export interface TrackSample {
  t: string;
  eci: { x: number; y: number; z: number };
  ecf: { x: number; y: number; z: number };
  geodetic: { latDeg: number; lonDeg: number; altKm: number };
}

export interface EncounterPropagation {
  stepSeconds: number;
  windowMinutes: number;
  ours: TrackSample[];
  other: TrackSample[];
  computedMinRangeKm: number;
  computedMinRangeTime: string;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sampleAt(satrec: SatRec, date: Date): { sample: TrackSample; position: { x: number; y: number; z: number } } | null {
  const propagated = propagate(satrec, date);
  if (!propagated?.position) return null;
  const gmst = gstime(date);
  const ecf = eciToEcf(propagated.position, gmst);
  const geodetic = eciToGeodetic(propagated.position, gmst);
  const position = propagated.position;
  return {
    position,
    sample: {
      t: date.toISOString(),
      eci: {
        x: round(position.x, 3),
        y: round(position.y, 3),
        z: round(position.z, 3),
      },
      ecf: {
        x: round(ecf.x, 3),
        y: round(ecf.y, 3),
        z: round(ecf.z, 3),
      },
      geodetic: {
        latDeg: round(radiansToDegrees(geodetic.latitude), 5),
        lonDeg: round(radiansToDegrees(geodetic.longitude), 5),
        altKm: round(geodetic.height, 3),
      },
    },
  };
}

/**
 * Propagate both objects from TCA−15 min to TCA+15 min every 10 seconds.
 * Positions go ECI → ECF → geodetic. The minimum separation is our own
 * figure, computed so it can be compared with the SOCRATES range.
 */
export function propagateEncounter(
  ommOurs: OMMJsonObject,
  ommOther: OMMJsonObject,
  tcaIso: string,
): EncounterPropagation {
  const tcaMs = Date.parse(tcaIso);
  if (Number.isNaN(tcaMs)) {
    throw new Error(`Bad TCA: ${tcaIso}`);
  }

  const oursRec = json2satrec(ommOurs);
  const otherRec = json2satrec(ommOther);
  const ours: TrackSample[] = [];
  const other: TrackSample[] = [];
  let computedMinRangeKm = Number.POSITIVE_INFINITY;
  let computedMinRangeTime = new Date(tcaMs).toISOString();

  for (let time = tcaMs - WINDOW_MS; time <= tcaMs + WINDOW_MS; time += STEP_MS) {
    const date = new Date(time);
    const oursStep = sampleAt(oursRec, date);
    const otherStep = sampleAt(otherRec, date);
    if (!oursStep || !otherStep) continue;
    ours.push(oursStep.sample);
    other.push(otherStep.sample);
    const dx = oursStep.position.x - otherStep.position.x;
    const dy = oursStep.position.y - otherStep.position.y;
    const dz = oursStep.position.z - otherStep.position.z;
    const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (range < computedMinRangeKm) {
      computedMinRangeKm = range;
      computedMinRangeTime = date.toISOString();
    }
  }

  if (ours.length === 0 || !Number.isFinite(computedMinRangeKm)) {
    throw new Error("satellite.js could not propagate this pair across the TCA window");
  }

  return {
    stepSeconds: STEP_MS / 1000,
    windowMinutes: WINDOW_MS / 60_000,
    ours,
    other,
    computedMinRangeKm: round(computedMinRangeKm, 3),
    computedMinRangeTime,
  };
}
