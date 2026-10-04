import { describe, expect, it, vi } from "vitest";
import { createBriefing } from "./briefing";
import { RESPONSES_URL } from "./xai-config";

const OPTIONS = { now: new Date("2026-10-03T12:00:00.000Z"), offline: true, horizonHours: 168 };

describe("createBriefing", () => {
  it("writes a local briefing from the ranker when the key is missing", async () => {
    const fetchImpl = vi.fn();
    const briefing = await createBriefing({
      norad: 35932,
      timeZone: "UTC",
      toolOptions: OPTIONS,
      apiKey: null,
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(briefing.mock).toBe(true);
    expect(briefing.source).toBe("local");
    expect(briefing.text).toMatch(/SL-8 DEB/);
    expect(briefing.text).toMatch(/621 meters/);
    expect(briefing.text).toMatch(/13\.9 kilometers per second/);
    expect(briefing.text).toMatch(/BEESAT-1 is just flying alongside you/);
    expect(briefing.text).toMatch(/one threat/);
    expect(briefing.text.split(/\s+/).length).toBeLessThanOrEqual(60);
    expect(briefing.message).toMatch(/XAI_API_KEY/);
  });

  it("says tonight at 9:26 PM when the fixture clock is the demo default", async () => {
    const previous = process.env.DEMO_NOW;
    delete process.env.DEMO_NOW;
    try {
      const briefing = await createBriefing({
        norad: 35932,
        timeZone: "America/New_York",
        apiKey: null,
        toolOptions: { offline: true },
      });
      expect(briefing.text).toMatch(/tonight at 9:26 PM EDT/);
      expect(briefing.text).toMatch(/2026-10-05 01:26 UTC/);
      expect(briefing.text).toMatch(/621 meters/);
      expect(briefing.text).toMatch(/BEESAT-1 is just flying alongside you/);
      expect(briefing.text).not.toMatch(/Docked or co-orbiting/);
      expect(briefing.text.split(/\s+/).length).toBeLessThanOrEqual(60);
    } finally {
      if (previous === undefined) delete process.env.DEMO_NOW;
      else process.env.DEMO_NOW = previous;
    }
  });

  it("uses the non-reasoning brief model when the responses call succeeds", async () => {
    const text =
      "SL-8 DEB is the one threat for SwissCube. Closest approach is tonight at 9:26 PM EDT, about 621 meters, at 13.9 kilometers per second. BEESAT-1 is just flying alongside you. Tell the team. This is not a maneuver order.";
    const fetchImpl = vi.fn(async () =>
      Response.json({
        output: [{ type: "message", content: [{ type: "output_text", text }] }],
      }),
    );
    const briefing = await createBriefing({
      norad: 35932,
      timeZone: "America/New_York",
      toolOptions: OPTIONS,
      apiKey: "server-key",
      fetchImpl,
    });
    expect(briefing).toMatchObject({ source: "grok", mock: false, text });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RESPONSES_URL);
    const body = JSON.parse(String(init.body)) as { model: string; input: { content: string }[] };
    expect(body.model).toBe("grok-4.20-0309-non-reasoning");
    expect(body.input[0]?.content).toMatch(/America\/New_York/);
    expect(body.input[0]?.content).toMatch(/621/);
    expect(body.input[0]?.content).not.toMatch(/focus_encounter/);
    expect(body.input[0]?.content).not.toMatch(/Call tools/);
  });

  it("falls back to the ranker when grok returns filler or too little text", async () => {
    const replies = [
      "One pass matters.",
      "I'll pull the closest pass and focus the globe on it before the briefing.",
      "I'll focus the globe on the one close pass, then brief from the screening numbers.",
      "I'll focus the globe on the one close pass before I brief the team from the screening numbers that are already on the card for tonight.",
    ];
    for (const reply of replies) {
      const fetchImpl = vi.fn(async () =>
        Response.json({
          output: [{ type: "message", content: [{ type: "output_text", text: reply }] }],
        }),
      );
      const briefing = await createBriefing({
        norad: 35932,
        timeZone: "America/New_York",
        toolOptions: OPTIONS,
        apiKey: "server-key",
        fetchImpl,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(briefing.source).toBe("local");
      expect(briefing.mock).toBe(false);
      expect(briefing.text).toMatch(/621 meters/);
      expect(briefing.text).toMatch(/9:26 PM EDT/);
      expect(briefing.text).not.toMatch(/globe|I'll pull|I'll focus|tools/i);
      expect(briefing.message).toBeUndefined();
    }
  });

  it("falls back to the ranker text when grok fails, without retrying", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 500 }));
    const briefing = await createBriefing({
      norad: 35932,
      timeZone: "UTC",
      toolOptions: OPTIONS,
      apiKey: "server-key",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(briefing.source).toBe("local");
    expect(briefing.mock).toBe(false);
    expect(briefing.text).toMatch(/621 meters/);
    expect(briefing.message).not.toContain("server-key");
  });
});
