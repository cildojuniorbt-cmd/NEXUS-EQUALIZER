import { NexusEngine } from '../src/dsp/chain.ts';
import { defaultConfig, type NexusConfig } from '../src/dsp/config.ts';
import { spectrumDb, levelAt } from '../src/dsp/analyzer.ts';

export const FS = 48000;

export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const sine = (freq: number, amp: number, seconds: number, fs = FS, phase = 0): Float32Array => {
  const n = Math.round(seconds * fs), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * i / fs + phase);
  return out;
};

export const noise = (amp: number, seconds: number, seed = 7, fs = FS): Float32Array => {
  const r = rng(seed), n = Math.round(seconds * fs), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * (r() * 2 - 1);
  return out;
};

export const rms = (x: ArrayLike<number>, from = 0, to = x.length): number => {
  let s = 0; for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(to - from, 1));
};
export const db = (x: number): number => 20 * Math.log10(Math.max(x, 1e-12));
export const peak = (x: ArrayLike<number>, from = 0, to = x.length): number => { let m = 0; for (let i = from; i < to; i++) m = Math.max(m, Math.abs(x[i])); return m; };

export function configWith(...mutators: ((c: NexusConfig) => void)[]): NexusConfig {
  const c = defaultConfig();
  for (const m of mutators) m(c);
  return c;
}

/** Runs a stereo signal through a fresh engine in 480-sample blocks. */
export function run(cfg: NexusConfig, l: Float32Array, r: Float32Array, block = 480, fs = FS): { l: Float32Array; r: Float32Array; engine: NexusEngine } {
  const engine = new NexusEngine(fs, cfg);
  const ol = new Float32Array(l.length), or = new Float32Array(r.length);
  for (let i = 0; i < l.length; i += block) {
    const n = Math.min(block, l.length - i);
    engine.process(l.subarray(i, i + n), r.subarray(i, i + n), ol.subarray(i, i + n), or.subarray(i, i + n), n);
  }
  return { l: ol, r: or, engine };
}

/** Level (dBFS) of a pure tone in a signal, measured in the settled second half. */
export function toneLevelDb(x: Float32Array, freq: number, fs = FS): number {
  const size = 16384, start = Math.max(0, x.length - size - 1000);
  const spec = spectrumDb(x.subarray(start, start + size), size);
  return levelAt(spec, freq, size, fs, 25);
}

/** Speech-like stereo test signal: modulated noise + sibilant bursts + hum, with quiet gaps. */
export function programme(seconds = 3, fs = FS): { l: Float32Array; r: Float32Array } {
  const n = Math.round(seconds * fs), l = new Float32Array(n), r = new Float32Array(n);
  const a = rng(11), b = rng(23);
  let lp1 = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const env = 0.03 + 0.5 * Math.max(0, Math.sin(2 * Math.PI * 2 * t)) ** 2;
    const common = a() * 2 - 1, side = b() * 2 - 1;
    lp1 += 0.3 * (common - lp1); lp2 += 0.3 * (side - lp2);
    const hum = 0.05 * Math.sin(2 * Math.PI * 60 * t) + 0.12 * Math.sin(2 * Math.PI * 440 * t);
    const sib = (t % 0.5) < 0.05 ? 0.25 * Math.sin(2 * Math.PI * 7000 * t) : 0;
    l[i] = env * (0.6 * lp1 + 0.4 * lp2) + hum + sib;
    r[i] = env * (0.6 * lp1 - 0.4 * lp2) + hum * 0.8 + sib;
  }
  return { l, r };
}

export const maxDiff = (a: Float32Array, b: Float32Array): number => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
