// NEXUS DSP — Dynamics Studio: compressor, multiband compressor, limiter, gate/expander,
// de-esser, harmonic saturation and exciter. All processors are stereo-linked and in-place.
import { Biquad, designBiquad, dbToLin, linToDb, type FilterType } from './biquad.ts';

const timeCoef = (ms: number, fs: number): number => Math.exp(-1 / (Math.max(ms, 0.01) * 0.001 * fs));

// ───────────────────────── Compressor ─────────────────────────
export interface CompressorParams {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  kneeDb: number;
  makeupDb: number;
}

export const DEFAULT_COMPRESSOR: CompressorParams = {
  thresholdDb: -18, ratio: 4, attackMs: 10, releaseMs: 120, kneeDb: 6, makeupDb: 0,
};

/** Static gain curve: returns output level (dB) for an input level (dB). Soft knee. */
export function compressorCurve(xDb: number, p: CompressorParams): number {
  const over = xDb - p.thresholdDb;
  const w = Math.max(p.kneeDb, 0);
  if (2 * over < -w) return xDb;
  if (w > 0 && 2 * Math.abs(over) <= w) {
    return xDb + (1 / p.ratio - 1) * Math.pow(over + w / 2, 2) / (2 * w);
  }
  return p.thresholdDb + over / p.ratio;
}

export class Compressor {
  private fs: number;
  p: CompressorParams = { ...DEFAULT_COMPRESSOR };
  private env = 0;
  private att = 0;
  private rel = 0;
  /** Largest gain reduction (negative dB) seen in the last processed block — for the GR meter. */
  grDb = 0;

  constructor(fs: number, p?: Partial<CompressorParams>) { this.fs = fs; this.set(p ?? {}); }

  set(p: Partial<CompressorParams>): void {
    this.p = { ...this.p, ...p };
    this.p.ratio = Math.max(this.p.ratio, 1);
    this.att = timeCoef(this.p.attackMs, this.fs);
    this.rel = timeCoef(this.p.releaseMs, this.fs);
  }

  reset(): void { this.env = 0; this.grDb = 0; }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const p = this.p;
    const makeup = p.makeupDb;
    let minEnv = 0;
    for (let i = 0; i < n; i++) {
      const peak = Math.max(Math.abs(l[i]), Math.abs(r[i]));
      const x = 20 * Math.log10(peak + 1e-9);
      const target = compressorCurve(x, p) - x; // ≤ 0
      const c = target < this.env ? this.att : this.rel;
      this.env = c * this.env + (1 - c) * target;
      if (this.env < minEnv) minEnv = this.env;
      const g = Math.pow(10, (this.env + makeup) / 20);
      l[i] *= g; r[i] *= g;
    }
    this.grDb = minEnv;
  }
}

// ───────────────────────── Downward expander / gate ─────────────────────────
export interface ExpanderParams {
  thresholdDb: number;
  ratio: number;     // 1 = off, 2 = gentle expander, 20+ = gate
  attackMs: number;
  releaseMs: number;
  holdMs: number;
  rangeDb: number;   // maximum attenuation (positive number)
}

export const DEFAULT_GATE: ExpanderParams = { thresholdDb: -55, ratio: 20, attackMs: 1, releaseMs: 120, holdMs: 40, rangeDb: 60 };
export const DEFAULT_EXPANDER: ExpanderParams = { thresholdDb: -45, ratio: 2, attackMs: 5, releaseMs: 150, holdMs: 0, rangeDb: 24 };

export class DownwardExpander {
  private fs: number;
  p: ExpanderParams;
  private env = 0;
  private hold = 0;
  private att = 0;
  private rel = 0;
  private det = 0;
  private detRel = 0;
  grDb = 0;

  constructor(fs: number, p: ExpanderParams) { this.fs = fs; this.p = { ...p }; this.set({}); }

  set(p: Partial<ExpanderParams>): void {
    this.p = { ...this.p, ...p };
    this.att = timeCoef(this.p.attackMs, this.fs);
    this.rel = timeCoef(this.p.releaseMs, this.fs);
    this.detRel = timeCoef(8, this.fs); // peak-hold detector: stable level for low-frequency waveforms
  }

  reset(): void { this.env = 0; this.hold = 0; this.det = 0; this.grDb = 0; }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const p = this.p;
    const holdSamples = Math.round(p.holdMs * 0.001 * this.fs);
    let minEnv = 0;
    for (let i = 0; i < n; i++) {
      const inst = Math.max(Math.abs(l[i]), Math.abs(r[i]));
      this.det = Math.max(inst, this.det * this.detRel);
      const x = 20 * Math.log10(this.det + 1e-9);
      let target = 0;
      if (x < p.thresholdDb) target = Math.max((x - p.thresholdDb) * (p.ratio - 1), -p.rangeDb);
      if (target === 0) this.hold = holdSamples;
      else if (this.hold > 0) { this.hold--; target = 0; }
      // opening (gain rising) uses attack, closing uses release
      const c = target > this.env ? this.att : this.rel;
      this.env = c * this.env + (1 - c) * target;
      if (this.env < minEnv) minEnv = this.env;
      const g = Math.pow(10, this.env / 20);
      l[i] *= g; r[i] *= g;
    }
    this.grDb = minEnv;
  }
}

