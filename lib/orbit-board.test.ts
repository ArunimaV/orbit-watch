import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearOrbitTrackCache,
  contextOrbitRequests,
  dismissedOrbitRequests,
  loadOrbitTracks,
  threatOrbitColor,
} from "@/lib/orbit-board";

const sample = {
  t: "2026-10-05T01:26:28.592Z",
  geodetic: { lonDeg: 8, latDeg: 46, altKm: 700 },
};

function tracks() {
  return { ours: [sample, sample], other: [sample, { ...sample, geodetic: { lonDeg: 9, latDeg: 47, altKm: 710 } }] };
}

afterEach(() => {
  clearOrbitTrackCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("orbit board", () => {
  it("colors Act threats red and Watch threats amber", () => {
    expect(threatOrbitColor("Act")).toBe("#ff5d6c");
    expect(threatOrbitColor("Watch")).toBe("#ff9a3c");
    expect(threatOrbitColor("Info")).toBe("#3dbe7a");
  });

  it("asks for every kept threat except the selected pass", () => {
    const requests = contextOrbitRequests(
      [
        { id: "deb", tier: "Act" },
        { id: "rb", tier: "Watch" },
      ],
      "deb",
    );
    expect(requests).toEqual([{ id: "rb", role: "kept", color: "#ff9a3c" }]);
  });

  it("skips orbits whose elements are missing and still returns the rest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("missing")) {
          return { ok: false, json: async () => ({ error: "Orbital elements are not available for this pair" }) };
        }
        return { ok: true, json: async () => ({ tracks: tracks() }) };
      }),
    );
    const loaded = await loadOrbitTracks(
      [
        { id: "missing", role: "dismissed", color: "#8aa3b2" },
        { id: "kept", role: "kept", color: "#ff5d6c" },
      ],
      new AbortController().signal,
    );
    expect(loaded.map((orbit) => orbit.id)).toEqual(["kept"]);
  });

  it("dedupes dismissed ids and does not refetch a cached miss", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const requests = dismissedOrbitRequests(["a", "a", ""]);
    expect(requests).toEqual([{ id: "a", role: "dismissed", color: "#8aa3b2" }]);
    await loadOrbitTracks(requests, new AbortController().signal);
    await loadOrbitTracks(requests, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
