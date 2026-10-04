import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getOmm } from "./gp";

const temps: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-watch-gp-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("getOmm", () => {
  it("does not call the network when a fixture is served offline", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    };
    const result = await getOmm(35932, {
      offline: true,
      fetchImpl: fetchImpl as typeof fetch,
      cacheDir: tempDir(),
      fixtureDir: path.join(process.cwd(), "data/fixtures/gp"),
    });
    expect(calls).toBe(0);
    expect(result.source).toBe("fixture");
    expect(result.omm?.NORAD_CAT_ID).toBe(35932);
    expect(result.omm?.OBJECT_NAME).toBe("SWISSCUBE");
    expect(result.omm?.EPOCH).toBe("2026-10-03T04:38:12.718464");
    expect(String(result.omm?.COMMENT ?? "")).not.toMatch(/SYNTHETIC/);
  });

  it("stops on a non-200, keeps the fixture, and does not retry inside the 2-hour window", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response("forbidden", { status: 403 });
    };
    const cacheDir = tempDir();
    const options = {
      fetchImpl: fetchImpl as typeof fetch,
      cacheDir,
      fixtureDir: path.join(process.cwd(), "data/fixtures/gp"),
      now: new Date("2026-10-03T22:00:00.000Z"),
      offline: false,
    };
    const first = await getOmm(19831, options);
    const second = await getOmm(19831, options);
    expect(calls).toBe(1);
    expect(first.source).toBe("fixture");
    expect(first.omm?.OBJECT_NAME).toBe("SL-8 DEB");
    expect(first.warning).toMatch(/403/);
    expect(second.source).toBe("fixture");
    expect(second.warning).toMatch(/403/);
  });
});
