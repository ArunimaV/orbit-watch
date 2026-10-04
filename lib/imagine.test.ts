import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMITTED_RENDER_URL, DEMO_ENCOUNTER_ID, imaginePromptFor, resolveEncounterRender } from "./imagine";
import { IMAGES_URL } from "./xai-config";

describe("resolveEncounterRender", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-render-"));
    roots.push(root);
    return root;
  }

  it("describes the SwissCube pass like an astronaut photograph", () => {
    const prompt = imaginePromptFor(DEMO_ENCOUNTER_ID);
    expect(prompt).toMatch(/SWISSCUBE/);
    expect(prompt).toMatch(/SL-8 DEB/);
    expect(prompt).toMatch(/621 meters/);
    expect(prompt).toMatch(/gold frame and black cells/);
    expect(prompt).toMatch(/torn scorched rocket stage/);
    expect(prompt).toMatch(/daylight Earth with clouds/i);
    expect(prompt).toMatch(/black sky/i);
    expect(prompt).toMatch(/no logos, no glow effects/i);
  });

  it("serves the committed SwissCube render for the default encounter without calling xAI", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveEncounterRender(DEMO_ENCOUNTER_ID, {
      root: tempRoot(),
      apiKey: "server-key",
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      url: COMMITTED_RENDER_URL,
      source: "committed",
      cached: true,
      mock: false,
    });
    const file = fs.readFileSync(path.join(process.cwd(), "public/renders/swisscube-sl8deb.jpg"));
    expect(file.subarray(0, 2).toString("hex")).toBe("ffd8");
  });

  it("falls back to the committed render when the key is missing", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveEncounterRender("35932-1-20261006T000000000Z", {
      root: tempRoot(),
      apiKey: null,
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.url).toBe(COMMITTED_RENDER_URL);
    expect(result.source).toBe("fallback");
    expect(result.mock).toBe(true);
    expect(result.message).toMatch(/XAI_API_KEY/);
  });

  it("downloads a generated jpeg once and then serves the cache", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3, 4]);
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === IMAGES_URL) {
        return Response.json({
          data: [{ url: "https://cdn.example.test/temp.jpg", mime_type: "image/jpeg" }],
        });
      }
      return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
    });
    const root = tempRoot();
    const id = "35932-19831-20261006T000000000Z";
    const first = await resolveEncounterRender(id, { root, apiKey: "server-key", fetchImpl });
    expect(first).toMatchObject({ url: `/renders/${id}.jpg`, source: "generated", cached: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(IMAGES_URL);
    const body = JSON.parse(String(init.body)) as { model: string; n: number; prompt: string };
    expect(body).toMatchObject({ model: "grok-imagine-image-quality", n: 1 });
    expect(body.prompt).toMatch(/gold frame/);
    expect(body.prompt).toMatch(/black cells/);
    expect(body.prompt).toMatch(/scorched rocket stage/);
    expect(body.prompt).toMatch(/no logos/i);
    expect(body.prompt).toMatch(/no glow effects/i);
    const saved = fs.readFileSync(path.join(root, "public/renders", `${id}.jpg`));
    expect(Array.from(saved)).toEqual(Array.from(jpeg));

    fetchImpl.mockClear();
    const second = await resolveEncounterRender(id, { root, apiKey: "server-key", fetchImpl });
    expect(second.source).toBe("cache");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not retry a failed generation and shows the committed render", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 500 }));
    const result = await resolveEncounterRender("35932-9-20261006T000000000Z", {
      root: tempRoot(),
      apiKey: "server-key",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.url).toBe(COMMITTED_RENDER_URL);
    expect(result.source).toBe("fallback");
    expect(result.message).not.toContain("server-key");
  });
});
