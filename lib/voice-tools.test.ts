import fs from "fs";
import { describe, expect, it } from "vitest";
import { DEMO_ENCOUNTER_ID } from "./imagine";
import { VOICE_PROMPT_TEMPLATE } from "./voice-prompt";
import { runVoiceTool } from "./voice-tools";

const OPTIONS = { now: new Date("2026-10-03T12:00:00.000Z"), offline: true, horizonHours: 168 };

describe("voice tool handlers", () => {
  it("ranks SwissCube, dismisses the co-orbiting false alarm, and focuses the SL-8 pass", async () => {
    const ranked = (await runVoiceTool(
      "get_ranked_warnings",
      { norad: 35932, timeZone: "UTC" },
      OPTIONS,
    )) as {
      satelliteName: string;
      ranked: { id: string; other: string; tier: string; missMeters: number; relSpeedKms: number; tcaLocal: string }[];
      dismissed: { reason: string; examples: { other: string }[] }[];
    };

    expect(ranked.satelliteName).toBe("SwissCube");
    expect(ranked.ranked[0]?.other).toBe("SL-8 DEB");
    expect(ranked.ranked[0]?.tier).toBe("Act");
    expect(ranked.ranked[0]?.missMeters).toBe(621);
    expect(ranked.ranked[0]?.relSpeedKms).toBe(13.881);
    expect(ranked.ranked[0]?.tcaLocal).toMatch(/UTC/);
    expect(ranked.ranked[0]?.id).toBe(DEMO_ENCOUNTER_ID);
    expect(ranked.dismissed.some((group) => /co-orbiting/i.test(group.reason))).toBe(true);
    expect(ranked.ranked.some((event) => event.other === "BEESAT-1")).toBe(false);

    const dismissed = (await runVoiceTool("explain_dismissed", { norad: "35932", timeZone: "UTC" }, OPTIONS)) as {
      dismissedCount: number;
      dismissed: { reason: string; examples: { other: string }[] }[];
    };
    expect(dismissed.dismissedCount).toBeGreaterThan(0);
    const coOrbiting = dismissed.dismissed.find((group) => /co-orbiting/i.test(group.reason));
    expect(coOrbiting?.examples.some((example) => example.other === "BEESAT-1")).toBe(true);

    const id = ranked.ranked[0]?.id ?? "";
    const focused = (await runVoiceTool("focus_encounter", { id, timeZone: "UTC" }, OPTIONS)) as {
      focus?: boolean;
      id?: string;
      missMeters?: number;
    };
    expect(focused.focus).toBe(true);
    expect(focused.id).toBe(id);
    expect(focused.missMeters).toBe(621);

    const encounter = (await runVoiceTool("get_encounter", { id, timeZone: "UTC" }, OPTIONS)) as {
      other: string;
      missMeters: number;
      propagation: { altitudeKm: number; computedMissKm: number } | null;
    };
    expect(encounter.other).toBe("SL-8 DEB");
    expect(encounter.missMeters).toBe(621);
    expect(encounter.propagation?.altitudeKm).toEqual(expect.any(Number));
  });

  it("returns an error for an unknown tool or a bad norad without throwing", async () => {
    await expect(runVoiceTool("render_encounter", {}, OPTIONS)).resolves.toMatchObject({
      error: expect.stringMatching(/Unknown tool/),
    });
    await expect(runVoiceTool("get_ranked_warnings", { norad: 0 }, OPTIONS)).resolves.toMatchObject({
      error: expect.stringMatching(/norad/),
    });
  });
});

describe("voice prompt", () => {
  it("matches prompts/voice.md and names the numbers the controller must cite", () => {
    const file = fs.readFileSync("prompts/voice.md", "utf8").trim();
    expect(file).toBe(VOICE_PROMPT_TEMPLATE.trim());
    expect(file).toMatch(/miss distance/i);
    expect(file).toMatch(/relative speed/i);
    expect(file).toMatch(/local time/i);
    expect(file).toMatch(/dismissed/i);
    expect(file).toMatch(/false alarms/i);
  });
});
