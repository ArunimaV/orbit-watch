import { describe, expect, it } from "vitest";
import {
  celestrakFetch,
  isFileMtimeNewer,
  isGpCacheFresh,
  shouldPollJsonDir,
} from "./celestrak";

describe("CelesTrak etiquette", () => {
  it("polls jsonDir at most once an hour", () => {
    const now = new Date("2026-10-03T22:00:00.000Z");
    expect(shouldPollJsonDir(null, now)).toBe(true);
    expect(shouldPollJsonDir(new Date("2026-10-03T21:30:00.000Z"), now)).toBe(false);
    expect(shouldPollJsonDir(new Date("2026-10-03T21:00:00.000Z"), now)).toBe(true);
  });

  it("downloads only when FILE_MTIME is newer", () => {
    expect(isFileMtimeNewer("2026-10-03 16:16:02 UTC", null)).toBe(true);
    expect(isFileMtimeNewer("2026-10-03 16:16:02 UTC", "2026-10-03 16:16:02 UTC")).toBe(false);
    expect(isFileMtimeNewer("2026-10-04 02:05:00 UTC", "2026-10-03 16:16:02 UTC")).toBe(true);
  });

  it("treats a GP cache as fresh for two hours", () => {
    const now = new Date("2026-10-03T22:00:00.000Z");
    expect(isGpCacheFresh("2026-10-03T21:00:00.000Z", now)).toBe(true);
    expect(isGpCacheFresh("2026-10-03T19:00:00.000Z", now)).toBe(false);
  });

  it("stops on the first non-200 and does not retry", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response("blocked", { status: 403 });
    };
    await expect(
      celestrakFetch("https://celestrak.org/SOCRATES/jsonDir.php", fetchImpl as typeof fetch),
    ).rejects.toThrow(/HTTP 403/);
    expect(calls).toBe(1);
  });

  it("stops on a redirect instead of following it", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(null, { status: 301, headers: { Location: "https://example.invalid/moved" } });
    };
    await expect(celestrakFetch("https://celestrak.org/SOCRATES/sort-minRange.csv", fetchImpl as typeof fetch)).rejects.toThrow(
      /HTTP 301/,
    );
    expect(calls).toBe(1);
  });
});
