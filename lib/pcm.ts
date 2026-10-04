const OUTPUT_RATE = 24000;

export function floatToPcm16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
    output[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return output;
}

export function pcm16ToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = input[i] ?? 0;
    output[i] = sample < 0 ? sample / 0x8000 : sample / 0x7fff;
  }
  return output;
}

/** Average-downsample mic audio to 24 kHz PCM16, the realtime default. */
export function downsampleToPcm16(input: Float32Array, inputRate: number, outputRate = OUTPUT_RATE): Int16Array {
  if (!Number.isFinite(inputRate) || inputRate <= 0 || input.length === 0) return new Int16Array();
  if (inputRate === outputRate) return floatToPcm16(input);
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const averaged = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] ?? 0;
    averaged[i] = sum / (end - start);
  }
  return floatToPcm16(averaged);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return bytesToBase64(bytes);
}

export function base64ToPcm16(value: string): Int16Array {
  const bytes = base64ToBytes(value);
  const even = bytes.byteLength - (bytes.byteLength % 2);
  const copy = bytes.slice(0, even);
  return new Int16Array(copy.buffer, copy.byteOffset, even / 2);
}
