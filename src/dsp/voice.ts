// NEXUS DSP — Voice Studio: spectral noise reduction, gate, de-esser, vocal compressor, presence EQ.
import { fft, ifft } from './analyzer.ts';
import { Compressor, DeEsser, DownwardExpander, DEFAULT_GATE } from './dynamics.ts';
import { ParametricEQ, type EqBand } from './eq.ts';

/** Stereo-linked STFT spectral-subtraction denoiser (minimum-statistics noise tracking). */
export class SpectralDenoiser {
  readonly size = 512;
  readonly hop = 256;
  amount = 0; // 0..1
  private win = new Float64Array(512);
  private inL = new Float64Array(512); private inR = new Float64Array(512);
  private outL = new Float64Array(512); private outR = new Float64Array(512);
  private fifoL: number[] = []; private fifoR: number[] = [];
  private noise = new Float64Array(257).fill(-1);
  private gPrev = new Float64Array(257).fill(1);
  private count = 0;
  private wi = 0; // ring write index (oldest sample)
  private re = new Float64Array(512); private im = new Float64Array(512);
  private rr = new Float64Array(512); private ri = new Float64Array(512);

  constructor() {
    for (let i = 0; i < 512; i++) this.win[i] = Math.sin(Math.PI * (i + 0.5) / 512); // sine window, COLA at 50 %
    for (let i = 0; i < this.hop; i++) { this.fifoL.push(0); this.fifoR.push(0); }
  }

  get latency(): number { return this.size; }

  reset(): void {
    this.inL.fill(0); this.inR.fill(0); this.outL.fill(0); this.outR.fill(0);
    this.noise.fill(-1); this.gPrev.fill(1); this.count = 0; this.wi = 0;
    this.fifoL = new Array(this.hop).fill(0); this.fifoR = new Array(this.hop).fill(0);
  }

  process(l: Float32Array, r: Float32Array, n: number): void {
    if (this.amount <= 0) return;
    for (let i = 0; i < n; i++) {
      // push input into sliding frame buffers
      this.inL[this.wi] = l[i]; this.inR[this.wi] = r[i];
      this.wi = (this.wi + 1) % this.size;
      l[i] = this.fifoL.shift() ?? 0; r[i] = this.fifoR.shift() ?? 0;
      if (++this.count >= this.hop) { this.count = 0; this.frame(); }
    }
  }

  private frame(): void {
    const N = this.size, H = this.hop, K = N / 2 + 1;
    const a = this.amount;
    const re = this.re, im = this.im, rr = this.rr, ri = this.ri;
    for (let i = 0; i < N; i++) { const j = (this.wi + i) % N; re[i] = this.inL[j] * this.win[i]; im[i] = 0; rr[i] = this.inR[j] * this.win[i]; ri[i] = 0; }
    fft(re, im); fft(rr, ri);
    const alpha = 1 + 2.2 * a;                 // over-subtraction
    const floor = Math.pow(10, -(6 + 18 * a) / 20); // maximum attenuation 6…24 dB
    const g = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      const p = 0.5 * (re[k] * re[k] + im[k] * im[k] + rr[k] * rr[k] + ri[k] * ri[k]) + 1e-12;
      // minimum-statistics tracker: follows dips immediately, rises slowly
      if (this.noise[k] < 0) this.noise[k] = p; else this.noise[k] = p < this.noise[k] ? p : this.noise[k] * 1.0015;
      const gain = Math.sqrt(Math.max(1 - alpha * this.noise[k] / p, floor * floor));
      // smooth over time to limit "musical noise"
      g[k] = this.gPrev[k] = 0.55 * this.gPrev[k] + 0.45 * gain;
    }
    for (let k = 0; k < K; k++) { re[k] *= g[k]; im[k] *= g[k]; rr[k] *= g[k]; ri[k] *= g[k]; if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; rr[N - k] = rr[k]; ri[N - k] = -ri[k]; } }
    ifft(re, im); ifft(rr, ri);
    for (let i = 0; i < N; i++) { this.outL[i] += re[i] * this.win[i]; this.outR[i] += rr[i] * this.win[i]; }
    for (let i = 0; i < H; i++) { this.fifoL.push(this.outL[i]); this.fifoR.push(this.outR[i]); }
    this.outL.copyWithin(0, H); this.outR.copyWithin(0, H);
    this.outL.fill(0, N - H); this.outR.fill(0, N - H);
  }
}

