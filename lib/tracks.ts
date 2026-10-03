import type { TrackSample } from "./encounter";

/** Index of the sample closest to an instant. Used to park the scrubber on TCA. */
export function nearestSampleIndex(samples: { t: string }[], targetIso: string): number {
  const target = Date.parse(targetIso);
  if (!Number.isFinite(target) || samples.length === 0) return 0;
  let best = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let index = 0; index < samples.length; index += 1) {
    const gap = Math.abs(Date.parse(samples[index].t) - target);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  }
  return best;
}

export function eciDistanceKm(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

/** Largest step between consecutive ECI samples, in kilometres. */
export function maxStepKm(samples: TrackSample[]): number {
  let max = 0;
  for (let index = 1; index < samples.length; index += 1) {
    max = Math.max(max, eciDistanceKm(samples[index - 1].eci, samples[index].eci));
  }
  return max;
}
