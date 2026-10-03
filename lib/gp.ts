import fs from "fs";
import path from "path";
import type { OMMJsonObject } from "satellite.js";
import { celestrakFetch, gpUrl, isGpCacheFresh } from "./celestrak";

export type OmmRecord = OMMJsonObject;

export interface GpResult {
  catnr: number;
  omm: OmmRecord | null;
  source: "cache" | "celestrak" | "fixture" | "unavailable";
  warning?: string;
}

interface GpCacheFile {
  catnr: number;
  fetchedAt: string;
  source: "celestrak" | "fixture";
  httpStatus?: number;
  warning?: string;
  omm: OmmRecord | null;
}

export interface GetOmmOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
  offline?: boolean;
  cacheDir?: string;
  fixtureDir?: string;
  root?: string;
}

function isOmm(value: unknown): value is OmmRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return "EPOCH" in record && "MEAN_MOTION" in record && "NORAD_CAT_ID" in record;
}

function readJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

export function readOmmDocument(filePath: string): GpCacheFile | null {
  const parsed = readJson(filePath);
  if (!parsed || typeof parsed !== "object") return null;
  if (isOmm(parsed)) {
    const stat = fs.statSync(filePath);
    return {
      catnr: Number(parsed.NORAD_CAT_ID),
      fetchedAt: stat.mtime.toISOString(),
      source: "fixture",
      omm: parsed,
    };
  }
  const wrapper = parsed as Partial<GpCacheFile>;
  if (!wrapper.fetchedAt || !("omm" in wrapper)) return null;
  return {
    catnr: Number(wrapper.catnr),
    fetchedAt: wrapper.fetchedAt,
    source: wrapper.source === "fixture" ? "fixture" : "celestrak",
    httpStatus: wrapper.httpStatus,
    warning: wrapper.warning,
    omm: wrapper.omm && isOmm(wrapper.omm) ? wrapper.omm : null,
  };
}

function writeCache(filePath: string, cache: GpCacheFile) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(cache, null, 2));
  fs.renameSync(tempPath, filePath);
}

/**
 * Fetch one OMM, or return the on-disk copy.
 * A cache younger than 2 hours is not refetched.
 * Any non-200 or network error is logged, not retried, and the cached or
 * fixture OMM is returned instead.
 */
export async function getOmm(catnr: number, options: GetOmmOptions = {}): Promise<GpResult> {
  if (!Number.isInteger(catnr) || catnr <= 0) {
    throw new Error(`CATNR must be a positive integer, got ${catnr}`);
  }

  const root = options.root ?? process.cwd();
  const cacheDir = options.cacheDir ?? path.join(root, "data/gp");
  const fixtureDir = options.fixtureDir ?? path.join(root, "data/fixtures/gp");
  const now = options.now ?? new Date();
  const offline = options.offline ?? process.env.ORBIT_WATCH_OFFLINE === "1";
  const cachePath = path.join(cacheDir, `${catnr}.json`);
  const fixturePath = path.join(fixtureDir, `${catnr}.json`);
  const cache = readOmmDocument(cachePath);
  const fixture = readOmmDocument(fixturePath)?.omm ?? null;

  if (cache && isGpCacheFresh(cache.fetchedAt, now)) {
    if (cache.omm) {
      return { catnr, omm: cache.omm, source: "cache", warning: cache.warning };
    }
    return {
      catnr,
      omm: fixture,
      source: fixture ? "fixture" : "unavailable",
      warning: cache.warning,
    };
  }

  if (offline) {
    const omm = cache?.omm ?? fixture;
    return {
      catnr,
      omm,
      source: cache?.omm ? "cache" : omm ? "fixture" : "unavailable",
      warning: omm ? undefined : `No OMM fixture for NORAD ${catnr}`,
    };
  }

  try {
    const response = await celestrakFetch(gpUrl(catnr), options.fetchImpl ?? fetch);
    const body: unknown = await response.json();
    const record = Array.isArray(body) ? body[0] : body;
    if (!isOmm(record)) {
      const warning = `GP response for NORAD ${catnr} did not include an OMM record. Not retrying.`;
      console.warn(warning);
      writeCache(cachePath, {
        catnr,
        fetchedAt: now.toISOString(),
        source: "celestrak",
        httpStatus: 200,
        warning,
        omm: cache?.omm ?? null,
      });
      const omm = cache?.omm ?? fixture;
      return { catnr, omm, source: cache?.omm ? "cache" : omm ? "fixture" : "unavailable", warning };
    }
    writeCache(cachePath, {
      catnr,
      fetchedAt: now.toISOString(),
      source: "celestrak",
      httpStatus: 200,
      omm: record,
    });
    return { catnr, omm: record, source: "celestrak" };
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    console.warn(warning);
    const status = error instanceof Error && "status" in error ? Number(error.status) : 0;
    writeCache(cachePath, {
      catnr,
      fetchedAt: now.toISOString(),
      source: "celestrak",
      httpStatus: Number.isFinite(status) ? status : 0,
      warning,
      omm: cache?.omm ?? null,
    });
    const omm = cache?.omm ?? fixture;
    return {
      catnr,
      omm,
      source: cache?.omm ? "cache" : omm ? "fixture" : "unavailable",
      warning,
    };
  }
}
