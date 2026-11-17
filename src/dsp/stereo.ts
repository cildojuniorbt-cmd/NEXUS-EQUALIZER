// NEXUS DSP — Stereo Studio (width, mid/side, balance, mono, phase) and headphone crossfeed.
import { Biquad, designBiquad, dbToLin } from './biquad.ts';

export interface StereoParams {
  width: number;       // 0 = mono, 1 = original, 2 = double width
  midDb: number;
  sideDb: number;
  balance: number;     // −1 (left) … +1 (right)
  leftDb: number;
  rightDb: number;
  invertLeft: boolean;
  invertRight: boolean;
  swap: boolean;
  mono: boolean;       // forces mono (compatibility check)
  crossfeed: number;   // 0..1 amount (headphones)
  crossfeedHz: number; // low-pass corner of the cross path
}

export const DEFAULT_STEREO: StereoParams = {
  width: 1, midDb: 0, sideDb: 0, balance: 0, leftDb: 0, rightDb: 0,
  invertLeft: false, invertRight: false, swap: false, mono: false, crossfeed: 0, crossfeedHz: 700,
};

export class StereoProcessor {
  private fs: number;
  p: StereoParams = { ...DEFAULT_STEREO };
  private cfL = new Biquad(); private cfR = new Biquad();
  private dl: Float32Array; private dr: Float32Array; private di = 0;

  constructor(fs: number) {
    this.fs = fs;
    const d = Math.max(1, Math.round(0.00027 * fs)); // ≈ 0.27 ms interaural delay
    this.dl = new Float32Array(d); this.dr = new Float32Array(d);
    this.set({});
  }

  set(p: Partial<StereoParams>): void {
    this.p = { ...this.p, ...p };
    const c = designBiquad('lowpass', this.fs, this.p.crossfeedHz, 0, Math.SQRT1_2);
    this.cfL.set(c); this.cfR.set(c);
  }

  /** True when the processor changes nothing (used so bypass stays bit-transparent). */
  get isNeutral(): boolean {
    const p = this.p;
    return p.width === 1 && p.midDb === 0 && p.sideDb === 0 && p.balance === 0 && p.leftDb === 0 && p.rightDb === 0 &&
      !p.invertLeft && !p.invertRight && !p.swap && !p.mono && p.crossfeed === 0;
  }

  reset(): void { this.cfL.reset(); this.cfR.reset(); this.dl.fill(0); this.dr.fill(0); this.di = 0; }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const p = this.p;
    if (this.isNeutral) return;
    const midG = dbToLin(p.midDb), sideG = dbToLin(p.sideDb) * p.width;
    const gl = dbToLin(p.leftDb) * (p.balance > 0 ? 1 - p.balance : 1) * (p.invertLeft ? -1 : 1);
    const gr = dbToLin(p.rightDb) * (p.balance < 0 ? 1 + p.balance : 1) * (p.invertRight ? -1 : 1);
    const cf = p.crossfeed, norm = 1 / (1 + cf * 0.5), D = this.dl.length;
    for (let i = 0; i < n; i++) {
      let a = p.swap ? r[i] : l[i];
      let b = p.swap ? l[i] : r[i];
      a *= gl; b *= gr;
      let m = (a + b) * 0.5, s = (a - b) * 0.5;
      if (p.mono) s = 0;
      m *= midG; s *= sideG;
      a = m + s; b = m - s;
      if (cf > 0) {
        const xl = this.cfL.tick(this.dr[this.di]);   // right → left, delayed + low-passed
        const xr = this.cfR.tick(this.dl[this.di]);
        this.dl[this.di] = a; this.dr[this.di] = b;
        this.di = (this.di + 1) % D;
        a = (a + cf * xl) * norm; b = (b + cf * xr) * norm;
      }
      l[i] = a; r[i] = b;
    }
  }
}

/** Running phase-correlation (−1…+1) and mono-compatibility loss. */
export class CorrelationMeter {
  private k: number;
  private ll = 1e-12; private rr = 1e-12; private lr = 0; private mm = 1e-12;
  constructor(fs: number, windowMs = 300) { this.k = Math.exp(-1 / (windowMs * 0.001 * fs)); }
  update(l: Float32Array, r: Float32Array, n: number): void {
    const k = this.k;
    for (let i = 0; i < n; i++) {
      const a = l[i], b = r[i], m = (a + b) * 0.5;
      this.ll = k * this.ll + (1 - k) * a * a;
      this.rr = k * this.rr + (1 - k) * b * b;
      this.lr = k * this.lr + (1 - k) * a * b;
      this.mm = k * this.mm + (1 - k) * m * m;
    }
  }
  get correlation(): number { return Math.max(-1, Math.min(1, this.lr / Math.sqrt(this.ll * this.rr))); }
  /** Level change (dB) when the signal is summed to mono; strongly negative ⇒ phase problems. */
  get monoLossDb(): number { return 10 * Math.log10(this.mm / Math.max((this.ll + this.rr) / 2, 1e-12)); }
  /** Sustained negative correlation usually means one channel is polarity-inverted. */
  get phaseInverted(): boolean { return this.correlation < -0.5 && this.ll + this.rr > 1e-6; }
}