// ───────────────────────── Lookahead brick-wall limiter ─────────────────────────
export interface LimiterParams {
  thresholdDb: number; // level where limiting begins; signal is pushed up by (ceiling − threshold)
  ceilingDb: number;   // absolute output ceiling (sample peak)
  releaseMs: number;
}

export const DEFAULT_LIMITER: LimiterParams = { thresholdDb: -0.3, ceilingDb: -0.3, releaseMs: 80 };

/**
 * Lookahead limiter. Gain = boxcar(release-smoothed sliding-window minimum of the needed gain),
 * with the audio delayed by L−1 samples, which mathematically guarantees |out| ≤ ceiling.
 */
export class Limiter {
  private fs: number;
  p: LimiterParams = { ...DEFAULT_LIMITER };
  readonly lookahead: number;
  private dl: Float32Array; private dr: Float32Array; private di = 0;
  private dqVal: Float64Array; private dqPos: Float64Array; private head = 0; private tail = 0; private t = 0;
  private box: Float64Array; private boxIdx = 0; private boxSum: number;
  private rEnv = 1;
  private relCoef = 0;
  private pre = 1;
  private ceilLin = 1;
  grDb = 0;

  constructor(fs: number, p?: Partial<LimiterParams>, lookaheadMs = 1.5) {
    this.fs = fs;
    this.lookahead = Math.max(2, Math.round(lookaheadMs * 0.001 * fs));
    const L = this.lookahead;
    this.dl = new Float32Array(L - 1); this.dr = new Float32Array(L - 1);
    this.dqVal = new Float64Array(L + 2); this.dqPos = new Float64Array(L + 2);
    this.box = new Float64Array(L).fill(1); this.boxSum = L;
    this.set(p ?? {});
  }

  /** Latency in samples introduced by the lookahead. */
  get latency(): number { return this.lookahead - 1; }

  set(p: Partial<LimiterParams>): void {
    this.p = { ...this.p, ...p };
    this.ceilLin = dbToLin(this.p.ceilingDb);
    this.pre = dbToLin(Math.max(this.p.ceilingDb - this.p.thresholdDb, 0));
    this.relCoef = timeCoef(this.p.releaseMs, this.fs);
  }

  reset(): void {
    this.dl.fill(0); this.dr.fill(0); this.di = 0;
    this.head = 0; this.tail = 0; this.t = 0;
    this.box.fill(1); this.boxSum = this.lookahead; this.rEnv = 1; this.grDb = 0;
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const L = this.lookahead, D = L - 1, cap = L + 2;
    const ceil = this.ceilLin, pre = this.pre, rc = this.relCoef;
    let minGain = 1;
    for (let i = 0; i < n; i++) {
      const xl = l[i] * pre, xr = r[i] * pre;
      const peak = Math.max(Math.abs(xl), Math.abs(xr));
      const need = peak > ceil ? ceil / peak : 1;
      // sliding-window minimum over the last L samples (monotonic deque)
      while (this.tail > this.head && this.dqVal[(this.tail - 1) % cap] >= need) this.tail--;
      this.dqVal[this.tail % cap] = need; this.dqPos[this.tail % cap] = this.t; this.tail++;
      while (this.dqPos[this.head % cap] <= this.t - L) this.head++;
      const w = this.dqVal[this.head % cap];
      this.t++;
      // instant attack, exponential release (never exceeds w, so the guarantee holds)
      this.rEnv = w < this.rEnv ? w : w + (this.rEnv - w) * rc;
      // boxcar average over L samples smooths the attack ramp
      this.boxSum += this.rEnv - this.box[this.boxIdx];
      this.box[this.boxIdx] = this.rEnv;
      this.boxIdx = (this.boxIdx + 1) % L;
      const g = this.boxSum / L;
      if (g < minGain) minGain = g;
      // delayed audio
      const yl = this.dl[this.di], yr = this.dr[this.di];
      this.dl[this.di] = xl; this.dr[this.di] = xr;
      this.di = (this.di + 1) % D;
      let ol = yl * g, or = yr * g;
      if (ol > ceil) ol = ceil; else if (ol < -ceil) ol = -ceil; // float-rounding safety net
      if (or > ceil) or = ceil; else if (or < -ceil) or = -ceil;
      l[i] = ol; r[i] = or;
    }
    this.grDb = linToDb(minGain);
  }
}

