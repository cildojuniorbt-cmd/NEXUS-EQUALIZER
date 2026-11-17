// NEXUS DSP — the single serialisable configuration shared by every module/platform.
import { GRAPHIC_FREQS, defaultParametricBands, type EqBand, type GraphicLayout } from './eq.ts';
import { DEFAULT_COMPRESSOR, DEFAULT_DEESSER, DEFAULT_EXPANDER, DEFAULT_GATE, DEFAULT_LIMITER, DEFAULT_MULTIBAND, type CompressorParams, type DeEsserParams, type ExpanderParams, type LimiterParams, type MultibandParams } from './dynamics.ts';
import { DEFAULT_STEREO, type StereoParams } from './stereo.ts';
import { DEFAULT_BASS, type BassParams } from './bass.ts';
import { DEFAULT_VOICE, type VoiceParams } from './voice.ts';
import { DEFAULT_ROOM, type RoomConfig } from './room.ts';
import { defaultHeadphoneProfile, type HeadphoneProfile } from './headphone.ts';

export interface EqConfig {
  enabled: boolean;
  mode: 'graphic' | 'parametric';
  layout: GraphicLayout;
  /** One gain array per layout so switching 10/15/31 never destroys the other settings. */
  graphic: Record<GraphicLayout, number[]>;
  parametric: EqBand[];
  preampDb: number;
}

export interface DynamicsConfig {
  enabled: boolean;
  gate: ExpanderParams & { enabled: boolean };
  expander: ExpanderParams & { enabled: boolean };
  deesser: DeEsserParams & { enabled: boolean };
  compressor: CompressorParams & { enabled: boolean };
  multiband: MultibandParams & { enabled: boolean };
  /** Parallel compression mix (the "Compressão Global" slider): 0 = dry, 1 = fully compressed. */
  mix: number;
  autoGain: boolean;
  saturation: { amount: number; mix: number };
  exciter: { amount: number; freq: number };
  softClip: boolean;
  limiter: LimiterParams & { enabled: boolean };
}

export interface SafetyConfig {
  /** Largest total boost allowed anywhere in the tonal response (dB). */
  maxBoostDb: number;
  /** Lowers the pre-amp automatically by the response peak so boosts cannot clip. */
  autoPreamp: boolean;
  /** Always keeps a final brick-wall limiter at the ceiling, even when Dynamics is off. */
  clipProtection: boolean;
  ceilingDb: number;
  warnPeakDb: number;
}

export interface NexusConfig {
  schema: 2;
  bypass: boolean;
  inputTrimDb: number;
  outputDb: number;
  eq: EqConfig;
  dynamics: DynamicsConfig;
  stereo: StereoParams;
  voice: VoiceParams;
  bass: BassParams;
  room: { enabled: boolean; config: RoomConfig; correction: EqBand[] };
  headphone: { enabled: boolean; profile: HeadphoneProfile };
  safety: SafetyConfig;
}

export function defaultConfig(): NexusConfig {
  const graphic = { 10: [], 15: [], 31: [] } as Record<GraphicLayout, number[]>;
  (Object.keys(GRAPHIC_FREQS) as unknown as GraphicLayout[]).forEach(k => { graphic[k] = new Array(GRAPHIC_FREQS[k].length).fill(0); });
  return {
    schema: 2, bypass: false, inputTrimDb: 0, outputDb: 0,
    eq: { enabled: true, mode: 'graphic', layout: 10, graphic, parametric: defaultParametricBands(), preampDb: 0 },
    dynamics: {
      enabled: false,
      gate: { ...DEFAULT_GATE, enabled: false },
      expander: { ...DEFAULT_EXPANDER, enabled: false },
      deesser: { ...DEFAULT_DEESSER, enabled: false },
      compressor: { ...DEFAULT_COMPRESSOR, enabled: true },
      multiband: { ...structuredClone(DEFAULT_MULTIBAND), enabled: false },
      mix: 1, autoGain: false,
      saturation: { amount: 0, mix: 1 },
      exciter: { amount: 0, freq: 3000 },
      softClip: false,
      limiter: { ...DEFAULT_LIMITER, enabled: true },
    },
    stereo: { ...DEFAULT_STEREO },
    voice: { ...DEFAULT_VOICE },
    bass: { ...DEFAULT_BASS },
    room: { enabled: false, config: structuredClone(DEFAULT_ROOM), correction: [] },
    headphone: { enabled: false, profile: defaultHeadphoneProfile() },
    safety: { maxBoostDb: 12, autoPreamp: true, clipProtection: true, ceilingDb: -0.3, warnPeakDb: -1 },
  };
}

