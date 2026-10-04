import { downsampleToPcm16, pcm16ToFloat32 } from "./pcm";

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextTime = 0;
  private pending = 0;

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.context();
    if (ctx.state === "suspended") await ctx.resume();
  }

  enqueue(pcm: Int16Array): void {
    if (pcm.length === 0) return;
    const ctx = this.context();
    // Voice off closes the context. The next reply has to resume the new one.
    if (ctx.state === "suspended") void ctx.resume();
    const floats = pcm16ToFloat32(pcm);
    const buffer = ctx.createBuffer(1, floats.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < floats.length; i++) channel[i] = floats[i] ?? 0;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const start = Math.max(ctx.currentTime + 0.02, this.nextTime);
    source.start(start);
    this.nextTime = start + buffer.duration;
    this.pending += 1;
    source.onended = () => {
      this.pending = Math.max(0, this.pending - 1);
    };
  }

  whenIdle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        if (this.pending === 0 || Date.now() - started > 8000) resolve();
        else setTimeout(check, 40);
      };
      check();
    });
  }

  stop(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.nextTime = 0;
    this.pending = 0;
  }
}

export async function captureMicrophone(
  onPcm: (pcm: Int16Array) => void,
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const silent = ctx.createGain();
  silent.gain.value = 0;
  silent.connect(ctx.destination);

  const stopTracks = () => {
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void ctx.close();
  };

  try {
    await ctx.audioWorklet.addModule("/pcm-capture-processor.js");
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const pcm = downsampleToPcm16(event.data, ctx.sampleRate, 24000);
      if (pcm.length) onPcm(pcm);
    };
    source.connect(node);
    node.connect(silent);
    return () => {
      node.disconnect();
      node.port.onmessage = null;
      stopTracks();
    };
  } catch {
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      const pcm = downsampleToPcm16(event.inputBuffer.getChannelData(0), ctx.sampleRate, 24000);
      if (pcm.length) onPcm(pcm);
    };
    source.connect(processor);
    processor.connect(silent);
    return () => {
      processor.disconnect();
      processor.onaudioprocess = null;
      stopTracks();
    };
  }
}