// ───────────────────────── De-esser (split-band) ─────────────────────────
export interface DeEsserParams {
  freq: number;
  q: number;
  thresholdDb: number;
  ratio: number;
  releaseMs: number;
}
export const DEFAULT_DEESSER: DeEsserParams = { freq: 6500, q: 1.8, thresholdDb: -32, ratio: 4, releaseMs: 40 };

export class DeEsser {
  private fs: number;
  p: DeEsserParams = { ...DEFAULT_DEESSER };
  private bl = new Biquad(); private br = new Biquad();
  private det = 0; private env = 0; private detA = 0; private detR = 0; private rel = 0;
  grDb = 0;

  constructor(fs: number, p?: Partial<DeEsserParams>) { this.fs = fs; this.set(p ?? {}); }

  set(p: Partial<DeEsserParams>): void {
    this.p = { ...this.p, ...p };
    const c = designBiquad('bandpass', this.fs, this.p.freq, 0, this.p.q);
    this.bl.set(c); this.br.set(c);
    this.detA = timeCoef(0.5, this.fs);
    this.detR = timeCoef(8, this.fs);
    this.rel = timeCoef(this.p.releaseMs, this.fs);
  }

  reset(): void { this.bl.reset(); this.br.reset(); this.det = 0; this.env = 0; this.grDb = 0; }

  process(l: Float32Array, r: Float32Array, n: number): void {
    const p = this.p;
    const slope = 1 - 1 / Math.max(p.ratio, 1);
    let minEnv = 0;
    for (let i = 0; i < n; i++) {
      const lb = this.bl.tick(l[i]), rb = this.br.tick(r[i]);
      const a = Math.max(Math.abs(lb), Math.abs(rb));
      const c = a > this.det ? this.detA : this.detR;
      this.det = c * this.det + (1 - c) * a;
      const x = 20 * Math.log10(this.det + 1e-9);
      const target = x > p.thresholdDb ? -(x - p.thresholdDb) * slope : 0;
      const k = target < this.env ? this.detA : this.rel;
      this.env = k * this.env + (1 - k) * target;
      if (this.env < minEnv) minEnv = this.env;
      const g = Math.pow(10, this.env / 20);
      l[i] = (l[i] - lb) + lb * g;
      r[i] = (r[i] - rb) + rb * g;
    }
    this.grDb = minEnv;
  }
}

// ───────────────────────── Saturation & exciter ─────────────────────────
/** Soft saturation, unity small-signal gain. amount 0..1 maps to drive 1..12. */
export class Saturator {
  amount = 0;
  mix = 1;
  process(l: Float32Array, r: Float32Array, n: number): void {
    if (this.amount <= 0) return;
    const k = 1 + this.amount * 11;
    const mix = this.mix, dry = 1 - mix;
    for (let i = 0; i < n; i++) {
      l[i] = dry * l[i] + mix * Math.tanh(k * l[i]) / k;
      r[i] = dry * r[i] + mix * Math.tanh(k * r[i]) / k;
    }
  }
}

/** High-band harmonic exciter: HPF → asymmetric saturation → blended back into the dry signal. */
export class Exciter {
  private fs: number;
  amount = 0;      // 0..1
  freq = 3000;
  private hl = new Biquad(); private hr = new Biquad();
  private l2 = new Biquad(); private r2 = new Biquad();
  constructor(fs: number) { this.fs = fs; this.setFreq(3000); }
  setFreq(f: number): void {
    this.freq = f;
    const c = designBiquad('highpass', this.fs, f, 0, Math.SQRT1_2);
    this.hl.set(c); this.hr.set(c); this.l2.set(c); this.r2.set(c);
  }
  reset(): void { this.hl.reset(); this.hr.reset(); this.l2.reset(); this.r2.reset(); }
  process(l: Float32Array, r: Float32Array, n: number): void {
    if (this.amount <= 0) return;
    const a = this.amount * 0.6, bias = 0.15, off = Math.tanh(bias * 4);
    for (let i = 0; i < n; i++) {
      const hl = this.l2.tick(this.hl.tick(l[i])), hr = this.r2.tick(this.hr.tick(r[i]));
      l[i] += a * (Math.tanh(4 * hl + bias * 4) - off) * 0.5;
      r[i] += a * (Math.tanh(4 * hr + bias * 4) - off) * 0.5;
    }
  }
}

// ───────────────────────── Multiband compressor (3 bands, LR4) ─────────────────────────
class LR4 {
  private a: Biquad[] = [new Biquad(), new Biquad()];
  private b: Biquad[] = [new Biquad(), new Biquad()];
  private type: FilterType;
  constructor(type: 'lowpass' | 'highpass') { this.type = type; }
  set(fs: number, f: number): void {
    const c = designBiquad(this.type, fs, f, 0, Math.SQRT1_2);
    this.a.forEach(x => x.set(c)); this.b.forEach(x => x.set(c));
  }
  reset(): void { this.a.forEach(x => x.reset()); this.b.forEach(x => x.reset()); }
  run(il: Float32Array, ir: Float32Array, ol: Float32Array, or: Float32Array, n: number): void {
    ol.set(il.subarray(0, n)); or.set(ir.subarray(0, n));
    this.a[0].process(ol, n); this.a[1].process(ol, n);
    this.b[0].process(or, n); this.b[1].process(or, n);
  }
}

