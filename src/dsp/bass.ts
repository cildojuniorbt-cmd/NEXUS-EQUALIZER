// NEXUS DSP — Bass Studio: subsonic filter, sub-bass/bass boost, low shelf, resonance control,
// psychoacoustic harmonics and low-band safety protection.
import { Biquad, designBiquad } from './biquad.ts';
import { type EqBand } from './eq.ts';

export interface BassParams {
  enabled: boolean;
  subsonicHz: number;     // high-pass corner, 0 = off (protects small drivers)
  subBassDb: number;      // peak @ 45 Hz
  bassBoostDb: number;    // peak @ 80 Hz
  lowShelfDb: number;
  lowShelfHz: number;
  resonanceDb: number;    // corrective peak, negative values tame boom
  resonanceHz: number;
  harmonics: number;      // 0..1 psychoacoustic harmonics (bass perception on small speakers)
  protect: boolean;       // clamp the cumulative low-frequency boost
  maxBoostDb: number;
}

export const DEFAULT_BASS: BassParams = {
  enabled: false, subsonicHz: 0, subBassDb: 0, bassBoostDb: 0, lowShelfDb: 0, lowShelfHz: 120,
  resonanceDb: 0, resonanceHz: 90, harmonics: 0, protect: true, maxBoostDb: 9,
};

/** Scales the positive boosts so their sum never exceeds maxBoostDb (when protection is on). */
export function protectedGains(p: BassParams): { subBassDb: number; bassBoostDb: number; lowShelfDb: number; scale: number } {
  const pos = Math.max(p.subBassDb, 0) + Math.max(p.bassBoostDb, 0) + Math.max(p.lowShelfDb, 0);
  const scale = p.protect && pos > p.maxBoostDb ? p.maxBoostDb / pos : 1;
  const f = (v: number) => (v > 0 ? v * scale : v);
  return { subBassDb: f(p.subBassDb), bassBoostDb: f(p.bassBoostDb), lowShelfDb: f(p.lowShelfDb), scale };
}

export function bassEqBands(p: BassParams): EqBand[] {
  if (!p.enabled) return [];
  const g = protectedGains(p);
  const b: EqBand[] = [];
  if (p.subsonicHz > 0) b.push({ type: 'highpass', freq: p.subsonicHz, gainDb: 0, q: Math.SQRT1_2, enabled: true });
  b.push({ type: 'peak', freq: 45, gainDb: g.subBassDb, q: 1.0, enabled: true });
  b.push({ type: 'peak', freq: 80, gainDb: g.bassBoostDb, q: 0.9, enabled: true });
  b.push({ type: 'lowshelf', freq: p.lowShelfHz, gainDb: g.lowShelfDb, q: 0.71, enabled: true });
  b.push({ type: 'peak', freq: p.resonanceHz, gainDb: p.resonanceDb, q: 3, enabled: true });
  return b;
}

/** Harmonic generator: low band → saturation → keep only the harmonics (≥ 2×) → blended in. */
export class BassHarmonics {
  amount = 0;
  private lp: Biquad[] = [new Biquad(), new Biquad()];
  private hp: Biquad[] = [new Biquad(), new Biquad()];
  constructor(fs: number) {
    const lp = designBiquad('lowpass', fs, 110, 0, Math.SQRT1_2);
    const hp = designBiquad('highpass', fs, 140, 0, Math.SQRT1_2);
    this.lp.forEach(x => x.set(lp)); this.hp.forEach(x => x.set(hp));
  }
  reset(): void { this.lp.concat(this.hp).forEach(x => x.reset()); }
  process(l: Float32Array, r: Float32Array, n: number): void {
    if (this.amount <= 0) return;
    const a = this.amount * 1.2;
    for (let i = 0; i < n; i++) {
      const low = this.lp[1].tick(this.lp[0].tick((l[i] + r[i]) * 0.5));
      const h = this.hp[1].tick(this.hp[0].tick(Math.tanh(6 * low)));
      l[i] += a * h; r[i] += a * h;
    }
  }
}
