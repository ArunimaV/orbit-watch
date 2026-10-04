import type { TrackSample } from "@/lib/encounter";
import type { RankedEvent, Tier } from "@/lib/types";

export const OURS_ORBIT_COLOR = "#79d6cb";
export const DISMISSED_ORBIT_COLOR = "#8aa3b2";
export const OURS_ORBIT_WIDTH = 4.5;
export const THREAT_ORBIT_WIDTH = 2.25;
export const DISMISSED_ORBIT_WIDTH = 1.5;
export const DISMISSED_ORBIT_ALPHA = 0.55;
export const ORBIT_FETCH_CONCURRENCY = 4;

const ACT_COLOR = "#ff5d6c";
const WATCH_COLOR = "#ff9a3c";
const INFO_COLOR = "#3dbe7a";

export interface GlobeBoard {
  satelliteName: string;
  ranked: RankedEvent[];
  dismissedIds: string[];
}

export interface OrbitRequest {
  id: string;
  role: "kept" | "dismissed";
  color: string;
}

export interface LoadedOrbit extends OrbitRequest {
  ours: TrackSample[];
  other: TrackSample[];
}

const trackCache = new Map<string, { ours: TrackSample[]; other: TrackSample[] } | null>();

export function threatOrbitColor(tier: Tier): string {
  if (tier === "Act") return ACT_COLOR;
  if (tier === "Watch") return WATCH_COLOR;
  return INFO_COLOR;
}

/** Kept threats other than the one currently selected. The selected pair is drawn by the encounter scene. */
export function contextOrbitRequests(
  ranked: { id: string; tier: Tier }[],
  selectedId: string | null,
): OrbitRequest[] {
  return ranked
    .filter((event) => event.id !== selectedId)
    .map((event) => ({ id: event.id, role: "kept" as const, color: threatOrbitColor(event.tier) }));
}

export function dismissedOrbitRequests(ids: string[]): OrbitRequest[] {
  const seen = new Set<string>();
  const requests: OrbitRequest[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    requests.push({ id, role: "dismissed", color: DISMISSED_ORBIT_COLOR });
  }
  return requests;
}

export function clearOrbitTrackCache(): void {
  trackCache.clear();
}

export function rememberOrbitTracks(
  id: string,
  tracks: { ours: TrackSample[]; other: TrackSample[] } | null,
): void {
  trackCache.set(id, tracks && validTracks(tracks.ours, tracks.other) ? tracks : null);
}

function validTracks(ours: unknown, other: unknown): ours is TrackSample[] {
  return sampleList(ours) && sampleList(other);
}

function sampleList(value: unknown): value is TrackSample[] {
  if (!Array.isArray(value) || value.length < 2) return false;
  const first = value[0] as { geodetic?: { lonDeg?: unknown; latDeg?: unknown; altKm?: unknown } } | null;
  const geo = first?.geodetic;
  return !!geo && typeof geo.lonDeg === "number" && typeof geo.latDeg === "number" && typeof geo.altKm === "number";
}

function parseTracks(body: unknown): { ours: TrackSample[]; other: TrackSample[] } | null {
  if (!body || typeof body !== "object") return null;
  const tracks = (body as { tracks?: { ours?: unknown; other?: unknown } }).tracks;
  if (!tracks || !sampleList(tracks.ours) || !sampleList(tracks.other)) return null;
  return { ours: tracks.ours, other: tracks.other };
}

async function loadOne(
  id: string,
  signal: AbortSignal,
): Promise<{ ours: TrackSample[]; other: TrackSample[] } | null> {
  if (trackCache.has(id)) return trackCache.get(id) ?? null;
  try {
    const response = await fetch(`/api/encounter/${encodeURIComponent(id)}`, { signal });
    if (signal.aborted) return null;
    if (!response.ok) {
      trackCache.set(id, null);
      return null;
    }
    const tracks = parseTracks(await response.json());
    trackCache.set(id, tracks);
    return tracks;
  } catch {
    return null;
  }
}

export async function loadOrbitTracks(
  requests: OrbitRequest[],
  signal: AbortSignal,
  concurrency = ORBIT_FETCH_CONCURRENCY,
): Promise<LoadedOrbit[]> {
  const loaded: LoadedOrbit[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < requests.length && !signal.aborted) {
      const request = requests[cursor];
      cursor += 1;
      const tracks = await loadOne(request.id, signal);
      if (tracks) loaded.push({ ...request, ...tracks });
    }
  };
  const workers = Math.min(Math.max(concurrency, 1), Math.max(requests.length, 1));
  await Promise.all(Array.from({ length: requests.length === 0 ? 0 : workers }, () => worker()));
  return loaded;
}
