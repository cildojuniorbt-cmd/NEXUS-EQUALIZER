// NEXUS DSP — Room Studio: room acoustics model, speaker alignment, sweep measurement
// (exponential sine sweep + deconvolution), RT60 from impulse response and correction-EQ fitting.
//
// IMPORTANT: a phone/tablet microphone is not a calibrated measurement microphone (unknown sensitivity,
// AGC/noise-suppression, uneven frequency response). Every measurement produced here is flagged
// `calibrated: false` and must be presented as *indicative*, never as a professional measurement.
import { fft, ifft, nextPow2 } from './analyzer.ts';
import { qFromOctaves, responseOfBands, type EqBand } from './eq.ts';

export const SPEED_OF_SOUND = 343; // m/s at ≈ 20 °C

// Generic mid-frequency absorption coefficients (textbook order-of-magnitude values).
export const MATERIALS = {
  concreto: { label: 'Concreto / alvenaria', alpha: 0.03 },
  gesso: { label: 'Gesso / drywall', alpha: 0.06 },
  madeira: { label: 'Madeira / lambri', alpha: 0.10 },
  vidro: { label: 'Vidro / espelho', alpha: 0.04 },
  carpete: { label: 'Carpete / forro', alpha: 0.30 },
  painel: { label: 'Painel acústico', alpha: 0.80 },
} as const;
export type MaterialKey = keyof typeof MATERIALS;

export type TreatmentLevel = 'nenhum' | 'parcial' | 'completo';
export type SpeakerLayout = 'stereo' | '2.1' | '5.1' | '7.1';

export const LAYOUT_CHANNELS: Record<SpeakerLayout, string[]> = {
  stereo: ['L', 'R'],
  '2.1': ['L', 'R', 'SUB'],
  '5.1': ['L', 'R', 'C', 'SUB', 'LS', 'RS'],
  '7.1': ['L', 'R', 'C', 'SUB', 'LS', 'RS', 'LB', 'RB'],
};

export interface RoomConfig {
  width: number; length: number; height: number; // metres
  environment: 'quarto' | 'sala' | 'home-studio' | 'escritorio' | 'carro' | 'outro';
  walls: MaterialKey; floor: MaterialKey; ceiling: MaterialKey;
  curtains: boolean; rug: boolean;
  furniture: number;           // number of large furniture pieces
  treatment: TreatmentLevel;
  layout: SpeakerLayout;
  speakerSpacing: number;      // m between L/R
  listenerDistance: number;    // m from listener to the speaker line
  speakerDistances: Record<string, number>; // per channel, metres (for alignment)
  speakerTrimDb: Record<string, number>;
}

export const DEFAULT_ROOM: RoomConfig = {
  width: 4, length: 5, height: 2.7, environment: 'home-studio',
  walls: 'gesso', floor: 'madeira', ceiling: 'gesso',
  curtains: false, rug: false, furniture: 2, treatment: 'nenhum',
  layout: 'stereo', speakerSpacing: 2, listenerDistance: 2.2,
  speakerDistances: {}, speakerTrimDb: {},
};

export const roomVolume = (r: Pick<RoomConfig, 'width' | 'length' | 'height'>): number => r.width * r.length * r.height;

/** Axial room modes (f = c / 2L) up to maxHz. */
export function roomModes(r: Pick<RoomConfig, 'width' | 'length' | 'height'>, maxHz = 300): { freq: number; axis: 'comprimento' | 'largura' | 'altura'; order: number }[] {
  const dims: [number, 'comprimento' | 'largura' | 'altura'][] = [[r.length, 'comprimento'], [r.width, 'largura'], [r.height, 'altura']];
  const out: { freq: number; axis: 'comprimento' | 'largura' | 'altura'; order: number }[] = [];
  for (const [d, axis] of dims) {
    if (d <= 0) continue;
    for (let n = 1; ; n++) { const f = n * SPEED_OF_SOUND / (2 * d); if (f > maxHz) break; out.push({ freq: f, axis, order: n }); }
  }
  return out.sort((a, b) => a.freq - b.freq);
}

