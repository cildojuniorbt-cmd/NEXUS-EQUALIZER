// NEXUS DSP — the engine: wires every module into one signal chain.
//
//  input trim → Voice → Tone (EQ + room + headphone + bass shaping, auto pre-amp) → Bass harmonics →
//  Dynamics (gate → expander → de-esser → compressor | multiband [parallel mix] → saturation → exciter → soft clip) →
//  Stereo (width, M/S, balance, crossfeed) → output gain → final brick-wall limiter (safety)
//
// Bypass copies the input to the output untouched (bit-transparent).
import { dbToLin } from './biquad.ts';
import { ParametricEQ, graphicBands, peakBoostDb, type EqBand } from './eq.ts';
import { Compressor, DeEsser, DownwardExpander, Exciter, Limiter, MultibandCompressor, Saturator } from './dynamics.ts';
import { CorrelationMeter, StereoProcessor } from './stereo.ts';
import { LevelMeter, LoudnessMeter } from './analyzer.ts';
import { VoiceProcessor } from './voice.ts';
import { BassHarmonics, bassEqBands } from './bass.ts';
import { profileBands } from './headphone.ts';
import { defaultConfig, type NexusConfig } from './config.ts';

export interface EngineReport {
  toneBoostDb: number;       // largest positive gain of the combined tonal response
  appliedPreampDb: number;   // pre-amp actually applied (user + automatic protection)
  latencySamples: number;
  stages: string[];          // processors currently in the signal path
}

export interface EngineMeters {
  inPeakDb: number; inRmsDb: number; outPeakDb: number; outRmsDb: number; outHeldDb: number;
  clipped: number;
  compGrDb: number; limiterGrDb: number; gateGrDb: number; deesserGrDb: number;
  multibandGrDb: [number, number, number];
  correlation: number; monoLossDb: number; phaseInverted: boolean;
  momentaryLufs: number; integratedLufs: number;
}

export function autoMakeupDb(thresholdDb: number, ratio: number): number {
  return Math.max(0, -thresholdDb * (1 - 1 / Math.max(ratio, 1)) * 0.5);
}

function softClip(buf: Float32Array, n: number): void {
  const k = 0.7;
  for (let i = 0; i < n; i++) {
    const x = buf[i], a = Math.abs(x);
    if (a > k) buf[i] = Math.sign(x) * (k + (1 - k) * Math.tanh((a - k) / (1 - k)));
  }
}

export class NexusEngine {
  readonly fs: number;
  cfg: NexusConfig = defaultConfig();
  report: EngineReport = { toneBoostDb: 0, appliedPreampDb: 0, latencySamples: 0, stages: [] };

  private tone: ParametricEQ;
  private voice: VoiceProcessor;
  private harmonics: BassHarmonics;
  private gate: DownwardExpander;
  private expander: DownwardExpander;
  private deesser: DeEsser;
  private comp: Compressor;
  private multiband: MultibandCompressor;
  private sat = new Saturator();
  private exciter: Exciter;
  private stereo: StereoProcessor;
  private limiter: Limiter;
  private outGain = 1;
  private trimGain = 1;
  private dryL = new Float32Array(0); private dryR = new Float32Array(0);
  private tmpL = new Float32Array(0); private tmpR = new Float32Array(0);

  private inMeter: LevelMeter; private outMeter: LevelMeter;
  private corr: CorrelationMeter;
  private inLufs: LoudnessMeter; private outLufs: LoudnessMeter;
  /** Loudness metering costs CPU; the UI turns it on only while the Analyzer is open. */
  loudnessEnabled = false;

  constructor(fs: number, cfg?: NexusConfig) {
    this.fs = fs;
    this.tone = new ParametricEQ(fs);
    this.voice = new VoiceProcessor(fs);
    this.harmonics = new BassHarmonics(fs);
    this.gate = new DownwardExpander(fs, this.cfg.dynamics.gate);
    this.expander = new DownwardExpander(fs, this.cfg.dynamics.expander);
    this.deesser = new DeEsser(fs);
    this.comp = new Compressor(fs);
    this.multiband = new MultibandCompressor(fs);
    this.exciter = new Exciter(fs);
    this.stereo = new StereoProcessor(fs);
    this.limiter = new Limiter(fs);
    this.inMeter = new LevelMeter(fs); this.outMeter = new LevelMeter(fs);
    this.corr = new CorrelationMeter(fs);
    this.inLufs = new LoudnessMeter(fs); this.outLufs = new LoudnessMeter(fs);
    this.setConfig(cfg ?? defaultConfig());
  }

