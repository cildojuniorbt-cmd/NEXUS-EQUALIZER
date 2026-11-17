// NEXUS DSP — biquad filters (RBJ cookbook). Pure TypeScript, no DOM/Web Audio dependency,
// so the exact same code runs in the AudioWorklet, in Node tests and can be ported 1:1 to Kotlin/Swift.

export type FilterType = 'peak' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'notch' | 'bandpass';

export interface Coeffs { b0: number; b1: number; b2: number; a1: number; a2: number }

export const IDENTITY: Coeffs = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };

export function clampFreq(freq: number, fs: number): number {
  return Math.min(Math.max(freq, 10), fs * 0.49);
}

/** Designs a normalised biquad (a0 = 1). gainDb is used by peak/shelf types only. */
export function designBiquad(type: FilterType, fs: number, freq: number, gainDb = 0, q = Math.SQRT1_2): Coeffs {
  const f = clampFreq(freq, fs);
  const qq = Math.max(q, 0.05);
  const w0 = 2 * Math.PI * f / fs;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * qq);
  const A = Math.pow(10, gainDb / 40);
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  switch (type) {
    case 'peak':
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cos + s);
      b1 = 2 * A * ((A - 1) - (A + 1) * cos);
      b2 = A * ((A + 1) - (A - 1) * cos - s);
      a0 = (A + 1) + (A - 1) * cos + s;
      a1 = -2 * ((A - 1) + (A + 1) * cos);
      a2 = (A + 1) + (A - 1) * cos - s;
      break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cos + s);
      b1 = -2 * A * ((A - 1) + (A + 1) * cos);
      b2 = A * ((A + 1) + (A - 1) * cos - s);
      a0 = (A + 1) - (A - 1) * cos + s;
      a1 = 2 * ((A - 1) - (A + 1) * cos);
      a2 = (A + 1) - (A - 1) * cos - s;
      break;
    }
    case 'lowpass':
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1; b1 = -2 * cos; b2 = 1;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'bandpass': // constant 0 dB peak gain
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Magnitude response in dB of a biquad at `freq`. */
export function magnitudeDb(c: Coeffs, freq: number, fs: number): number {
  const w = 2 * Math.PI * freq / fs;
  const cw = Math.cos(w), sw = Math.sin(w);
  const c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cw + c.b2 * c2;
  const ni = -(c.b1 * sw + c.b2 * s2);
  const dr = 1 + c.a1 * cw + c.a2 * c2;
  const di = -(c.a1 * sw + c.a2 * s2);
  const num = nr * nr + ni * ni;
  const den = dr * dr + di * di;
  return 10 * Math.log10(Math.max(num / Math.max(den, 1e-30), 1e-30));
}

/** Single-channel transposed direct form II biquad. */
export class Biquad {
  c: Coeffs = IDENTITY;
  private z1 = 0;
  private z2 = 0;
  set(c: Coeffs): void { this.c = c; }
  reset(): void { this.z1 = 0; this.z2 = 0; }
  tick(x: number): number {
    const c = this.c;
    const y = c.b0 * x + this.z1;
    this.z1 = c.b1 * x - c.a1 * y + this.z2;
    this.z2 = c.b2 * x - c.a2 * y;
    return y;
  }
  process(buf: Float32Array, n: number): void {
    const c = this.c;
    let z1 = this.z1, z2 = this.z2;
    for (let i = 0; i < n; i++) {
      const x = buf[i];
      const y = c.b0 * x + z1;
      z1 = c.b1 * x - c.a1 * y + z2;
      z2 = c.b2 * x - c.a2 * y;
      buf[i] = y;
    }
    this.z1 = z1; this.z2 = z2;
  }
}

export const dbToLin = (db: number): number => Math.pow(10, db / 20);
export const linToDb = (lin: number): number => 20 * Math.log10(Math.max(lin, 1e-12));