/** Sabine RT60 estimate (seconds). A rough theoretical value, not a measurement. */
export function estimateRt60(r: RoomConfig): number {
  const { width: w, length: l, height: h } = r;
  const floorA = w * l, wallA = 2 * (w + l) * h;
  let absorption = floorA * MATERIALS[r.floor].alpha + floorA * MATERIALS[r.ceiling].alpha + wallA * MATERIALS[r.walls].alpha;
  if (r.rug) absorption += floorA * 0.5 * (MATERIALS.carpete.alpha - MATERIALS[r.floor].alpha);
  if (r.curtains) absorption += 4 * 0.35;
  absorption += r.furniture * 0.4;
  if (r.treatment === 'parcial') absorption += wallA * 0.10 * MATERIALS.painel.alpha;
  if (r.treatment === 'completo') absorption += wallA * 0.25 * MATERIALS.painel.alpha;
  return 0.161 * roomVolume(r) / Math.max(absorption, 1e-3);
}

/** Schroeder frequency: below it the room is modal (use EQ), above it diffuse (EQ is ineffective). */
export const schroederFrequency = (rt60: number, volume: number): number => 2000 * Math.sqrt(rt60 / Math.max(volume, 1e-3));

/** Delay + level trims that time/level-align speakers at different distances to the listener. */
export function speakerAlignment(distances: Record<string, number>): Record<string, { delayMs: number; trimDb: number }> {
  const ds = Object.values(distances).filter(d => d > 0);
  const far = ds.length ? Math.max(...ds) : 0;
  const out: Record<string, { delayMs: number; trimDb: number }> = {};
  for (const [ch, d] of Object.entries(distances)) {
    out[ch] = { delayMs: (far - d) / SPEED_OF_SOUND * 1000, trimDb: d > 0 && far > 0 ? 20 * Math.log10(d / far) : 0 };
  }
  return out;
}

/** Equilateral-triangle check: ideal speaker toe-in/spacing relative to listener distance. */
export const idealSpacing = (listenerDistance: number): number => listenerDistance; // 60° triangle

// ───────────── Sweep measurement ─────────────
export function generateLogSweep(f1: number, f2: number, seconds: number, fs: number): Float32Array {
  const n = Math.round(seconds * fs);
  const L = seconds / Math.log(f2 / f1);
  const K = 2 * Math.PI * f1 * L;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin(K * (Math.exp(i / fs / L) - 1));
  const fade = Math.round(0.01 * fs);
  for (let i = 0; i < fade; i++) { const g = i / fade; out[i] *= g; out[n - 1 - i] *= g; }
  return out;
}

/** Impulse response by regularised spectral division, band-limited to [f1, f2]. */
export function deconvolveSweep(recorded: ArrayLike<number>, sweep: ArrayLike<number>, fs: number, f1 = 20, f2 = 20000): Float64Array {
  const N = nextPow2(recorded.length + sweep.length);
  const rr = new Float64Array(N), ri = new Float64Array(N), sr = new Float64Array(N), si = new Float64Array(N);
  for (let i = 0; i < recorded.length; i++) rr[i] = recorded[i];
  for (let i = 0; i < sweep.length; i++) sr[i] = sweep[i];
  fft(rr, ri); fft(sr, si);
  let maxP = 0;
  for (let k = 0; k < N; k++) maxP = Math.max(maxP, sr[k] * sr[k] + si[k] * si[k]);
  const eps = maxP * 1e-9;
  const hr = new Float64Array(N), hi = new Float64Array(N);
  const lo = Math.round(f1 * N / fs), hiK = Math.round(f2 * N / fs);
  for (let k = 0; k < N; k++) {
    const kk = k <= N / 2 ? k : N - k; // mirrored index keeps the IR real
    if (kk < lo || kk > hiK) continue;
    const p = sr[k] * sr[k] + si[k] * si[k] + eps;
    // R · conj(S) / |S|²
    hr[k] = (rr[k] * sr[k] + ri[k] * si[k]) / p;
    hi[k] = (ri[k] * sr[k] - rr[k] * si[k]) / p;
  }
  ifft(hr, hi);
  return hr;
}

