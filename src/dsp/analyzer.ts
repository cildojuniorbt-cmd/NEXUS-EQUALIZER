// NEXUS DSP — Audio Analyzer: FFT spectrum, peak/RMS meters, clipping detection, ITU-R BS.1770 LUFS.
import { Biquad, linToDb, type Coeffs } from './biquad.ts';

// ───────────── FFT (radix-2, in place) ─────────────
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

export function ifft(re: Float64Array, im: Float64Array): void {
  for (let i = 0; i < im.length; i++) im[i] = -im[i];
  fft(re, im);
  const n = re.length;
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
}

export const nextPow2 = (n: number): number => { let p = 1; while (p < n) p <<= 1; return p; };

export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
  return w;
}

/** Magnitude spectrum in dBFS (a full-scale sine reads ≈ 0 dB) for `size` input samples. */
export function spectrumDb(samples: ArrayLike<number>, size = 4096): Float64Array {
  const re = new Float64Array(size), im = new Float64Array(size), w = hann(size);
  let wsum = 0;
  for (let i = 0; i < size; i++) { const v = i < samples.length ? samples[i] : 0; re[i] = v * w[i]; wsum += w[i]; }
  fft(re, im);
  const out = new Float64Array(size / 2);
  for (let k = 0; k < size / 2; k++) out[k] = 20 * Math.log10(Math.max(2 * Math.hypot(re[k], im[k]) / wsum, 1e-9));
  return out;
}

/** Bin index → frequency. */
export const binFreq = (k: number, size: number, fs: number): number => k * fs / size;

/**
 * Level (dB) of the strongest peak within ±`tol` Hz of `freq`.
 * Uses log-parabolic interpolation around the peak bin to remove scalloping loss
 * (a Hann-windowed tone between bins would otherwise read up to ≈1.4 dB low).
 */
export function levelAt(spec: Float64Array, freq: number, size: number, fs: number, tol = 30): number {
  const lo = Math.max(1, Math.floor((freq - tol) * size / fs)), hi = Math.min(spec.length - 2, Math.ceil((freq + tol) * size / fs));
  let m = -200, km = lo;
  for (let k = lo; k <= hi; k++) if (spec[k] > m) { m = spec[k]; km = k; }
  if (km > 1 && km < spec.length - 1) {
    const a = spec[km - 1], b = spec[km], c = spec[km + 1], d = a - 2 * b + c;
    if (d < 0) return b - ((a - c) * (a - c)) / (8 * d);
  }
  return m;
}

// ───────────── Level meter ─────────────
export class LevelMeter {
  peak = 0; rms = 0; clipped = 0; held = 0;
  private fs: number; private rel: number;
  constructor(fs: number) { this.fs = fs; this.rel = Math.exp(-1 / (1.2 * fs)); }
  /** Processes one block; `peak`/`rms` describe that block. `held` falls at ≈ 1.2 s. */
  update(l: Float32Array, r: Float32Array, n: number, clipLevel = 0.9999): void {
    let p = 0, s = 0, c = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(l[i]), b = Math.abs(r[i]);
      if (a > p) p = a; if (b > p) p = b;
      s += l[i] * l[i] + r[i] * r[i];
      if (a >= clipLevel || b >= clipLevel) c++;
    }
    this.peak = p; this.rms = Math.sqrt(s / Math.max(2 * n, 1)); this.clipped += c;
    this.held = Math.max(p, this.held * Math.pow(this.rel, n));
  }
  get peakDb(): number { return linToDb(this.peak); }
  get rmsDb(): number { return linToDb(this.rms); }
  get heldDb(): number { return linToDb(this.held); }
  resetClip(): void { this.clipped = 0; }
}

// ───────────── Loudness (ITU-R BS.1770-4, K-weighting) ─────────────
/**
 * Exact K-weighting stage 1 (head-related high shelf) and stage 2 (RLB high-pass) for any sample rate.
 * The shelf topology differs from the RBJ cookbook shelf, so it is designed here from the analog
 * prototype parameters that reproduce the BS.1770 48 kHz coefficients.
 */
export function kWeighting(fs: number): { shelf: Coeffs; hp: Coeffs } {
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan(Math.PI * f0 / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf: Coeffs = {
    b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0,
    a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0,
  };
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773;
  K = Math.tan(Math.PI * f1 / fs);
  a0 = 1 + K / Q1 + K * K;
  const hp: Coeffs = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q1 + K * K) / a0 };
  return { shelf, hp };
}

export class LoudnessMeter {
  private kl: Biquad[]; private kr: Biquad[];
  private hop: number; private acc = 0; private count = 0;
  private hops: number[] = [];       // mean-square (summed channels) per 100 ms hop
  private blocks: number[] = [];     // 400 ms block mean-squares (75 % overlap)
  momentary = -Infinity;
  constructor(fs: number) {
    const { shelf, hp } = kWeighting(fs);
    this.kl = [new Biquad(), new Biquad()]; this.kr = [new Biquad(), new Biquad()];
    for (const f of [this.kl, this.kr]) { f[0].set(shelf); f[1].set(hp); }
    this.hop = Math.round(0.1 * fs);
  }
  update(l: Float32Array, r: Float32Array, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.kl[1].tick(this.kl[0].tick(l[i]));
      const b = this.kr[1].tick(this.kr[0].tick(r[i]));
      this.acc += a * a + b * b;
      if (++this.count === this.hop) {
        this.hops.push(this.acc / this.hop); this.acc = 0; this.count = 0;
        if (this.hops.length >= 4) {
          const m = (this.hops[this.hops.length - 1] + this.hops[this.hops.length - 2] + this.hops[this.hops.length - 3] + this.hops[this.hops.length - 4]) / 4;
          this.blocks.push(m);
          this.momentary = -0.691 + 10 * Math.log10(Math.max(m, 1e-12));
          if (this.blocks.length > 36000) this.blocks.shift();
        }
        if (this.hops.length > 8) this.hops.splice(0, this.hops.length - 8);
      }
    }
  }
  /** Gated integrated loudness (absolute −70 LUFS, relative −10 LU). −Infinity until enough audio. */
  get integrated(): number {
    const lufs = (ms: number) => -0.691 + 10 * Math.log10(Math.max(ms, 1e-12));
    const abs = this.blocks.filter(b => lufs(b) > -70);
    if (!abs.length) return -Infinity;
    const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const gated = abs.filter(b => lufs(b) > rel);
    if (!gated.length) return -Infinity;
    return lufs(gated.reduce((a, b) => a + b, 0) / gated.length);
  }
  reset(): void { this.hops = []; this.blocks = []; this.acc = 0; this.count = 0; this.momentary = -Infinity; this.kl.concat(this.kr).forEach(f => f.reset()); }
}

/** 1/3-octave band levels (dB) from a magnitude spectrum, for stable RTA-style display and room analysis. */
export function thirdOctaveBands(spec: Float64Array, size: number, fs: number, lo = 20, hi = 20000): { freq: number; db: number }[] {
  const out: { freq: number; db: number }[] = [];
  for (let f = lo; f <= hi * 1.001; f *= Math.pow(2, 1 / 3)) {
    const a = Math.max(1, Math.round(f / Math.pow(2, 1 / 6) * size / fs)), b = Math.min(spec.length - 1, Math.max(a, Math.round(f * Math.pow(2, 1 / 6) * size / fs)));
    let p = 0, c = 0;
    for (let k = a; k <= b; k++) { p += Math.pow(10, spec[k] / 10); c++; }
    out.push({ freq: f, db: 10 * Math.log10(Math.max(p / Math.max(c, 1), 1e-12)) });
  }
  return out;
}
