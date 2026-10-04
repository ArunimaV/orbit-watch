import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getTts, POST as postTts } from "@/app/api/tts/route";
import { POST } from "@/app/api/voice/token/route";
import { extractResponseText, mintRealtimeClientSecret, requestSpeech } from "./xai";
import { CLIENT_SECRET_URL, TTS_URL } from "./xai-config";

const ORIGINAL_KEY = process.env.XAI_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = ORIGINAL_KEY;
  vi.unstubAllGlobals();
});

describe("mintRealtimeClientSecret", () => {
  it("does not call xAI when the key is missing", async () => {
    const fetchImpl = vi.fn();
    const result = await mintRealtimeClientSecret({ apiKey: null, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.mock).toBe(true);
      expect(result.message).toMatch(/XAI_API_KEY/);
    }
  });

  it("posts the documented body and returns only value and expires_at", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ value: "ephemeral-token", expires_at: 1750000000, extra: "drop-me" }),
    );
    const result = await mintRealtimeClientSecret({ apiKey: "server-key", fetchImpl });
    expect(result).toEqual({ ok: true, secret: { value: "ephemeral-token", expires_at: 1750000000 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CLIENT_SECRET_URL);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(JSON.parse(String(init.body))).toEqual({ expires_after: { seconds: 300 } });
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer server-key");
    expect(JSON.stringify(result)).not.toContain("server-key");
  });

  it("does not retry a non-200 and does not echo the key", async () => {
    const fetchImpl = vi.fn(async () => new Response("Bearer server-key", { status: 401 }));
    const result = await mintRealtimeClientSecret({ apiKey: "server-key", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.message).not.toContain("server-key");
    }
  });
});

describe("POST /api/voice/token", () => {
  it("returns a mock payload and no secret when the key is missing", async () => {
    delete process.env.XAI_API_KEY;
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const response = await POST();
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body.mock).toBe(true);
    expect(body.value).toBeUndefined();
    expect(body.expires_at).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns only value and expires_at to the browser", async () => {
    process.env.XAI_API_KEY = "server-key";
    const fetchImpl = vi.fn(async () =>
      Response.json({ value: "ephemeral-token", expires_at: 1750000000, api_key: "server-key" }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const response = await POST();
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["expires_at", "value"]);
    expect(body).toEqual({ value: "ephemeral-token", expires_at: 1750000000 });
    expect(JSON.stringify(body)).not.toContain("server-key");
  });
});

describe("requestSpeech", () => {
  it("posts Eve English text and returns the upstream mpeg stream", async () => {
    const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);
    const upstream = new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg" } });
    const fetchImpl = vi.fn(async () => upstream);
    const result = await requestSpeech("Hold at 621 meters.", { apiKey: "server-key", fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toBe(upstream.body);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TTS_URL);
    expect(JSON.parse(String(init.body))).toEqual({
      text: "Hold at 621 meters.",
      voice_id: "eve",
      language: "en",
    });
  });
});

describe("/api/tts", () => {
  it("streams the upstream body on GET and POST", async () => {
    process.env.XAI_API_KEY = "server-key";
    const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);
    const upstream = new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg" } });
    vi.stubGlobal("fetch", vi.fn(async () => upstream));

    const streamed = await getTts(new Request("http://localhost/api/tts?text=Hold%20at%20621%20meters."));
    expect(streamed.status).toBe(200);
    expect(streamed.headers.get("content-type")).toContain("audio/mpeg");
    expect(streamed.headers.get("cache-control")).toBe("no-store");
    expect(streamed.body).toBe(upstream.body);

    const again = new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg" } });
    vi.stubGlobal("fetch", vi.fn(async () => again));
    const posted = await postTts(
      new Request("http://localhost/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hold at 621 meters." }),
      }),
    );
    expect(posted.status).toBe(200);
    expect(posted.body).toBe(again.body);
  });
});

describe("extractResponseText", () => {
  it("reads output_text parts from a responses payload", () => {
    const text = extractResponseText({
      output: [{ type: "message", content: [{ type: "output_text", text: "621 meters." }] }],
    });
    expect(text).toBe("621 meters.");
  });

  it("skips a reasoning item and reads the later message", () => {
    const text = extractResponseText({
      output: [
        { type: "reasoning", content: [{ type: "reasoning_text", text: "thinking" }] },
        { type: "message", content: [{ type: "output_text", text: "Tonight at 9:26 PM." }] },
      ],
    });
    expect(text).toBe("Tonight at 9:26 PM.");
  });
});