export interface BandLevel { freq: number; db: number }

/** Third-octave magnitude response (dB, relative to the 500 Hz–2 kHz average) of an impulse response. */
export function responseFromIr(ir: Float64Array, fs: number, window = 0.25): BandLevel[] {
  // Window the IR (keep the direct sound + early/late decay), then FFT.
  let peak = 0, pk = 0;
  for (let i = 0; i < ir.length / 2; i++) if (Math.abs(ir[i]) > peak) { peak = Math.abs(ir[i]); pk = i; }
  const len = Math.min(Math.round(window * fs), ir.length - pk);
  const N = nextPow2(len);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < len; i++) { const fadeOut = i > len * 0.8 ? 0.5 + 0.5 * Math.cos(Math.PI * (i - len * 0.8) / (len * 0.2)) : 1; re[i] = ir[pk + i] * fadeOut; }
  fft(re, im);
  const bands: BandLevel[] = [];
  for (let f = 25; f <= 16000 * 1.01; f *= Math.pow(2, 1 / 3)) {
    const a = Math.max(1, Math.round(f / Math.pow(2, 1 / 6) * N / fs)), b = Math.min(N / 2 - 1, Math.max(a, Math.round(f * Math.pow(2, 1 / 6) * N / fs)));
    let p = 0; for (let k = a; k <= b; k++) p += re[k] * re[k] + im[k] * im[k];
    bands.push({ freq: f, db: 10 * Math.log10(Math.max(p / (b - a + 1), 1e-30)) });
  }
  const ref = bands.filter(x => x.freq >= 500 && x.freq <= 2000);
  const refDb = ref.reduce((a, x) => a + x.db, 0) / Math.max(ref.length, 1);
  return bands.map(x => ({ freq: x.freq, db: x.db - refDb }));
}

/** RT60 (T20 extrapolated) from an impulse response using Schroeder backward integration. */
export function estimateRt60FromIr(ir: ArrayLike<number>, fs: number): number | null {
  let pk = 0, peak = 0;
  for (let i = 0; i < ir.length; i++) if (Math.abs(ir[i]) > peak) { peak = Math.abs(ir[i]); pk = i; }
  const n = ir.length - pk;
  if (n < fs * 0.2) return null;
  const e = new Float64Array(n);
  for (let i = 0; i < n; i++) e[i] = ir[pk + i] * ir[pk + i];
  // noise floor from the last 10 % of the response
  const tailStart = Math.floor(n * 0.9);
  let noise = 0; for (let i = tailStart; i < n; i++) noise += e[i]; noise /= Math.max(n - tailStart, 1);
  // truncate where the smoothed energy reaches the noise floor + 6 dB
  const win = Math.max(1, Math.round(0.01 * fs));
  let end = n;
  for (let i = 0; i + win < n; i += win) {
    let s = 0; for (let j = 0; j < win; j++) s += e[i + j];
    if (s / win < noise * 4) { end = i; break; }
  }
  if (end < fs * 0.05) return null;
  const edc = new Float64Array(end);
  let acc = 0;
  for (let i = end - 1; i >= 0; i--) { acc += Math.max(e[i] - noise, 0); edc[i] = acc; }
  const total = edc[0];
  if (total <= 0) return null;
  const db = (i: number) => 10 * Math.log10(Math.max(edc[i] / total, 1e-12));
  let t5 = -1, t25 = -1;
  for (let i = 0; i < end; i++) { const d = db(i); if (t5 < 0 && d <= -5) t5 = i; if (d <= -25) { t25 = i; break; } }
  if (t5 < 0 || t25 < 0) return null;
  return 3 * (t25 - t5) / fs;
}

