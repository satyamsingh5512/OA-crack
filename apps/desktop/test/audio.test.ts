import { describe, it, expect } from 'vitest';
import { rmsEnergy, isSpeech, downsampleTo16k } from '../src/audio/pipeline';

describe('audio DSP', () => {
  it('rms of silence is ~0', () => {
    expect(rmsEnergy(new Float32Array(1024))).toBe(0);
  });
  it('detects speech vs silence', () => {
    const loud = new Float32Array(512).fill(0.5);
    expect(isSpeech(loud)).toBe(true);
    expect(isSpeech(new Float32Array(512))).toBe(false);
  });
  it('downsamples 48k to 16k mono PCM16', () => {
    const input = new Float32Array(4800).fill(0.25);
    const out = downsampleTo16k(input, 48000);
    expect(out.length).toBe(1600);
    expect(out[0]).toBe(Math.round(0.25 * 32767));
  });
});