  /** All EQ bands that make up the tonal stage, in order. */
  toneBands(c: NexusConfig = this.cfg): EqBand[] {
    const bands: EqBand[] = c.eq.enabled
      ? (c.eq.mode === 'graphic' ? graphicBands(c.eq.layout, c.eq.graphic[c.eq.layout]) : c.eq.parametric)
      : [];
    const all = [...bands];
    if (c.room.enabled) all.push(...c.room.correction);
    if (c.headphone.enabled) all.push(...profileBands(c.headphone.profile));
    all.push(...bassEqBands(c.bass));
    return all;
  }

  setConfig(cfg: NexusConfig): void {
    this.cfg = cfg;
    const bands = this.toneBands(cfg);
    const boost = peakBoostDb(bands, this.fs);
    const protect = cfg.safety.autoPreamp ? -boost : -Math.max(0, boost - cfg.safety.maxBoostDb);
    const preamp = (cfg.eq.enabled ? cfg.eq.preampDb : 0) + protect;
    this.tone.setBands(bands); this.tone.setPreamp(preamp);

    this.trimGain = dbToLin(cfg.inputTrimDb);
    const hpGain = cfg.headphone.enabled ? cfg.headphone.profile.gainDb : 0;
    this.outGain = dbToLin(cfg.outputDb + hpGain);

    this.voice.set(cfg.voice);
    this.harmonics.amount = cfg.bass.enabled ? cfg.bass.harmonics : 0;

    const d = cfg.dynamics;
    this.gate.set(d.gate); this.expander.set(d.expander); this.deesser.set(d.deesser);
    this.comp.set({ ...d.compressor, makeupDb: d.autoGain ? autoMakeupDb(d.compressor.thresholdDb, d.compressor.ratio) : d.compressor.makeupDb });
    this.multiband.set({ ...d.multiband });
    this.sat.amount = d.saturation.amount; this.sat.mix = d.saturation.mix;
    this.exciter.amount = d.exciter.amount; this.exciter.setFreq(d.exciter.freq);

    const hp = cfg.headphone.enabled ? cfg.headphone.profile : null;
    this.stereo.set({
      ...cfg.stereo,
      width: cfg.stereo.width * (hp ? hp.width * (1 + 0.5 * hp.spatial) : 1),
      balance: Math.max(-1, Math.min(1, cfg.stereo.balance + (hp ? hp.balance : 0))),
      crossfeed: Math.max(cfg.stereo.crossfeed, hp ? hp.crossfeed : 0),
    });

    const ceiling = Math.min(cfg.safety.ceilingDb, d.enabled && d.limiter.enabled ? d.limiter.ceilingDb : cfg.safety.ceilingDb);
    this.limiter.set({ ceilingDb: ceiling, thresholdDb: d.enabled && d.limiter.enabled ? Math.min(d.limiter.thresholdDb, ceiling) : ceiling, releaseMs: d.limiter.releaseMs });

    this.report = {
      toneBoostDb: boost,
      appliedPreampDb: preamp,
      latencySamples: (this.limiterActive() ? this.limiter.latency : 0) + this.voice.latency,
      stages: this.stages(),
    };
  }

  private limiterActive(): boolean { return this.cfg.safety.clipProtection || (this.cfg.dynamics.enabled && this.cfg.dynamics.limiter.enabled); }

  private stages(): string[] {
    const c = this.cfg, s: string[] = [];
    if (c.bypass) return s;
    if (c.voice.enabled) s.push('voice');
    if (this.tone.activeStages > 0 || this.tone.preampDb !== 0) s.push('eq');
    if (c.bass.enabled && c.bass.harmonics > 0) s.push('bass-harmonics');
    if (c.dynamics.enabled) {
      if (c.dynamics.gate.enabled) s.push('gate');
      if (c.dynamics.expander.enabled) s.push('expander');
      if (c.dynamics.deesser.enabled) s.push('deesser');
      if (c.dynamics.multiband.enabled) s.push('multiband'); else if (c.dynamics.compressor.enabled) s.push('compressor');
      if (c.dynamics.saturation.amount > 0) s.push('saturation');
      if (c.dynamics.exciter.amount > 0) s.push('exciter');
    }
    if (!this.stereo.isNeutral) s.push('stereo');
    if (this.limiterActive()) s.push('limiter');
    return s;
  }