// ───────────── Peaks / dips and correction fitting ─────────────
export interface Deviation { freq: number; db: number; kind: 'pico' | 'vale' }

/** Reports frequencies deviating more than `thresholdDb` from the target (third-octave data). */
export function findDeviations(measured: BandLevel[], target: BandLevel[] | null, thresholdDb = 4): Deviation[] {
  const res: Deviation[] = [];
  const err = measured.map((m, i) => ({ freq: m.freq, db: m.db - (target?.[i]?.db ?? 0) }));
  for (let i = 1; i < err.length - 1; i++) {
    const e = err[i];
    if (Math.abs(e.db) >= thresholdDb && Math.abs(e.db) >= Math.abs(err[i - 1].db) && Math.abs(e.db) >= Math.abs(err[i + 1].db)) {
      res.push({ freq: e.freq, db: e.db, kind: e.db > 0 ? 'pico' : 'vale' });
    }
  }
  return res;
}

export interface FitOptions { maxBands?: number; minHz?: number; maxHz?: number; maxCutDb?: number; maxBoostDb?: number; toleranceDb?: number }

/**
 * Greedy parametric fit: repeatedly corrects the largest remaining deviation. Cuts are preferred to boosts
 * (boosting a dip caused by cancellation wastes headroom and does not fix it), so boosts are capped lower.
 */
export function fitCorrection(measured: BandLevel[], target: BandLevel[] | null, fs: number, opts: FitOptions = {}): EqBand[] {
  const { maxBands = 8, minHz = 25, maxHz = 500, maxCutDb = 9, maxBoostDb = 3, toleranceDb = 1.5 } = opts;
  const freqs = measured.map(m => m.freq);
  const err = measured.map((m, i) => m.db - (target?.[i]?.db ?? 0));
  const bands: EqBand[] = [];
  for (let n = 0; n < maxBands; n++) {
    let bi = -1, bv = 0;
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i] < minHz || freqs[i] > maxHz) continue;
      if (Math.abs(err[i]) > Math.abs(bv)) { bv = err[i]; bi = i; }
    }
    if (bi < 0 || Math.abs(bv) < toleranceDb) break;
    // half-height extent → bandwidth in octaves
    let lo = bi, hi = bi;
    while (lo > 0 && Math.sign(err[lo - 1]) === Math.sign(bv) && Math.abs(err[lo - 1]) > Math.abs(bv) / 2) lo--;
    while (hi < freqs.length - 1 && Math.sign(err[hi + 1]) === Math.sign(bv) && Math.abs(err[hi + 1]) > Math.abs(bv) / 2) hi++;
    const bw = Math.min(Math.max(Math.log2(freqs[hi] / freqs[lo]) + 1 / 3, 0.25), 2);
    const gain = Math.max(-maxCutDb, Math.min(maxBoostDb, -bv * 0.85));
    const band: EqBand = { type: 'peak', freq: freqs[bi], gainDb: Math.round(gain * 10) / 10, q: Math.round(qFromOctaves(bw) * 100) / 100, enabled: true };
    bands.push(band);
    const corr = responseOfBands([band], freqs, fs);
    for (let i = 0; i < err.length; i++) err[i] += corr[i];
  }
  return bands;
}

export interface MeasurementResult {
  calibrated: false;
  note: string;
  response: BandLevel[];
  rt60: number | null;
  deviations: Deviation[];
  suggested: EqBand[];
}

export const UNCALIBRATED_NOTE = 'Medição indicativa feita com o microfone do aparelho. Não é calibrada nem profissional: use para comparar antes/depois, não como valor absoluto.';

export function analyzeMeasurement(ir: Float64Array, fs: number, targetOffsets: BandLevel[] | null = null): MeasurementResult {
  const response = responseFromIr(ir, fs);
  return {
    calibrated: false,
    note: UNCALIBRATED_NOTE,
    response,
    rt60: estimateRt60FromIr(ir, fs),
    deviations: findDeviations(response, targetOffsets),
    suggested: fitCorrection(response, targetOffsets, fs),
  };
}
