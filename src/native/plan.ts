// NEXUS EQ — native plan (v1). The web UI owns the full NexusConfig; Android (DynamicsProcessing) and iOS
// (Swift core) cannot run every module, so the config is reduced to the subset the platform effect can apply:
// one combined EQ curve (EQ + room + headphone + bass shaping), compressor/multiband, gate/expander, limiter.
// Anything else that is active is listed in `unsupported` so the UI never claims it is being applied.
import { NexusEngine } from '../dsp/chain.ts';
import type { NexusConfig } from '../dsp/config.ts';
import { responseOfBands } from '../dsp/eq.ts';

export const PLAN_VERSION = 1;
/** 31 ISO third-octave centres: the grid the native EQ is fitted on. */
export const PLAN_FREQS = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];

export interface PlanCompressor { enabled: boolean; thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; kneeDb: number; makeupDb: number }
export interface PlanBand extends PlanCompressor { gainDb: number }
export interface NativePlan {
  version: number;
  enabled: boolean;
  preampDb: number;
  inputTrimDb: number;
  outputDb: number;
  eq: { freqs: number[]; gainsDb: number[] };
  compressor: PlanCompressor;
  multiband: { enabled: boolean; crossLow: number; crossHigh: number; bands: [PlanBand, PlanBand, PlanBand] };
  gate: { enabled: boolean; thresholdDb: number };
  expander: { enabled: boolean; thresholdDb: number; ratio: number };
  limiter: { enabled: boolean; thresholdDb: number; ceilingDb: number; releaseMs: number };
  unsupported: string[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function unsupportedModules(c: NexusConfig): string[] {
  const u: string[] = [];
  const s = c.stereo;
  if (s.width !== 1 || s.balance !== 0 || s.midDb !== 0 || s.sideDb !== 0 || s.leftDb !== 0 || s.rightDb !== 0 || s.invertLeft || s.invertRight || s.swap || s.mono || s.crossfeed > 0) u.push('Stereo Studio (largura, M/S, balance, crossfeed)');
  if (c.voice.enabled) u.push('Voice Studio (redução de ruído, de-esser vocal, compressor vocal)');
  if (c.bass.enabled && c.bass.harmonics > 0) u.push('Harmônicos de graves');
  if (c.headphone.enabled && (c.headphone.profile.width !== 1 || c.headphone.profile.crossfeed > 0 || c.headphone.profile.spatial > 0 || c.headphone.profile.balance !== 0)) u.push('Espacialidade de fones (largura, crossfeed, espacial)');
  if (c.dynamics.enabled) {
    const d = c.dynamics;
    if (d.deesser.enabled) u.push('De-Esser');
    if (d.saturation.amount > 0 || d.exciter.amount > 0) u.push('Saturação / Exciter');
    if (d.softClip) u.push('Soft Clip');
    if (d.mix < 1 && (d.compressor.enabled || d.multiband.enabled)) u.push('Compressão paralela (mix < 100 %)');
  }
  return u;
}

export function buildNativePlan(cfg: NexusConfig, enabled = !cfg.bypass): NativePlan {
  const engine = new NexusEngine(48000, cfg);
  const bands = engine.toneBands(cfg);
  const gains = responseOfBands(bands, PLAN_FREQS, 48000).map(r1);
  const d = cfg.dynamics, on = d.enabled;
  const comp = (p: { thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; kneeDb: number; makeupDb: number }, e: boolean): PlanCompressor => ({ enabled: e, thresholdDb: p.thresholdDb, ratio: p.ratio, attackMs: p.attackMs, releaseMs: p.releaseMs, kneeDb: p.kneeDb, makeupDb: p.makeupDb });
  const mb = d.multiband;
  const band = (b: typeof mb.low): PlanBand => ({ ...comp(b, on && mb.enabled && !b.mute), gainDb: b.gainDb });
  const clipProtection = cfg.safety.clipProtection || (on && d.limiter.enabled);
  const ceiling = Math.min(cfg.safety.ceilingDb, on && d.limiter.enabled ? d.limiter.ceilingDb : cfg.safety.ceilingDb);
  return {
    version: PLAN_VERSION, enabled,
    preampDb: r1(engine.report.appliedPreampDb), inputTrimDb: cfg.inputTrimDb, outputDb: cfg.outputDb,
    eq: { freqs: PLAN_FREQS, gainsDb: gains },
    compressor: comp(d.compressor, on && d.compressor.enabled && !mb.enabled),
    multiband: { enabled: on && mb.enabled, crossLow: mb.crossLow, crossHigh: mb.crossHigh, bands: [band(mb.low), band(mb.mid), band(mb.high)] },
    gate: { enabled: on && d.gate.enabled, thresholdDb: d.gate.thresholdDb },
    expander: { enabled: on && d.expander.enabled, thresholdDb: d.expander.thresholdDb, ratio: d.expander.ratio },
    limiter: { enabled: clipProtection, thresholdDb: Math.min(on && d.limiter.enabled ? d.limiter.thresholdDb : ceiling, ceiling), ceilingDb: ceiling, releaseMs: on && d.limiter.enabled ? d.limiter.releaseMs : 80 },
    unsupported: unsupportedModules(cfg),
  };
}
