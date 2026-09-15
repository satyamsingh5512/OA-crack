/** RMS voice-activity detection over 16kHz mono PCM. */
export function rmsEnergy(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

export function isSpeech(samples: Float32Array, threshold = 0.02): boolean {
  return rmsEnergy(samples) > threshold;
}

/** Downsample Float32 @ fromRate to 16kHz mono PCM16. */
export function downsampleTo16k(input: Float32Array, fromRate: number): Int16Array {
  const target = 16000;
  if (fromRate === target) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
    return out;
  }
  const ratio = fromRate / target;
  const len = Math.floor(input.length / ratio);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const s = input[Math.floor(i * ratio)] ?? 0;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
  }
  return out;
}

export interface AudioPipelineOptions {
  sampleRate?: number;
  chunkMs?: number;
  vadThreshold?: number;
  onChunk?: (pcm16: Int16Array) => void;
  onLevel?: (level: number) => void;
}

/** Microphone capture with AudioWorklet-free ScriptProcessor fallback.
 *  System-audio (WASAPI loopback) is added via native addon where supported;
 *  this module handles the mic path + DSP contract so both share VAD/chunking. */
export class MicPipeline {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private proc: ScriptProcessorNode | null = null;
  private running = false;

  async start(opts: AudioPipelineOptions = {}): Promise<void> {
    if (this.running) return;
    const { chunkMs = 250, vadThreshold = 0.02, onChunk, onLevel } = opts;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.ctx = new AudioContext({ sampleRate: opts.sampleRate ?? 16000 });
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
    let carry = new Float32Array(0);
    const perChunk = Math.floor((this.ctx.sampleRate * chunkMs) / 1000);
    this.proc.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      onLevel?.(rmsEnergy(input));
      const merged = new Float32Array(carry.length + input.length);
      merged.set(carry); merged.set(input, carry.length);
      let offset = 0;
      while (merged.length - offset >= perChunk) {
        const slice = merged.slice(offset, offset + perChunk);
        offset += perChunk;
        if (!isSpeech(slice, vadThreshold)) continue;
        onChunk?.(downsampleTo16k(slice, this.ctx?.sampleRate ?? 16000));
      }
      carry = merged.slice(offset);
    };
    src.connect(this.proc);
    this.proc.connect(this.ctx.destination);
    this.running = true;
  }

  async stop(): Promise<void> {
    this.proc?.disconnect();
    this.proc = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.running = false;
  }

  get isRunning(): boolean { return this.running; }
}