  reset(): void {
    this.voice.reset(); this.harmonics.reset(); this.gate.reset(); this.expander.reset(); this.deesser.reset();
    this.comp.reset(); this.multiband.reset(); this.exciter.reset(); this.stereo.reset(); this.limiter.reset();
    this.inLufs.reset(); this.outLufs.reset(); this.outMeter.resetClip();
  }

  private ensure(n: number): void {
    if (this.dryL.length >= n) return;
    this.dryL = new Float32Array(n); this.dryR = new Float32Array(n);
    this.tmpL = new Float32Array(n); this.tmpR = new Float32Array(n);
  }

  /** Processes `n` samples. Input and output buffers may be the same arrays. */
  process(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array, n: number): void {
    this.inMeter.update(inL, inR, n);
    if (this.loudnessEnabled) this.inLufs.update(inL, inR, n);
    if (outL !== inL) outL.set(inL.subarray(0, n));
    if (outR !== inR) outR.set(inR.subarray(0, n));
    const c = this.cfg;
    if (!c.bypass) {
      this.ensure(n);
      if (this.trimGain !== 1) for (let i = 0; i < n; i++) { outL[i] *= this.trimGain; outR[i] *= this.trimGain; }
      this.voice.process(outL, outR, n);
      this.tone.process(outL, outR, n);
      this.harmonics.process(outL, outR, n);
      const d = c.dynamics;
      if (d.enabled) {
        if (d.gate.enabled) this.gate.process(outL, outR, n);
        if (d.expander.enabled) this.expander.process(outL, outR, n);
        if (d.deesser.enabled) this.deesser.process(outL, outR, n);
        const useMb = d.multiband.enabled, useComp = !useMb && d.compressor.enabled;
        if (useMb || useComp) {
          const parallel = d.mix < 1;
          if (parallel) { this.dryL.set(outL.subarray(0, n)); this.dryR.set(outR.subarray(0, n)); }
          if (useMb) this.multiband.process(outL, outR, n); else this.comp.process(outL, outR, n);
          if (parallel) {
            const m = d.mix, dm = 1 - m;
            for (let i = 0; i < n; i++) { outL[i] = this.dryL[i] * dm + outL[i] * m; outR[i] = this.dryR[i] * dm + outR[i] * m; }
          }
        }
        this.sat.process(outL, outR, n);
        this.exciter.process(outL, outR, n);
        if (d.softClip) { softClip(outL, n); softClip(outR, n); }
      }
      this.stereo.process(outL, outR, n);
      if (this.outGain !== 1) for (let i = 0; i < n; i++) { outL[i] *= this.outGain; outR[i] *= this.outGain; }
      if (this.limiterActive()) this.limiter.process(outL, outR, n);
    }
    this.outMeter.update(outL, outR, n);
    this.corr.update(outL, outR, n);
    if (this.loudnessEnabled) this.outLufs.update(outL, outR, n);
  }

  get meters(): EngineMeters {
    return {
      inPeakDb: this.inMeter.peakDb, inRmsDb: this.inMeter.rmsDb,
      outPeakDb: this.outMeter.peakDb, outRmsDb: this.outMeter.rmsDb, outHeldDb: this.outMeter.heldDb,
      clipped: this.outMeter.clipped,
      compGrDb: this.cfg.dynamics.multiband.enabled ? Math.min(...this.multiband.grDb) : this.comp.grDb,
      limiterGrDb: this.limiterActive() ? this.limiter.grDb : 0,
      gateGrDb: Math.min(this.gate.grDb, this.expander.grDb), deesserGrDb: this.deesser.grDb,
      multibandGrDb: this.multiband.grDb,
      correlation: this.corr.correlation, monoLossDb: this.corr.monoLossDb, phaseInverted: this.corr.phaseInverted,
      momentaryLufs: this.outLufs.momentary, integratedLufs: this.outLufs.integrated,
    };
  }

  get inputMomentaryLufs(): number { return this.inLufs.momentary; }
  get inputIntegratedLufs(): number { return this.inLufs.integrated; }
  resetClip(): void { this.outMeter.resetClip(); }
}
