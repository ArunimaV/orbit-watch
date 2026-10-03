import {
  CLIENT_SECRET_TTL_SECONDS,
  CLIENT_SECRET_URL,
  IMAGES_URL,
  IMAGE_MODEL,
  MISSING_KEY_MESSAGE,
  RESPONSES_URL,
  TEXT_MODEL,
  TTS_URL,
  VOICE_ID,
} from "./xai-config";

/** Server-only. Do not import this module from client components. */
export function readXaiApiKey(): string | null {
  const key = process.env.XAI_API_KEY?.trim();
  return key ? key : null;
}

export interface ClientSecret {
  value: string;
  expires_at: number;
}

export type MintResult =
  | { ok: true; secret: ClientSecret }
  | { ok: false; mock: true; status: number; message: string };

export interface XaiFetchOptions {
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * POST /v1/realtime/client_secrets.
 * Success returns only {value, expires_at}. The API key never leaves the server.
 * A missing key is mock mode: no request is sent.
 */
export async function mintRealtimeClientSecret(options: XaiFetchOptions = {}): Promise<MintResult> {
  const apiKey = options.apiKey === undefined ? readXaiApiKey() : options.apiKey;
  if (!apiKey) {
    return { ok: false, mock: true, status: 200, message: MISSING_KEY_MESSAGE };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(CLIENT_SECRET_URL, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ expires_after: { seconds: CLIENT_SECRET_TTL_SECONDS } }),
      redirect: "manual",
    });
  } catch {
    return {
      ok: false,
      mock: true,
      status: 502,
      message: "Could not reach the xAI realtime token endpoint. Use Brief me.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      mock: true,
      status: 502,
      message: `xAI refused the realtime client secret (${response.status}). Use Brief me.`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      mock: true,
      status: 502,
      message: "xAI client secret response was not JSON. Use Brief me.",
    };
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const value = record.value;
  const expiresAt = record.expires_at;
  if (typeof value !== "string" || !value || typeof expiresAt !== "number") {
    return {
      ok: false,
      mock: true,
      status: 502,
      message: "xAI client secret response was missing value or expires_at. Use Brief me.",
    };
  }

  return { ok: true, secret: { value, expires_at: expiresAt } };
}

export function extractResponseText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text.trim();
  }
  const output = record.output;
  if (!Array.isArray(output)) return null;
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      const type = (part as { type?: unknown }).type;
      if (typeof text !== "string" || !text.trim()) continue;
      if (type === undefined || type === "output_text" || type === "text") parts.push(text.trim());
    }
  }
  const joined = parts.join("\n").trim();
  return joined || null;
}

export async function requestTextBrief(
  prompt: string,
  options: XaiFetchOptions = {},
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const apiKey = options.apiKey === undefined ? readXaiApiKey() : options.apiKey;
  if (!apiKey) return { ok: false, message: MISSING_KEY_MESSAGE };

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(RESPONSES_URL, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model: TEXT_MODEL,
        input: [{ role: "user", content: prompt }],
      }),
      redirect: "manual",
    });
  } catch {
    return { ok: false, message: "Could not reach the xAI responses endpoint." };
  }

  if (!response.ok) {
    return { ok: false, message: `xAI responses request failed (${response.status}).` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, message: "xAI responses payload was not JSON." };
  }

  const text = extractResponseText(body);
  if (!text) return { ok: false, message: "xAI responses payload had no output text." };
  return { ok: true, text };
}

export async function requestSpeech(
  text: string,
  options: XaiFetchOptions = {},
): Promise<{ ok: true; audio: Uint8Array } | { ok: false; mock: true; status: number; message: string }> {
  const apiKey = options.apiKey === undefined ? readXaiApiKey() : options.apiKey;
  if (!apiKey) return { ok: false, mock: true, status: 200, message: MISSING_KEY_MESSAGE };

  const spoken = text.trim().slice(0, 4000);
  if (!spoken) return { ok: false, mock: true, status: 400, message: "Nothing to speak." };

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(TTS_URL, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ text: spoken, voice_id: VOICE_ID, language: "en" }),
      redirect: "manual",
    });
  } catch {
    return { ok: false, mock: true, status: 502, message: "Could not reach the xAI text-to-speech endpoint." };
  }

  if (!response.ok) {
    return { ok: false, mock: true, status: 502, message: `xAI text-to-speech failed (${response.status}).` };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, mock: true, status: 502, message: "xAI text-to-speech JSON was unreadable." };
    }
    const audioField = body && typeof body === "object" ? (body as { audio?: unknown }).audio : undefined;
    if (typeof audioField !== "string" || !audioField) {
      return { ok: false, mock: true, status: 502, message: "xAI text-to-speech JSON had no audio." };
    }
    const bytes = Buffer.from(audioField, "base64");
    if (bytes.byteLength < 8) {
      return { ok: false, mock: true, status: 502, message: "xAI text-to-speech audio was empty." };
    }
    return { ok: true, audio: new Uint8Array(bytes) };
  }

  const audio = new Uint8Array(await response.arrayBuffer());
  if (audio.byteLength < 8) {
    return { ok: false, mock: true, status: 502, message: "xAI text-to-speech returned empty audio." };
  }
  return { ok: true, audio };
}

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * POST /v1/images/generations and download the temporary URL.
 * One attempt. Callers cache the bytes; this function does not retry.
 */
export async function requestImage(
  prompt: string,
  options: XaiFetchOptions = {},
): Promise<{ ok: true; image: GeneratedImage } | { ok: false; message: string }> {
  const apiKey = options.apiKey === undefined ? readXaiApiKey() : options.apiKey;
  if (!apiKey) return { ok: false, message: MISSING_KEY_MESSAGE };

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(IMAGES_URL, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1 }),
      redirect: "manual",
    });
  } catch {
    return { ok: false, message: "Could not reach the xAI image endpoint." };
  }

  if (!response.ok) {
    return { ok: false, message: `xAI image generation failed (${response.status}).` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, message: "xAI image response was not JSON." };
  }

  const data = body && typeof body === "object" ? (body as { data?: unknown }).data : undefined;
  const first = Array.isArray(data) ? data[0] : undefined;
  const url = first && typeof first === "object" ? (first as { url?: unknown }).url : undefined;
  const mimeType =
    first && typeof first === "object" && typeof (first as { mime_type?: unknown }).mime_type === "string"
      ? (first as { mime_type: string }).mime_type
      : "image/jpeg";
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return { ok: false, message: "xAI image response had no https URL." };
  }

  let download: Response;
  try {
    download = await fetchImpl(url);
  } catch {
    return { ok: false, message: "Could not download the generated image." };
  }
  if (!download.ok) {
    return { ok: false, message: `Downloading the generated image failed (${download.status}).` };
  }
  const bytes = new Uint8Array(await download.arrayBuffer());
  if (bytes.byteLength < 8) return { ok: false, message: "The generated image was empty." };
  return { ok: true, image: { bytes, mimeType } };
}