// ───────────── Sanitising (imports, storage, worklet messages) ─────────────
const RANGES: Record<string, [number, number]> = {
  gainDb: [-24, 24], q: [0.1, 18], freq: [10, 24000], thresholdDb: [-90, 0], ratio: [1, 100], attackMs: [0.01, 500],
  releaseMs: [1, 5000], kneeDb: [0, 24], makeupDb: [-24, 24], holdMs: [0, 2000], rangeDb: [0, 90], ceilingDb: [-12, 0],
  inputTrimDb: [-24, 24], outputDb: [-24, 12], preampDb: [-24, 12], crossLow: [40, 1000], crossHigh: [500, 12000],
  width: [0, 2], balance: [-1, 1], crossfeed: [0, 1], amount: [0, 1], mix: [0, 1], midDb: [-12, 12], sideDb: [-12, 12],
  leftDb: [-12, 12], rightDb: [-12, 12], crossfeedHz: [300, 1500], maxBoostDb: [0, 18], warnPeakDb: [-12, 0],
  noiseReduction: [0, 1], compressorAmount: [0, 1], clarity: [0, 1], presenceDb: [-12, 12], lowCutHz: [0, 400],
  gateThresholdDb: [-90, -10], deEsserDb: [-60, -10], subsonicHz: [0, 80], subBassDb: [-12, 12], bassBoostDb: [-12, 12],
  lowShelfDb: [-12, 12], lowShelfHz: [40, 400], resonanceDb: [-12, 12], resonanceHz: [30, 300], harmonics: [0, 1],
  bassDb: [-12, 12], trebleDb: [-12, 12], spatial: [0, 1], gainDb_: [-24, 24],
};

/**
 * Merges `patch` into `base` recursively. Unknown keys and wrongly-typed values are ignored; numbers are
 * clamped by key name; band/gain arrays are validated element-wise. Safe for untrusted (imported) JSON.
 */
export function mergeConfig<T>(base: T, patch: unknown, key = ''): T {
  if (patch === undefined || patch === null) return base;
  if (typeof base === 'number') {
    if (typeof patch !== 'number' || !Number.isFinite(patch)) return base;
    const r = RANGES[key];
    return (r ? Math.min(Math.max(patch, r[0]), r[1]) : Math.min(Math.max(patch, -1e6), 1e6)) as T;
  }
  if (typeof base === 'boolean') return (typeof patch === 'boolean' ? patch : base) as T;
  if (typeof base === 'string') return (typeof patch === 'string' ? patch.slice(0, 120) : base) as T;
  if (Array.isArray(base)) {
    if (!Array.isArray(patch)) return base;
    if (key === 'parametric' || key === 'correction') {
      return patch.slice(0, 24).map(p => mergeConfig<EqBand>({ type: 'peak', freq: 1000, gainDb: 0, q: 1, enabled: true }, p)).map(b => ({
        ...b, type: (['peak', 'lowshelf', 'highshelf', 'lowpass', 'highpass', 'notch', 'bandpass'] as const).includes(b.type as never) ? b.type : 'peak',
      })) as unknown as T;
    }
    // numeric arrays (graphic gains): keep length of base
    return base.map((v, i) => mergeConfig(v, patch[i], 'gainDb')) as unknown as T;
  }
  if (typeof base === 'object' && base !== null) {
    if (typeof patch !== 'object' || Array.isArray(patch)) return base;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const k of Object.keys(base as object)) {
      if (k === 'speakerDistances' || k === 'speakerTrimDb') {
        const src = (patch as Record<string, unknown>)[k];
        const rec: Record<string, number> = {};
        if (src && typeof src === 'object') for (const [c, v] of Object.entries(src)) if (typeof v === 'number' && Number.isFinite(v) && c.length <= 4) rec[c] = Math.min(Math.max(v, k === 'speakerTrimDb' ? -12 : 0), k === 'speakerTrimDb' ? 12 : 30);
        out[k] = rec; continue;
      }
      if (k in (patch as object)) out[k] = mergeConfig((base as Record<string, unknown>)[k], (patch as Record<string, unknown>)[k], k);
    }
    return out as T;
  }
  return base;
}

const pick = <T extends string | number>(v: T, allowed: readonly T[], fallback: T): T => (allowed.includes(v) ? v : fallback);

export function sanitizeConfig(input: unknown): NexusConfig {
  const c = mergeConfig(defaultConfig(), input);
  const d = defaultConfig();
  c.eq.layout = pick(c.eq.layout, [10, 15, 31] as const, 10);
  c.eq.mode = pick(c.eq.mode, ['graphic', 'parametric'] as const, 'graphic');
  c.room.config.layout = pick(c.room.config.layout, ['stereo', '2.1', '5.1', '7.1'] as const, 'stereo');
  c.room.config.environment = pick(c.room.config.environment, ['quarto', 'sala', 'home-studio', 'escritorio', 'carro', 'outro'] as const, d.room.config.environment);
  c.room.config.treatment = pick(c.room.config.treatment, ['nenhum', 'parcial', 'completo'] as const, 'nenhum');
  for (const k of ['walls', 'floor', 'ceiling'] as const) c.room.config[k] = pick(c.room.config[k], ['concreto', 'gesso', 'madeira', 'vidro', 'carpete', 'painel'] as const, d.room.config[k]);
  c.room.config.width = Math.min(Math.max(c.room.config.width, 1), 30);
  c.room.config.length = Math.min(Math.max(c.room.config.length, 1), 30);
  c.room.config.height = Math.min(Math.max(c.room.config.height, 1.8), 10);
  c.headphone.profile.connection = pick(c.headphone.profile.connection, ['bluetooth', 'usb', 'wired', 'dac', 'speaker', 'unknown'] as const, 'unknown');
  c.headphone.profile.tone = pick(c.headphone.profile.tone, ['monitor', 'musica', 'cinema', 'jogos', 'voz', 'neutro', 'personalizado'] as const, 'neutro');
  const dk = (input as { headphone?: { profile?: { deviceKey?: unknown } } } | null)?.headphone?.profile?.deviceKey;
  c.headphone.profile.deviceKey = typeof dk === 'string' ? dk.slice(0, 120) : null;
  return c;
}
