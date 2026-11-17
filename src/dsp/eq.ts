// NEXUS DSP — Equalizer Studio engine: graphic (10/15/31) and parametric stages.
import { Biquad, designBiquad, magnitudeDb, dbToLin, type Coeffs, type FilterType } from './biquad.ts';

export interface EqBand {
  type: FilterType;
  freq: number;
  gainDb: number;
  q: number;
  enabled: boolean;
}

export type GraphicLayout = 10 | 15 | 31;

export const GRAPHIC_FREQS: Record<GraphicLayout, number[]> = {
  10: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
  31: [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000],
};

/** Q of a constant-bandwidth peak filter spanning `octaves`. */
export function qFromOctaves(octaves: number): number {
  const p = Math.pow(2, octaves);
  return Math.sqrt(p) / (p - 1);
}

export const GRAPHIC_Q: Record<GraphicLayout, number> = {
  10: qFromOctaves(1),
  15: qFromOctaves(2 / 3),
  31: qFromOctaves(1 / 3),
};

export function graphicBands(layout: GraphicLayout, gains: number[]): EqBand[] {
  const freqs = GRAPHIC_FREQS[layout];
  return freqs.map((freq, i) => ({ type: 'peak', freq, gainDb: gains[i] ?? 0, q: GRAPHIC_Q[layout], enabled: true }));
}

export function defaultParametricBands(): EqBand[] {
  return [
    { type: 'highpass', freq: 20, gainDb: 0, q: Math.SQRT1_2, enabled: false },
    { type: 'lowshelf', freq: 100, gainDb: 0, q: 0.71, enabled: true },
    { type: 'peak', freq: 250, gainDb: 0, q: 1, enabled: true },
    { type: 'peak', freq: 1000, gainDb: 0, q: 1, enabled: true },
    { type: 'peak', freq: 3500, gainDb: 0, q: 1, enabled: true },
    { type: 'highshelf', freq: 8000, gainDb: 0, q: 0.71, enabled: true },
    { type: 'lowpass', freq: 20000, gainDb: 0, q: Math.SQRT1_2, enabled: false },
  ];
}

function isActive(b: EqBand): boolean {
  if (!b.enabled) return false;
  // Gain-less filter types are active whenever enabled; gain types are skipped at 0 dB.
  if (b.type === 'peak' || b.type === 'lowshelf' || b.type === 'highshelf') return Math.abs(b.gainDb) > 1e-3;
  return true;
}

/** Stereo cascade of biquads + pre-amplifier. */
export class ParametricEQ {
  private fs: number;
  private bands: EqBand[] = [];
  private coeffs: Coeffs[] = [];
  private left: Biquad[] = [];
  private right: Biquad[] = [];
  preampDb = 0;
  private preamp = 1;

  constructor(fs: number) { this.fs = fs; }

  setSampleRate(fs: number): void { this.fs = fs; this.setBands(this.bands); }

  setPreamp(db: number): void { this.preampDb = db; this.preamp = dbToLin(db); }

  setBands(bands: EqBand[]): void {
    this.bands = bands.map(b => ({ ...b }));
    const active = this.bands.filter(isActive);
    this.coeffs = active.map(b => designBiquad(b.type, this.fs, b.freq, b.gainDb, b.q));
    while (this.left.length < this.coeffs.length) { this.left.push(new Biquad()); this.right.push(new Biquad()); }
    this.left.length = this.coeffs.length;
    this.right.length = this.coeffs.length;
    this.coeffs.forEach((c, i) => { this.left[i].set(c); this.right[i].set(c); });
  }

  get activeStages(): number { return this.coeffs.length; }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const g = this.preamp;
    if (g !== 1) for (let i = 0; i < n; i++) { l[i] *= g; r[i] *= g; }
    for (let s = 0; s < this.coeffs.length; s++) { this.left[s].process(l, n); this.right[s].process(r, n); }
  }

  /** Combined response (preamp included) in dB at each frequency. */
  responseDb(freqs: number[]): number[] {
    return freqs.map(f => this.coeffs.reduce((acc, c) => acc + magnitudeDb(c, f, this.fs), this.preampDb));
  }
}

/** Response of an arbitrary band list without needing a processor instance. */
export function responseOfBands(bands: EqBand[], freqs: number[], fs: number, preampDb = 0): number[] {
  const cs = bands.filter(isActive).map(b => designBiquad(b.type, fs, b.freq, b.gainDb, b.q));
  return freqs.map(f => cs.reduce((acc, c) => acc + magnitudeDb(c, f, fs), preampDb));
}

export function logFreqs(n = 128, lo = 20, hi = 20000): number[] {
  return Array.from({ length: n }, (_, i) => lo * Math.pow(hi / lo, i / (n - 1)));
}

/** Largest positive gain of a band list — used by the safety layer to compute headroom. */
export function peakBoostDb(bands: EqBand[], fs: number): number {
  const curve = responseOfBands(bands, logFreqs(256), fs);
  return Math.max(0, ...curve);
}
