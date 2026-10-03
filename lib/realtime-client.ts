import { base64ToBytes } from "./pcm";
import { REALTIME_URL, VOICE_ID } from "./xai-config";
import { VOICE_TOOLS, type VoiceToolSpec } from "./voice-tool-schema";

export interface RealtimeSocket {
  send(data: string): void;
  close(): void;
}

export type RealtimeSocketFactory = new (url: string, protocols?: string[]) => RealtimeSocket;

export function openRealtimeSocket(token: string, Factory: RealtimeSocketFactory): RealtimeSocket {
  return new Factory(REALTIME_URL, [`xai-client-secret.${token}`]);
}

export function sessionUpdateMessage(instructions: string, tools: VoiceToolSpec[] = VOICE_TOOLS) {
  return {
    type: "session.update" as const,
    session: {
      voice: VOICE_ID,
      instructions,
      turn_detection: null,
      tools,
      audio: {
        input: { format: { type: "audio/pcm", rate: 24000 } },
        output: { format: { type: "audio/pcm", rate: 24000 } },
      },
    },
  };
}

export interface RealtimeClientOptions {
  send: (payload: unknown) => void;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  instructions: string;
  tools?: VoiceToolSpec[];
  onAssistantDelta?: (delta: string) => void;
  onAssistantDone?: (transcript: string) => void;
  onUserTranscript?: (transcript: string, final: boolean) => void;
  onAudio?: (pcm: Uint8Array) => void;
  onError?: (message: string) => void;
  onSessionReady?: () => void;
  waitForPlayback?: () => Promise<void>;
}

function textField(event: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = event[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
    return {};
  }
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

/**
 * Push-to-talk session. turn_detection is null, so the client commits the
 * mic buffer and then sends response.create. Function outputs are returned
 * before the follow-up response.create, after playback drains.
 */
export class RealtimeClient {
  private sessionReady = false;
  private audioQueue: string[] = [];
  private commitWhenReady = false;
  private pending: Promise<void>[] = [];
  private sawTool = false;

  constructor(private readonly options: RealtimeClientOptions) {}

  onOpen(): void {
    this.options.send(sessionUpdateMessage(this.options.instructions, this.options.tools ?? VOICE_TOOLS));
  }

  appendAudio(base64Pcm: string): void {
    if (!base64Pcm) return;
    if (!this.sessionReady) {
      this.audioQueue.push(base64Pcm);
      return;
    }
    this.options.send({ type: "input_audio_buffer.append", audio: base64Pcm });
  }

  commitTurn(): void {
    if (!this.sessionReady) {
      this.commitWhenReady = true;
      return;
    }
    this.options.send({ type: "input_audio_buffer.commit" });
    this.options.send({ type: "response.create" });
  }

  async handleMessage(raw: string): Promise<void> {
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      event = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    const type = event.type;
    if (type === "session.updated") {
      this.sessionReady = true;
      for (const chunk of this.audioQueue) {
        this.options.send({ type: "input_audio_buffer.append", audio: chunk });
      }
      this.audioQueue = [];
      this.options.onSessionReady?.();
      if (this.commitWhenReady) {
        this.commitWhenReady = false;
        this.commitTurn();
      }
      return;
    }

    if (type === "response.created") {
      this.pending = [];
      this.sawTool = false;
      return;
    }

    if (type === "response.output_audio.delta") {
      const delta = textField(event, ["delta"]);
      if (delta) this.options.onAudio?.(base64ToBytes(delta));
      return;
    }

    if (type === "response.output_audio_transcript.delta") {
      const delta = textField(event, ["delta"]);
      if (delta) this.options.onAssistantDelta?.(delta);
      return;
    }

    if (type === "response.output_audio_transcript.done") {
      this.options.onAssistantDone?.(textField(event, ["transcript", "delta"]));
      return;
    }

    if (type === "conversation.item.input_audio_transcription.updated") {
      this.options.onUserTranscript?.(textField(event, ["transcript", "delta"]), false);
      return;
    }

    if (type === "conversation.item.input_audio_transcription.completed") {
      this.options.onUserTranscript?.(textField(event, ["transcript"]), true);
      return;
    }

    if (type === "response.function_call_arguments.done") {
      this.sawTool = true;
      const name = textField(event, ["name"]);
      const callId = textField(event, ["call_id"]);
      const args = parseArguments(event.arguments);
      this.pending.push(this.finishTool(name, callId, args));
      return;
    }

    if (type === "response.done") {
      if (!this.sawTool) return;
      const pending = this.pending;
      this.pending = [];
      this.sawTool = false;
      await Promise.all(pending);
      await this.options.waitForPlayback?.();
      this.options.send({ type: "response.create" });
      return;
    }

    if (type === "error") {
      const nested = event.error;
      const message =
        nested && typeof nested === "object" && typeof (nested as { message?: unknown }).message === "string"
          ? (nested as { message: string }).message
          : textField(event, ["message"]) || "Voice session error";
      this.options.onError?.(message);
    }
  }

  private async finishTool(name: string, callId: string, args: Record<string, unknown>): Promise<void> {
    let output: unknown;
    try {
      output = await this.options.executeTool(name, args);
    } catch (error) {
      output = { error: error instanceof Error ? error.message : "Tool failed" };
    }
    this.options.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
  }
}
