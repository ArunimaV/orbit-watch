/** Public xAI endpoints. No secrets live in this module. */

export const XAI_API_BASE = "https://api.x.ai/v1";

export const REALTIME_MODEL = "grok-voice-latest";
export const REALTIME_URL = `wss://api.x.ai/v1/realtime?model=${REALTIME_MODEL}`;

export const TEXT_MODEL = "grok-4.7";
/** Short spoken briefs. grok-4.7 spends hundreds of hidden reasoning tokens on a 60-word script. */
export const BRIEF_MODEL = "grok-4.20-0309-non-reasoning";
export const IMAGE_MODEL = "grok-imagine-image-quality";
export const VOICE_ID = "eve";

export const CLIENT_SECRET_URL = `${XAI_API_BASE}/realtime/client_secrets`;
export const RESPONSES_URL = `${XAI_API_BASE}/responses`;
export const TTS_URL = `${XAI_API_BASE}/tts`;
export const IMAGES_URL = `${XAI_API_BASE}/images/generations`;

export const CLIENT_SECRET_TTL_SECONDS = 300;

export const MISSING_KEY_MESSAGE =
  "XAI_API_KEY is not set on the server. The mic, spoken brief, and new Imagine renders stay off. Brief me still reads the ranked warnings, and the committed SwissCube render is shown.";
