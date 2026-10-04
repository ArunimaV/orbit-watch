"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PcmPlayer, captureMicrophone } from "@/lib/browser-audio";
import { dispatchFocusEncounter } from "@/lib/focus";
import { pcm16ToBase64 } from "@/lib/pcm";
import { RealtimeClient, openRealtimeSocket } from "@/lib/realtime-client";
import { voiceInstructions } from "@/lib/voice-prompt";
import { MISSING_KEY_MESSAGE } from "@/lib/xai-config";

interface TranscriptLine {
  id: string;
  role: "you" | "grok" | "note";
  text: string;
}

interface RenderState {
  url: string;
  source: string;
  message?: string;
  mock?: boolean;
}

interface BriefPayload {
  text: string;
  mock?: boolean;
  message?: string;
  source?: "grok" | "local";
  error?: string;
}

function briefCacheKey(norad: number, encounterId: string | null): string {
  return `${norad}|${encounterId ?? ""}|${listenerZone()}`;
}

function postBrief(input: {
  norad: number;
  encounterId: string | null;
  localOnly?: boolean;
  signal?: AbortSignal;
}): Promise<BriefPayload> {
  return fetch("/api/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      norad: input.norad,
      encounterId: input.encounterId,
      timeZone: listenerZone(),
      clientNow: new Date().toISOString(),
      ...(input.localOnly ? { localOnly: true } : {}),
    }),
  }).then(async (response) => {
    const body = (await response.json()) as BriefPayload;
    if (!response.ok || !body.text) {
      throw new Error(body.error ?? body.message ?? "Briefing failed");
    }
    return body;
  });
}

function lineId(): string {
  return crypto.randomUUID();
}

function listenerZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function briefingClock(evaluatedAt: string | null): Date {
  if (evaluatedAt) {
    const parsed = new Date(evaluatedAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function VoicePanel({
  norad,
  encounterId,
  evaluatedAt,
}: {
  norad: number;
  encounterId: string | null;
  evaluatedAt: string | null;
}) {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [connected, setConnected] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const [render, setRender] = useState<RenderState | null>(null);
  const [renderPending, setRenderPending] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const stopMicRef = useRef<(() => void) | null>(null);
  const recordingRef = useRef(false);
  const releaseRef = useRef(false);
  const grokLineRef = useRef<string | null>(null);
  const youLineRef = useRef<string | null>(null);
  const userTurnOpenRef = useRef(false);
  const briefLockRef = useRef(false);
  const chainRef = useRef(Promise.resolve());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEpoch = useRef(0);
  const localBriefRef = useRef<{ key: string; text: string } | null>(null);
  const localPromiseRef = useRef<{ key: string; promise: Promise<string> } | null>(null);
  const briefPromiseRef = useRef<{ key: string; promise: Promise<BriefPayload> } | null>(null);
  const briefSettledRef = useRef<{ key: string; body: BriefPayload } | null>(null);
  const dropAssistantRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/voice/token", { signal: controller.signal })
      .then(async (response) => (await response.json()) as { configured?: boolean; mock?: boolean; message?: string })
      .then((body) => {
        const ready = body.configured === true && body.mock !== true;
        setConfigured(ready);
        setBanner(ready ? null : (body.message ?? MISSING_KEY_MESSAGE));
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setConfigured(false);
        setBanner(MISSING_KEY_MESSAGE);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!encounterId) {
      setRender(null);
      setRenderPending(false);
      return;
    }
    const controller = new AbortController();
    setRender(null);
    setRenderPending(true);
    fetch(`/api/imagine/${encodeURIComponent(encounterId)}`, { signal: controller.signal })
      .then(async (response) => (await response.json()) as RenderState)
      .then((body) => {
        if (typeof body.url === "string") setRender(body);
        setRenderPending(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setRender({
          url: "/renders/swisscube-sl8deb.jpg",
          source: "fallback",
          message: "Could not load a rendering. Showing the committed SwissCube pass.",
        });
        setRenderPending(false);
      });
    return () => controller.abort();
  }, [encounterId]);

  useEffect(() => {
    return () => {
      stopMicRef.current?.();
      socketRef.current?.close();
      playerRef.current?.stop();
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!encounterId) return undefined;
    const key = briefCacheKey(norad, encounterId);
    const controller = new AbortController();

    const localPromise = postBrief({ norad, encounterId, localOnly: true, signal: controller.signal })
      .then((body) => {
        localBriefRef.current = { key, text: body.text };
        return body.text;
      })
      .catch(() => "");
    localPromiseRef.current = { key, promise: localPromise };

    const briefPromise = postBrief({ norad, encounterId, signal: controller.signal }).then((body) => {
      if (!controller.signal.aborted) briefSettledRef.current = { key, body };
      return body;
    });
    briefPromise.catch(() => {
      if (briefPromiseRef.current?.promise === briefPromise) briefPromiseRef.current = null;
    });
    briefPromiseRef.current = { key, promise: briefPromise };

    return () => controller.abort();
  }, [norad, encounterId]);

  useEffect(() => {
    if (!renderOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRenderOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [renderOpen]);

  function appendLines(next: TranscriptLine[]) {
    setLines((current) => [...current, ...next]);
  }

  function pushLine(role: TranscriptLine["role"], text: string): string {
    const id = lineId();
    if (role === "you") {
      youLineRef.current = id;
      grokLineRef.current = null;
      userTurnOpenRef.current = true;
      appendLines([{ id, role, text }]);
      return id;
    }
    setLines((current) => [...current, { id, role, text }]);
    return id;
  }

  function replaceLine(id: string, text: string) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, text } : line)));
  }

  async function executeTool(name: string, args: Record<string, unknown>) {
    const response = await fetch("/api/voice/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        arguments: {
          ...args,
          timeZone: listenerZone(),
          clientNow: new Date().toISOString(),
        },
      }),
    });
    const body = (await response.json()) as { output?: unknown };
    const output = body.output;
    if (output && typeof output === "object" && (output as { focus?: unknown }).focus === true) {
      const id = (output as { id?: unknown }).id;
      if (typeof id === "string") dispatchFocusEncounter(id);
    }
    return output ?? { error: "Tool returned nothing" };
  }

  async function ensureSession(): Promise<void> {
    const existing = socketRef.current;
    if (existing && existing.readyState === WebSocket.OPEN && clientRef.current) return;

    const tokenResponse = await fetch("/api/voice/token", { method: "POST" });
    const token = (await tokenResponse.json()) as { value?: string; mock?: boolean; message?: string };
    if (!tokenResponse.ok || token.mock || typeof token.value !== "string") {
      throw new Error(token.message ?? "Voice token unavailable. Use Brief me.");
    }

    const player = playerRef.current ?? new PcmPlayer();
    playerRef.current = player;
    await player.resume();

    const socket = openRealtimeSocket(token.value, WebSocket) as WebSocket;
    socketRef.current = socket;
    const client = new RealtimeClient({
      send: (payload) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
      },
      executeTool,
      instructions: voiceInstructions(listenerZone(), briefingClock(evaluatedAt)),
      onAssistantDelta: (delta) => {
        if (briefLockRef.current || dropAssistantRef.current) return;
        if (!grokLineRef.current) {
          const id = lineId();
          grokLineRef.current = id;
          const line = { id, role: "grok" as const, text: delta };
          if (youLineRef.current) setLines((current) => [...current, line]);
          else appendLines([line]);
        } else {
          const id = grokLineRef.current;
          setLines((current) =>
            current.map((line) => (line.id === id ? { ...line, text: line.text + delta } : line)),
          );
        }
      },
      onAssistantDone: (transcript) => {
        if (dropAssistantRef.current) {
          dropAssistantRef.current = false;
          grokLineRef.current = null;
          youLineRef.current = null;
          userTurnOpenRef.current = false;
          return;
        }
        if (briefLockRef.current) return;
        const id = grokLineRef.current;
        grokLineRef.current = null;
        youLineRef.current = null;
        userTurnOpenRef.current = false;
        if (!transcript) return;
        if (id) replaceLine(id, transcript);
        else appendLines([{ id: lineId(), role: "grok", text: transcript }]);
      },
      onUserTranscript: (transcript, final) => {
        if (briefLockRef.current || dropAssistantRef.current || !transcript) return;
        if (!userTurnOpenRef.current || !youLineRef.current) {
          youLineRef.current = pushLine("you", transcript);
        } else {
          replaceLine(youLineRef.current, transcript);
        }
        if (final) userTurnOpenRef.current = false;
      },
      onAudio: (bytes) => {
        if (dropAssistantRef.current) return;
        player.enqueue(pcm16FromBytes(bytes));
      },
      onError: (message) => setError(message),
      waitForPlayback: () => player.whenIdle(),
    });
    clientRef.current = client;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Voice connection timed out. Use Brief me.")), 8000);
      socket.addEventListener("open", () => {
        window.clearTimeout(timer);
        client.onOpen();
        setConnected(true);
        resolve();
      });
      socket.addEventListener("error", () => {
        window.clearTimeout(timer);
        reject(new Error("Voice connection failed. Use Brief me."));
      });
    });

    socket.addEventListener("message", (event) => {
      chainRef.current = chainRef.current.then(() => client.handleMessage(String(event.data)));
    });
    socket.addEventListener("close", () => {
      setConnected(false);
      socketRef.current = null;
    });
  }

  async function startTalking() {
    if (recordingRef.current || configured === false) return;
    dropAssistantRef.current = false;
    releaseRef.current = false;
    setError(null);
    try {
      await ensureSession();
      const client = clientRef.current;
      if (!client) throw new Error("Voice session did not start. Use Brief me.");
      const stop = await captureMicrophone((pcm) => {
        client.appendAudio(pcm16ToBase64(pcm));
      });
      if (releaseRef.current) {
        stop();
        client.commitTurn();
        return;
      }
      stopMicRef.current = stop;
      recordingRef.current = true;
      setRecording(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Microphone or voice connection failed.";
      const denied = /permission|notallowed|denied/i.test(message);
      setError(denied ? "Microphone is blocked. Use Brief me." : message);
      setRecording(false);
      recordingRef.current = false;
    }
  }

  function stopTalking() {
    releaseRef.current = true;
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    stopMicRef.current?.();
    stopMicRef.current = null;
    clientRef.current?.commitTurn();
  }

  function stopPlayback() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      const src = audio.src;
      audioRef.current = null;
      audio.removeAttribute("src");
      audio.load();
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    }
    playerRef.current?.stop();
  }

  function clearTranscript() {
    transcriptEpoch.current += 1;
    dropAssistantRef.current = true;
    youLineRef.current = null;
    grokLineRef.current = null;
    userTurnOpenRef.current = false;
    setLines([]);
    setError(null);
    stopPlayback();
  }

  function speak(text: string, epoch: number): Promise<void> {
    if (transcriptEpoch.current !== epoch) return Promise.resolve();
    stopPlayback();
    const audio = new Audio();
    audioRef.current = audio;
    const url = `/api/tts?text=${encodeURIComponent(text)}`;
    audio.preload = "auto";
    audio.src = url;
    return audio.play().then(
      () => {
        if (transcriptEpoch.current !== epoch || audioRef.current !== audio) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
      },
      async (cause: unknown) => {
        if (transcriptEpoch.current !== epoch || audioRef.current !== audio) return;
        if (cause instanceof DOMException && cause.name === "NotAllowedError") return;
        try {
          const response = await fetch(url);
          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("application/json")) return;
          const body = (await response.json()) as { message?: string };
          if (body.message) setBanner(body.message);
        } catch {
          // The transcript still shows the briefing when speech cannot start.
        }
      },
    );
  }

  async function brief() {
    if (briefing || briefLockRef.current) return;
    const epoch = transcriptEpoch.current;
    const key = briefCacheKey(norad, encounterId);
    dropAssistantRef.current = false;
    setBriefing(true);
    setError(null);
    briefLockRef.current = true;
    youLineRef.current = null;
    grokLineRef.current = null;
    userTurnOpenRef.current = false;
    stopPlayback();

    const id = lineId();
    let showed = false;
    const show = (text: string) => {
      if (transcriptEpoch.current !== epoch || !text) return;
      if (!showed) {
        showed = true;
        grokLineRef.current = null;
        appendLines([{ id, role: "grok", text }]);
        return;
      }
      replaceLine(id, text);
    };

    try {
      const settled = briefSettledRef.current;
      if (settled?.key === key && settled.body.text) {
        show(settled.body.text);
        if (settled.body.message) setBanner(settled.body.message);
        if (!settled.body.mock) await speak(settled.body.text, epoch);
        return;
      }

      const cachedLocal = localBriefRef.current;
      if (cachedLocal?.key === key) {
        show(cachedLocal.text);
      } else {
        const pendingLocal =
          localPromiseRef.current?.key === key
            ? localPromiseRef.current.promise
            : postBrief({ norad, encounterId, localOnly: true }).then((body) => body.text);
        void pendingLocal
          .then((text) => {
            if (!showed) show(text);
          })
          .catch(() => undefined);
      }

      let job = briefPromiseRef.current?.key === key ? briefPromiseRef.current.promise : null;
      if (!job) {
        job = postBrief({ norad, encounterId });
        briefPromiseRef.current = { key, promise: job };
        void job
          .then((body) => {
            briefSettledRef.current = { key, body };
          })
          .catch(() => {
            if (briefPromiseRef.current?.promise === job) briefPromiseRef.current = null;
          });
      }
      const body = await job;
      if (transcriptEpoch.current !== epoch) return;
      briefSettledRef.current = { key, body };
      show(body.text);
      if (body.message) setBanner(body.message);
      if (!body.mock) await speak(body.text, epoch);
    } catch (cause) {
      if (transcriptEpoch.current !== epoch) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Briefing failed");
    } finally {
      briefLockRef.current = false;
      setBriefing(false);
    }
  }

  useEffect(() => {
    const scroller = logRef.current;
    const latest = scroller?.querySelector<HTMLElement>("[data-latest='true']");
    if (!scroller || !latest) return;
    const delta = latest.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += delta;
  }, [lines]);

  return (
    <section className="flex min-h-[220px] min-h-0 flex-col bg-panel">
      <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
        <h2 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">Transcript</h2>
        <div className="flex items-center gap-3">
          {lines.length > 0 && (
            <button
              type="button"
              onClick={clearTranscript}
              className="text-[10px] tracking-[0.14em] text-muted uppercase hover:text-foreground"
            >
              Clear
            </button>
          )}
          <span className="font-mono text-[11px] text-muted">
            {configured === false ? "mock" : recording ? "listening" : connected ? "live" : "idle"}
          </span>
        </div>
      </header>

      <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {banner && <p className="mb-3 text-xs leading-relaxed text-muted">{banner}</p>}
        {error && <p className="mb-3 text-xs leading-relaxed text-act">{error}</p>}
        {lines.length === 0 && !banner && !briefing && (
          <p className="text-sm leading-relaxed text-muted">
            Hold the mic and ask about SwissCube, or use Brief me if the mic is unavailable.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {lines.map((line, index) => (
            <p
              key={line.id}
              data-latest={index === lines.length - 1 ? "true" : undefined}
              className={`text-sm leading-relaxed ${index === lines.length - 1 ? "orbit-fade-in" : ""}`}
            >
              <span className="mr-2 font-mono text-[10px] tracking-wide text-accent uppercase">
                {line.role === "you" ? "You" : line.role === "grok" ? "Grok" : "Note"}
              </span>
              {line.text}
            </p>
          ))}
        </div>

        {renderPending && <p className="mt-4 text-[11px] text-muted">Generating render…</p>}
        {render && !renderPending && (
          <button type="button" onClick={() => setRenderOpen(true)} className="mt-4 block w-full text-left">
            <Image
              src={render.url}
              alt="Artist's rendering of SwissCube and an object passing over Earth"
              width={1248}
              height={832}
              unoptimized
              className="aspect-video w-full rounded border border-edge object-cover"
            />
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Artist&apos;s rendering from real orbital data.
              {render.message ? ` ${render.message}` : ""}
            </p>
          </button>
        )}
      </div>

      <div className="flex gap-2 border-t border-edge px-4 py-3">
        <button
          type="button"
          disabled={configured === false}
          aria-pressed={recording}
          onPointerDown={(event) => {
            event.preventDefault();
            void startTalking();
          }}
          onPointerUp={() => stopTalking()}
          onPointerCancel={() => stopTalking()}
          className="flex-1 rounded border border-edge px-2 py-2 text-xs text-foreground hover:border-accent disabled:cursor-not-allowed disabled:text-muted"
        >
          {recording ? "Listening…" : "Hold to talk"}
        </button>
        <button
          type="button"
          onClick={() => void brief()}
          disabled={briefing}
          className="flex-1 rounded border border-accent px-2 py-2 text-xs text-accent hover:bg-background disabled:opacity-60"
        >
          {briefing ? "Briefing…" : "Brief me"}
        </button>
      </div>

      {renderOpen && render && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Encounter rendering"
          onClick={() => setRenderOpen(false)}
        >
          <div className="max-h-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
            <Image
              src={render.url}
              alt="Artist's rendering of the selected encounter over Earth"
              width={1248}
              height={832}
              unoptimized
              className="h-auto max-h-[80vh] w-full rounded border border-edge object-contain"
            />
            <p className="mt-2 text-center text-xs text-foreground">
              Artist&apos;s rendering from real orbital data. Not a photograph. Not for operational use.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function pcm16FromBytes(bytes: Uint8Array): Int16Array {
  const even = bytes.byteLength - (bytes.byteLength % 2);
  const copy = new Uint8Array(even);
  copy.set(bytes.subarray(0, even));
  return new Int16Array(copy.buffer);
}
