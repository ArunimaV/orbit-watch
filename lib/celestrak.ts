export const CELESTRAK_USER_AGENT =
  "OrbitWatch/0.1 (university CubeSat research demo; caches responses; not operational)";

export const JSON_DIR_URL = "https://celestrak.org/SOCRATES/jsonDir.php";
export const SOCRATES_BASE_URL = "https://celestrak.org/SOCRATES/";

export function gpUrl(catnr: number): string {
  return `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=JSON`;
}

/** Usage policy: poll jsonDir.php no more than once an hour. */
export const JSON_DIR_MIN_INTERVAL_MS = 60 * 60 * 1000;

/** GP data updates about every 2 hours. Do not refetch a fresh cache. */
export const GP_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export class CelestrakStatusError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    super(`CelesTrak returned HTTP ${status} for ${url}. Stopping with no retries.`);
    this.name = "CelestrakStatusError";
    this.status = status;
    this.url = url;
  }
}

export function shouldPollJsonDir(lastCheckedAt: Date | null, now: Date): boolean {
  if (!lastCheckedAt || Number.isNaN(lastCheckedAt.getTime())) return true;
  return now.getTime() - lastCheckedAt.getTime() >= JSON_DIR_MIN_INTERVAL_MS;
}

/** FILE_MTIME looks like "2026-10-03 16:16:02 UTC". */
export function parseCelestrakMtime(value: string): Date {
  const cleaned = value.trim().replace(/ UTC$/i, "Z").replace(" ", "T");
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unrecognized CelesTrak FILE_MTIME: ${value}`);
  }
  return parsed;
}

export function isFileMtimeNewer(remoteMtime: string, localMtime: string | null): boolean {
  if (!localMtime) return true;
  return parseCelestrakMtime(remoteMtime).getTime() > parseCelestrakMtime(localMtime).getTime();
}

export function isGpCacheFresh(fetchedAtIso: string, now: Date): boolean {
  const fetched = new Date(fetchedAtIso);
  if (Number.isNaN(fetched.getTime())) return false;
  return now.getTime() - fetched.getTime() < GP_MAX_AGE_MS;
}

/**
 * One request. Redirects are not followed: a 301/302/303/307/308 is a non-200
 * and stops the caller. There is no retry loop.
 */
export async function celestrakFetch(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": CELESTRAK_USER_AGENT,
        Accept: "application/json, text/csv, text/plain, */*",
      },
    });
    if (response.status !== 200) {
      throw new CelestrakStatusError(response.status, url);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}