export interface VoiceParams {
  enabled: boolean;
  noiseReduction: number;   // 0..1
  gateEnabled: boolean;
  gateThresholdDb: number;
  deEsserDb: number;        // threshold, lower = stronger; −10 (maximum) = off
  compressorAmount: number; // 0..1 (macro over threshold/ratio)
  presenceDb: number;       // +/− at 3.5 kHz
  clarity: number;          // 0..1 intelligibility (2–5 kHz lift + low-mid cleanup)
  lowCutHz: number;         // 0 = off
}

export const DEFAULT_VOICE: VoiceParams = {
  enabled: false, noiseReduction: 0, gateEnabled: false, gateThresholdDb: -50, deEsserDb: -10,
  compressorAmount: 0, presenceDb: 0, clarity: 0, lowCutHz: 0,
};

export function voiceEqBands(p: VoiceParams): EqBand[] {
  const b: EqBand[] = [];
  if (p.lowCutHz > 0) b.push({ type: 'highpass', freq: p.lowCutHz, gainDb: 0, q: Math.SQRT1_2, enabled: true });
  if (p.presenceDb) b.push({ type: 'peak', freq: 3500, gainDb: p.presenceDb, q: 0.9, enabled: true });
  if (p.clarity > 0) {
    b.push({ type: 'peak', freq: 3000, gainDb: 3.5 * p.clarity, q: 0.8, enabled: true });
    b.push({ type: 'peak', freq: 300, gainDb: -2.5 * p.clarity, q: 1.0, enabled: true });
  }
  return b;
}

export class VoiceProcessor {
  p: VoiceParams = { ...DEFAULT_VOICE };
  readonly nr = new SpectralDenoiser();
  readonly gate: DownwardExpander;
  readonly deesser: DeEsser;
  readonly comp: Compressor;
  readonly eq: ParametricEQ;

  constructor(fs: number) {
    this.gate = new DownwardExpander(fs, DEFAULT_GATE);
    this.deesser = new DeEsser(fs);
    this.comp = new Compressor(fs);
    this.eq = new ParametricEQ(fs);
  }

  get latency(): number { return this.p.enabled && this.p.noiseReduction > 0 ? this.nr.latency : 0; }

  set(p: Partial<VoiceParams>): void {
    this.p = { ...this.p, ...p };
    this.nr.amount = this.p.noiseReduction;
    this.gate.set({ thresholdDb: this.p.gateThresholdDb });
    this.deesser.set({ thresholdDb: this.p.deEsserDb });
    const a = this.p.compressorAmount;
    this.comp.set({ thresholdDb: -14 - 14 * a, ratio: 1 + 3.5 * a, attackMs: 8, releaseMs: 140, kneeDb: 8, makeupDb: 6 * a });
    this.eq.setBands(voiceEqBands(this.p));
  }

  reset(): void { this.nr.reset(); this.gate.reset(); this.deesser.reset(); this.comp.reset(); }

  process(l: Float32Array, r: Float32Array, n: number): void {
    if (!this.p.enabled) return;
    if (this.p.noiseReduction > 0) this.nr.process(l, r, n);
    if (this.p.gateEnabled) this.gate.process(l, r, n);
    if (this.p.deEsserDb < -10) this.deesser.process(l, r, n);
    if (this.p.compressorAmount > 0) this.comp.process(l, r, n);
    this.eq.process(l, r, n);
  }
}
