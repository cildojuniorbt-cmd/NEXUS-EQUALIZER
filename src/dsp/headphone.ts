// NEXUS DSP — Headphone Studio: per-device profiles, tone profiles and measurement import.
//
// NEXUS does NOT ship frequency-response curves for headphone models: curves must come from verifiable
// measurements supplied by the user (CSV import) or from manual adjustment. The tone profiles below are
// generic listening-preference shapes, not corrections of any specific headphone.
import { fitCorrection, type BandLevel } from './room.ts';
import { type EqBand } from './eq.ts';

export type Connection = 'bluetooth' | 'usb' | 'wired' | 'dac' | 'speaker' | 'unknown';

export interface HeadphoneProfile {
  id: string;
  name: string;
  deviceKey: string | null;   // label of the audio output device this profile is bound to
  connection: Connection;
  tone: ToneProfileId;
  correction: EqBand[];       // from imported measurement or manual edit
  bassDb: number;             // low shelf @ 100 Hz
  trebleDb: number;           // high shelf @ 8 kHz
  width: number;              // stereo width 0..2
  balance: number;            // −1..+1
  crossfeed: number;          // 0..1
  spatial: number;            // 0..1 (stereo-field enlargement — not HRTF binaural)
  gainDb: number;             // output gain trim
}

export type ToneProfileId = 'monitor' | 'musica' | 'cinema' | 'jogos' | 'voz' | 'neutro' | 'personalizado';

export interface ToneProfile { id: ToneProfileId; label: string; bands: EqBand[]; width: number; crossfeed: number; hint: string }

const pk = (freq: number, gainDb: number, q = 1): EqBand => ({ type: 'peak', freq, gainDb, q, enabled: true });
const ls = (freq: number, gainDb: number): EqBand => ({ type: 'lowshelf', freq, gainDb, q: 0.71, enabled: true });
const hs = (freq: number, gainDb: number): EqBand => ({ type: 'highshelf', freq, gainDb, q: 0.71, enabled: true });
const hp = (freq: number): EqBand => ({ type: 'highpass', freq, gainDb: 0, q: Math.SQRT1_2, enabled: true });

export const TONE_PROFILES: ToneProfile[] = [
  { id: 'monitor', label: 'Monitoramento de estúdio', bands: [], width: 1, crossfeed: 0, hint: 'Sem coloração. Combine com uma correção medida do seu fone.' },
  { id: 'musica', label: 'Música', bands: [ls(100, 2), hs(8000, 1.5)], width: 1.05, crossfeed: 0.1, hint: 'Leve realce de graves e brilho (preferência geral).' },
  { id: 'cinema', label: 'Cinema', bands: [ls(90, 3), pk(3000, 1.5, 0.9), hs(9000, 1)], width: 1.2, crossfeed: 0, hint: 'Mais impacto e diálogo claro, imagem mais larga.' },
  { id: 'jogos', label: 'Jogos', bands: [ls(80, 1.5), pk(3500, 2.5, 1.1), pk(6000, 1.5, 1.4)], width: 1.15, crossfeed: 0, hint: 'Destaca passos e pistas (3–6 kHz).' },
  { id: 'voz', label: 'Voz', bands: [hp(100), ls(120, -2), pk(3000, 3, 1)], width: 0.9, crossfeed: 0.2, hint: 'Inteligibilidade de fala/chamadas.' },
  { id: 'neutro', label: 'Referência neutra', bands: [], width: 1, crossfeed: 0, hint: 'Tudo em zero.' },
  { id: 'personalizado', label: 'Personalizado', bands: [], width: 1, crossfeed: 0, hint: 'Ajustes manuais.' },
];

export function defaultHeadphoneProfile(partial: Partial<HeadphoneProfile> = {}): HeadphoneProfile {
  return {
    id: 'hp-default', name: 'Meu fone', deviceKey: null, connection: 'unknown', tone: 'neutro',
    correction: [], bassDb: 0, trebleDb: 0, width: 1, balance: 0, crossfeed: 0, spatial: 0, gainDb: 0,
    ...partial,
  };
}

/** EQ bands implied by a profile (tone shape + user correction + bass/treble). */
export function profileBands(p: HeadphoneProfile): EqBand[] {
  const tone = TONE_PROFILES.find(t => t.id === p.tone)?.bands ?? [];
  const out = [...tone, ...p.correction];
  if (p.bassDb) out.push(ls(100, p.bassDb));
  if (p.trebleDb) out.push(hs(8000, p.trebleDb));
  return out;
}

/** Guesses the connection type from a device label such as the one exposed by enumerateDevices(). */
export function guessConnection(label: string): Connection {
  const l = label.toLowerCase();
  if (/bluetooth|airpods|buds|wh-1000|bt\b/.test(l)) return 'bluetooth';
  if (/dac|dragonfly|e1da|apple usb-c|usb-c to 3\.5/.test(l)) return 'dac';
  if (/usb/.test(l)) return 'usb';
  if (/speaker|alto-falante|built-in|embutido/.test(l)) return 'speaker';
  if (/headphone|fone|wired|3\.5|auricular/.test(l)) return 'wired';
  return 'unknown';
}

// ───────────── Measurement import ─────────────
/** Parses "frequency, dB" text (CSV/TSV/space separated; `#` comments and a header row are tolerated). */
export function parseMeasurement(text: string): BandLevel[] {
  const pts: BandLevel[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('*')) continue;
    const parts = line.split(/[,;\t ]+/).map(s => Number(s.replace(',', '.')));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) && parts[0] > 0) pts.push({ freq: parts[0], db: parts[1] });
  }
  return pts.sort((a, b) => a.freq - b.freq);
}

/** Log-frequency resampling (linear interpolation in dB over log f) onto third-octave centres. */
export function toThirdOctave(points: BandLevel[], lo = 20, hi = 20000): BandLevel[] {
  if (points.length < 2) return [];
  const out: BandLevel[] = [];
  for (let f = lo; f <= hi * 1.001; f *= Math.pow(2, 1 / 3)) {
    if (f < points[0].freq || f > points[points.length - 1].freq) continue;
    let i = 1; while (i < points.length - 1 && points[i].freq < f) i++;
    const a = points[i - 1], b = points[i];
    const t = (Math.log(f) - Math.log(a.freq)) / (Math.log(b.freq) - Math.log(a.freq));
    out.push({ freq: f, db: a.db + (b.db - a.db) * Math.min(Math.max(t, 0), 1) });
  }
  return out;
}

/** Builds a correction (parametric bands) that flattens a measured response toward the 0 dB reference. */
export function correctionFromMeasurement(text: string, fs: number, maxBands = 8): { bands: EqBand[]; points: number } {
  const pts = parseMeasurement(text);
  const thirds = toThirdOctave(pts);
  if (thirds.length < 8) return { bands: [], points: pts.length };
  const ref = thirds.filter(x => x.freq >= 500 && x.freq <= 2000);
  const refDb = ref.reduce((a, x) => a + x.db, 0) / Math.max(ref.length, 1);
  const rel = thirds.map(x => ({ freq: x.freq, db: x.db - refDb }));
  return { bands: fitCorrection(rel, null, fs, { maxBands, minHz: 30, maxHz: 12000, maxCutDb: 9, maxBoostDb: 6 }), points: pts.length };
}