export interface BandParams extends CompressorParams { gainDb: number; mute: boolean; solo: boolean }
export interface MultibandParams {
  crossLow: number;   // Hz, low/mid split
  crossHigh: number;  // Hz, mid/high split
  low: BandParams;
  mid: BandParams;
  high: BandParams;
  outputDb: number;
}

const band = (t: number, r: number, a: number, rel: number): BandParams =>
  ({ thresholdDb: t, ratio: r, attackMs: a, releaseMs: rel, kneeDb: 6, makeupDb: 0, gainDb: 0, mute: false, solo: false });

export const DEFAULT_MULTIBAND: MultibandParams = {
  crossLow: 200, crossHigh: 2500,
  low: band(-20, 3, 25, 200), mid: band(-20, 2.5, 12, 150), high: band(-22, 2.5, 4, 90),
  outputDb: 0,
};

export class MultibandCompressor {
  private fs: number;
  p: MultibandParams;
  private lp1 = new LR4('lowpass'); private hp1 = new LR4('highpass');
  private lp2 = new LR4('lowpass'); private hp2 = new LR4('highpass');
  private ap2lp = new LR4('lowpass'); private ap2hp = new LR4('highpass');
  readonly comps: [Compressor, Compressor, Compressor];
  private buf: Float32Array[] = [];
  private cap = 0;
  get grDb(): [number, number, number] { return [this.comps[0].grDb, this.comps[1].grDb, this.comps[2].grDb]; }

  constructor(fs: number, p?: Partial<MultibandParams>) {
    this.fs = fs;
    this.p = { ...DEFAULT_MULTIBAND, ...p };
    this.comps = [new Compressor(fs), new Compressor(fs), new Compressor(fs)];
    this.set({});
  }

  set(p: Partial<MultibandParams>): void {
    this.p = { ...this.p, ...p };
    const { crossLow, crossHigh } = this.p;
    this.lp1.set(this.fs, crossLow); this.hp1.set(this.fs, crossLow);
    this.lp2.set(this.fs, crossHigh); this.hp2.set(this.fs, crossHigh);
    this.ap2lp.set(this.fs, crossHigh); this.ap2hp.set(this.fs, crossHigh);
    this.comps[0].set(this.p.low); this.comps[1].set(this.p.mid); this.comps[2].set(this.p.high);
  }

  reset(): void {
    [this.lp1, this.hp1, this.lp2, this.hp2, this.ap2lp, this.ap2hp].forEach(x => x.reset());
    this.comps.forEach(c => c.reset());
  }

  private ensure(n: number): void {
    if (n <= this.cap) return;
    this.cap = n;
    this.buf = Array.from({ length: 12 }, () => new Float32Array(n));
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    this.ensure(n);
    const [lowL, lowR, hiL, hiR, midL, midR, highL, highR, apAL, apAR, apBL, apBR] = this.buf;
    // low = LP(f1); rest = HP(f1)
    this.lp1.run(l, r, lowL, lowR, n);
    this.hp1.run(l, r, hiL, hiR, n);
    // rest → mid = LP(f2), high = HP(f2)
    this.lp2.run(hiL, hiR, midL, midR, n);
    this.hp2.run(hiL, hiR, highL, highR, n);
    // phase-align the low band with an all-pass at f2 (LP4 + HP4 of the same corner)
    this.ap2lp.run(lowL, lowR, apAL, apAR, n);
    this.ap2hp.run(lowL, lowR, apBL, apBR, n);
    for (let i = 0; i < n; i++) { lowL[i] = apAL[i] + apBL[i]; lowR[i] = apAR[i] + apBR[i]; }

    const bands: [Float32Array, Float32Array, BandParams][] = [
      [lowL, lowR, this.p.low], [midL, midR, this.p.mid], [highL, highR, this.p.high],
    ];
    const anySolo = bands.some(b => b[2].solo);
    for (let i = 0; i < n; i++) { l[i] = 0; r[i] = 0; }
    bands.forEach(([bl, br, bp], idx) => {
      this.comps[idx].process(bl, br, n);
      const audible = anySolo ? bp.solo : !bp.mute;
      const g = audible ? dbToLin(bp.gainDb + this.p.outputDb) : 0;
      for (let i = 0; i < n; i++) { l[i] += bl[i] * g; r[i] += br[i] * g; }
    });
  }
}
