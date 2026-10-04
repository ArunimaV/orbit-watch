import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { lookupConjunctions, lookupEmptyMessage, socratesLookupUrl } from "./lookup";

const SWISS = `
<html><title>SOCRATES Plus</title>
<table>
<tr><td>GP Data</td><td>35932</td><td>SWISSCUBE [+]</td><td>2.483</td>
<td rowspan="2">2026-10-05 01:26:28.592</td><td rowspan="2">0.621</td><td rowspan="2">13.881</td></tr>
<tr><td>50 km All</td><td>19831</td><td>SL-8 DEB [-]</td><td>2.170</td><td>5.614E-06</td><td>0.298</td></tr>
</table></html>
`;

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "orbit-lookup-"));
}

describe("lookupConjunctions", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("fetches http://celestrak.org once, then serves the cache", async () => {
    const cacheDir = tempDir();
    dirs.push(cacheDir);
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(SWISS, { status: 200 });
    }) as typeof fetch;
    const now = new Date("2026-10-04T04:00:00.000Z");
    const first = await lookupConjunctions(43017, { fetchImpl, now, cacheDir, offline: false, root: cacheDir });
    const second = await lookupConjunctions(43017, {
      fetchImpl,
      now: new Date(now.getTime() + 60_000),
      cacheDir,
      offline: false,
      root: cacheDir,
    });
    expect(first.ok && first.cached).toBe(false);
    expect(first.ok && first.events).toHaveLength(1);
    expect(second.ok && second.cached).toBe(true);
    expect(calls).toEqual([socratesLookupUrl(43017)]);
    expect(calls[0].startsWith("http://celestrak.org/")).toBe(true);
  });

  it("does not retry a non-200", async () => {
    const cacheDir = tempDir();
    dirs.push(cacheDir);
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("no", { status: 403 });
    }) as typeof fetch;
    const result = await lookupConjunctions(43017, { fetchImpl, cacheDir, offline: false, root: cacheDir });
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("stops when the request exceeds the timeout", async () => {
    const cacheDir = tempDir();
    dirs.push(cacheDir);
    const fetchImpl = (() => new Promise(() => undefined)) as typeof fetch;
    const result = await lookupConjunctions(69794, {
      fetchImpl,
      timeoutMs: 30,
      cacheDir,
      offline: false,
      root: cacheDir,
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("treats an empty SOCRATES page as no conjunctions and does not fetch again", async () => {
    const cacheDir = tempDir();
    dirs.push(cacheDir);
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("<html>SOCRATES Plus Search Results. 0 records found</html>", { status: 200 });
    }) as typeof fetch;
    const now = new Date("2026-10-04T04:00:00.000Z");
    const first = await lookupConjunctions(39161, { fetchImpl, now, cacheDir, offline: false, root: cacheDir });
    const second = await lookupConjunctions(39161, { fetchImpl, now, cacheDir, offline: false, root: cacheDir });
    expect(first).toEqual({ ok: false, message: lookupEmptyMessage(39161) });
    expect(second.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("does not call CelesTrak when offline and nothing is cached", async () => {
    const cacheDir = tempDir();
    dirs.push(cacheDir);
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(SWISS, { status: 200 });
    }) as typeof fetch;
    const result = await lookupConjunctions(43017, { fetchImpl, cacheDir, offline: true, root: cacheDir });
    expect(result.ok).toBe(false);
    expect(calls).toBe(0);
  });
});
