import fs from "fs";
import os from "os";
import path from "path";
import { DEMO_ENCOUNTER_NORAD, DEMO_NORAD } from "./constants";
import { findLookupEvent } from "./lookup";
import { findEventById, loadConjunctionSource, makeEventId } from "./socrates";
import { readXaiApiKey, requestImage } from "./xai";
import { MISSING_KEY_MESSAGE } from "./xai-config";

export const COMMITTED_RENDER_FILE = "swisscube-sl8deb.jpg";
export const COMMITTED_RENDER_URL = `/renders/${COMMITTED_RENDER_FILE}`;
export const DEMO_ENCOUNTER_TCA = "2026-10-05T01:26:28.592Z";
export const DEMO_ENCOUNTER_ID = makeEventId(DEMO_NORAD, DEMO_ENCOUNTER_NORAD, DEMO_ENCOUNTER_TCA);

export type RenderSource = "committed" | "cache" | "generated" | "fallback";

export interface RenderResult {
  url: string;
  source: RenderSource;
  cached: boolean;
  mock: boolean;
  message?: string;
  id: string;
}

const inflight = new Map<string, Promise<RenderResult>>();
const memoryRenders = new Map<string, Buffer>();

export function readMemoryRender(id: string): Buffer | null {
  return memoryRenders.get(id) ?? null;
}

export function sanitizeEncounterId(id: string): string | null {
  const trimmed = id.trim();
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(trimmed)) return null;
  return trimmed;
}

export const RENDER_TMP_DIR = path.join(os.tmpdir(), "orbit-watch-renders");

function canWriteDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/** Writable public/renders when the disk allows it; otherwise /tmp, served by /api/renders. */
export function chooseRenderCache(root: string): { dir: string | null; url: (id: string) => string } {
  const pub = path.join(root, "public", "renders");
  if (canWriteDir(pub)) return { dir: pub, url: (id) => `/renders/${id}.jpg` };
  if (canWriteDir(RENDER_TMP_DIR)) return { dir: RENDER_TMP_DIR, url: (id) => `/api/renders/${id}` };
  return { dir: null, url: (id) => `/api/renders/${id}` };
}

function persistGenerated(id: string, bytes: Uint8Array, root: string): string {
  const cache = chooseRenderCache(root);
  if (cache.dir) {
    const cachedPath = path.join(cache.dir, `${id}.jpg`);
    const tempPath = `${cachedPath}.tmp`;
    try {
      fs.mkdirSync(cache.dir, { recursive: true });
      fs.writeFileSync(tempPath, bytes);
      fs.renameSync(tempPath, cachedPath);
      return cache.url(id);
    } catch (error) {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // The temp file may already be gone.
      }
      const message = error instanceof Error ? error.message : "cache write failed";
      console.error("[orbit-watch] render cache write failed; keeping the image in memory:", id, message);
    }
  } else {
    console.error("[orbit-watch] render cache is not writable; keeping the image in memory:", id);
  }
  memoryRenders.set(id, Buffer.from(bytes));
  return `/api/renders/${id}`;
}

function findCachedRender(id: string, root: string): { url: string } | null {
  const pub = path.join(root, "public", "renders", `${id}.jpg`);
  if (fs.existsSync(pub)) return { url: `/renders/${id}.jpg` };
  const tmp = path.join(RENDER_TMP_DIR, `${id}.jpg`);
  if (fs.existsSync(tmp)) return { url: `/api/renders/${id}` };
  if (memoryRenders.has(id)) return { url: `/api/renders/${id}` };
  return null;
}

const PHOTO_STYLE =
  "Photograph taken by an astronaut aboard the ISS: sunlit 1U CubeSat with a gold frame and black cells in the foreground, a torn scorched rocket stage behind, daylight Earth with clouds, black sky. No logos, no glow effects, no text.";

const GENERIC_IMAGINE_PROMPT = `${PHOTO_STYLE} The CubeSat is SwissCube and the stage is an SL-8 rocket debris fragment passing head-on.`;

export function imaginePromptFor(id: string, root = process.cwd()): string {
  let found: ReturnType<typeof findEventById> = null;
  try {
    found = findEventById(loadConjunctionSource(root).snapshot, id) ?? findLookupEvent(id, root);
  } catch {
    found = null;
  }
  if (!found) {
    return GENERIC_IMAGINE_PROMPT;
  }
  const oursIsFirst = found.event.object1.noradId === found.oursNorad;
  const ours = oursIsFirst ? found.event.object1 : found.event.object2;
  const other = oursIsFirst ? found.event.object2 : found.event.object1;
  const meters = Math.round(found.event.rangeKm * 1000);
  const stage =
    other.opsStatus === "-"
      ? `a torn scorched rocket stage (${other.name}) behind`
      : `${other.name} behind`;
  return `Photograph taken by an astronaut aboard the ISS: sunlit 1U CubeSat (${ours.name}) with a gold frame and black cells in the foreground, ${stage}, passing head-on. Daylight Earth with clouds, black sky. No logos, no glow effects, no text. Screening miss distance about ${meters} meters, relative speed ${found.event.relSpeedKms.toFixed(1)} km/s.`;
}

function committedResult(id: string, source: RenderSource, message?: string, mock = false): RenderResult {
  return {
    url: COMMITTED_RENDER_URL,
    source,
    cached: true,
    mock,
    message,
    id,
  };
}

export async function resolveEncounterRender(
  rawId: string,
  options: {
    root?: string;
    apiKey?: string | null;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<RenderResult> {
  const id = sanitizeEncounterId(rawId);
  if (!id) {
    return committedResult(
      rawId,
      "fallback",
      "That encounter id cannot be cached. Showing the committed SwissCube and SL-8 debris render.",
      true,
    );
  }

  const existing = inflight.get(id);
  if (existing) return existing;

  const pending = resolveUncached(id, options).finally(() => {
    inflight.delete(id);
  });
  inflight.set(id, pending);
  return pending;
}

async function resolveUncached(
  id: string,
  options: { root?: string; apiKey?: string | null; fetchImpl?: typeof fetch },
): Promise<RenderResult> {
  const root = options.root ?? process.cwd();
  const cached = findCachedRender(id, root);
  if (cached) {
    return { url: cached.url, source: "cache", cached: true, mock: false, id };
  }

  if (id === DEMO_ENCOUNTER_ID) {
    return committedResult(
      id,
      "committed",
      "Pre-generated grok-imagine-image-quality render of SwissCube and the SL-8 debris fragment.",
    );
  }

  const apiKey = options.apiKey === undefined ? readXaiApiKey() : options.apiKey;
  if (!apiKey) {
    return committedResult(id, "fallback", MISSING_KEY_MESSAGE, true);
  }

  const generated = await requestImage(imaginePromptFor(id, root), {
    apiKey,
    fetchImpl: options.fetchImpl,
  });
  if (!generated.ok) {
    if (generated.message !== MISSING_KEY_MESSAGE) {
      console.error("[orbit-watch] imagine failed:", generated.message);
    }
    return committedResult(id, "fallback", `${generated.message} Showing the committed SwissCube and SL-8 debris render.`);
  }

  const url = persistGenerated(id, generated.image.bytes, root);
  return { url, source: "generated", cached: false, mock: false, id };
}
