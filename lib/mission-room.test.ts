import { describe, expect, it } from "vitest";
import { grokAlertFeedLine, grokBriefFeedLine, spacetimeConfig } from "./mission-room";

describe("spacetimeConfig", () => {
  it("stays off unless both public env vars are set", () => {
    expect(spacetimeConfig({ uri: "", module: "" })).toBeNull();
    expect(spacetimeConfig({ uri: "http://127.0.0.1:3100" })).toBeNull();
    expect(spacetimeConfig({ module: "orbit-watch" })).toBeNull();
    expect(
      spacetimeConfig({
        uri: "  http://127.0.0.1:3100  ",
        module: " orbit-watch ",
      }),
    ).toEqual({ uri: "http://127.0.0.1:3100", module: "orbit-watch" });
  });
});

describe("feed lines", () => {
  it("compresses the SwissCube brief into one shared line", () => {
    const text = [
      "SL-8 DEB is the one threat for SwissCube.",
      "Closest approach is tonight at 9:26 PM EDT (2026-10-05 01:26 UTC), about 621 meters, at 13.9 kilometers per second.",
    ].join(" ");
    expect(grokBriefFeedLine(text)).toBe("Grok briefed: SL-8 DEB 621 m at 9:26 PM");
  });

  it("keeps an unfamiliar briefing as its first sentence", () => {
    expect(grokBriefFeedLine("Check the board. Then call the team.")).toBe("Grok briefed: Check the board.");
  });

  it("prefixes the heads-up alert", () => {
    expect(grokAlertFeedLine("Heads up: 1 real threat to SwissCube tonight")).toBe(
      "Grok alert: Heads up: 1 real threat to SwissCube tonight",
    );
  });
});
