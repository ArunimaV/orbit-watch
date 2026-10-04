import fs from "fs";
import os from "os";
import path from "path";
import { CELESTRAK_USER_AGENT, CelestrakStatusError } from "./celestrak";
import { buildSnapshot, findEventById } from "./socrates";
import { parseSocratesTable, socratesPageRecognized } from "./socrates-table";
import type { ConjunctionEvent } from "./types";

/** One request. SOCRATES search pages answer on plain HTTP when HTTPS stalls. */
export const LOOKUP_TIMEOUT_MS = 8_000;

/** SOCRATES itself updates about every 10–11 hours. */
export const LOOKUP_MAX_AGE_MS = 10 * 60 * 60 * 1000;

export function socratesLookupUrl(norad: number): string {
  return `http://celestrak.org/SOCRATES/table-socrates.php?CATNR=${norad}&ORDER=MINRANGE&MAX=25`;
}

export interface LookupHit {
  ok: true;
  events: ConjunctionEvent[];
  cached: boolean;
  fetchedAt: string;
}

export interface LookupMiss {
  ok: false;
  message: string;
}

export type LookupResult = LookupHit | LookupMiss;

interface LookupFile {
  norad: number;
  fetchedAt: string;
  events: ConjunctionEvent[];
}

export interface LookupOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
  offline?: boolean;
  root?: string;
  cacheDir?: string;
}

const memory = new Map<string, LookupFile>();

export function lookupUnavailableMessage(): string {
  return "Couldn't load close approaches for that CubeSat. The list on screen is unchanged.";
}

export function lookupEmptyMessage(norad: number): string {
  return `CelesTrak lists no close approaches for NORAD ${norad}. The list on screen is unchanged.`;
}

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

export function lookupCacheDir(root = process.cwd()): string {
  const preferred = path.join(root, "data", "lookup");
  if (canWriteDir(preferred)) return preferred;
  const tmp = path.join(os.tmpdir(), "orbit-watch-lookup");
  if (canWriteDir(tmp)) return tmp;
  return preferred;
}

function cacheKey(norad: number): string {
  return String(norad);
}

function readFileCache(dir: string, norad: number): LookupFile | null {
  const filePath = path.join(dir, `${norad}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<LookupFile>;
    if (!parsed || !Array.isArray(parsed.events) || typeof parsed.fetchedAt !== "string") return null;
    return { norad, fetchedAt: parsed.fetchedAt, events: parsed.events };
  } catch {
    return null;
  }
}

export function readLookupCache(norad: number, root = process.cwd(), cacheDir?: string): LookupFile | null {
  const remembered = memory.get(`${root}:${cacheKey(norad)}`);
  if (remembered) return remembered;
  const dir = cacheDir ?? lookupCacheDir(root);
  const fromDisk = readFileCache(dir, norad);
  if (fromDisk) memory.set(`${root}:${cacheKey(norad)}`, fromDisk);
  return fromDisk;
}

function writeLookupCache(norad: number, file: LookupFile, root: string, cacheDir?: string) {
  memory.set(`${root}:${cacheKey(norad)}`, file);
  const dir = cacheDir ?? lookupCacheDir(root);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${norad}.json`);
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(file));
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "cache write failed";
    console.error("[orbit-watch] lookup cache write failed:", norad, message);
  }
}

function isFresh(file: LookupFile, now: Date): boolean {
  const fetched = Date.parse(file.fetchedAt);
  if (Number.isNaN(fetched)) return false;
  return now.getTime() - fetched < LOOKUP_MAX_AGE_MS;
}

async function fetchOnce(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException("The SOCRATES lookup timed out", "AbortError"));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      fetchImpl(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": CELESTRAK_USER_AGENT,
          Accept: "text/html, */*",
        },
      }),
      timeout,
    ]);
    if (response.status !== 200) {
      throw new CelestrakStatusError(response.status, url);
    }
    return await response.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Close approaches for one catalog number.
 * A fresh cache is not refetched. The network is a single HTTP GET with an
 * 8 second timeout. A non-200, including a redirect, is not retried.
 */
export async function lookupConjunctions(norad: number, options: LookupOptions = {}): Promise<LookupResult> {
  if (!Number.isInteger(norad) || norad <= 0) {
    return { ok: false, message: "Enter a numeric NORAD ID." };
  }

  const now = options.now ?? new Date();
  const root = options.root ?? process.cwd();
  const offline = options.offline ?? process.env.ORBIT_WATCH_OFFLINE === "1";
  const cached = readLookupCache(norad, root, options.cacheDir);
  if (cached && (offline || isFresh(cached, now))) {
    if (cached.events.length === 0) return { ok: false, message: lookupEmptyMessage(norad) };
    return { ok: true, events: cached.events, cached: true, fetchedAt: cached.fetchedAt };
  }
  if (offline) {
    return { ok: false, message: lookupUnavailableMessage() };
  }

  const url = socratesLookupUrl(norad);
  let html: string;
  try {
    html = await fetchOnce(url, options.fetchImpl ?? fetch, options.timeoutMs ?? LOOKUP_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof CelestrakStatusError) {
      console.error(`[orbit-watch] ${error.message}`);
    } else {
      const message = error instanceof Error ? error.message : "lookup failed";
      console.error(`[orbit-watch] SOCRATES lookup failed for NORAD ${norad}: ${message}`);
    }
    return { ok: false, message: lookupUnavailableMessage() };
  }

  if (!socratesPageRecognized(html)) {
    return { ok: false, message: lookupUnavailableMessage() };
  }

  const events = parseSocratesTable(html);
  const file: LookupFile = { norad, fetchedAt: now.toISOString(), events };
  writeLookupCache(norad, file, root, options.cacheDir);
  if (events.length === 0) return { ok: false, message: lookupEmptyMessage(norad) };
  return { ok: true, events, cached: false, fetchedAt: file.fetchedAt };
}

export function findLookupEvent(id: string, root = process.cwd(), cacheDir?: string) {
  const dir = cacheDir ?? lookupCacheDir(root);
  const norads = new Set<number>();
  for (const key of memory.keys()) {
    if (!key.startsWith(`${root}:`)) continue;
    const norad = Number(key.slice(root.length + 1));
    if (Number.isInteger(norad) && norad > 0) norads.add(norad);
  }
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      const match = /^(\d+)\.json$/.exec(name);
      if (match) norads.add(Number(match[1]));
    }
  }
  for (const norad of norads) {
    const cached = readLookupCache(norad, root, dir);
    if (!cached || cached.events.length === 0) continue;
    const snapshot = buildSnapshot(cached.events, {
      source: "celestrak",
      fileName: `${norad}.json`,
      fileMtime: cached.fetchedAt,
      ingestedAt: cached.fetchedAt,
    });
    const found = findEventById(snapshot, id);
    if (found) return found;
  }
  return null;
}
