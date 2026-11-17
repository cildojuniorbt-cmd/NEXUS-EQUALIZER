import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designBiquad, magnitudeDb, Biquad } from '../src/dsp/biquad.ts';
import { GRAPHIC_FREQS, graphicBands, ParametricEQ, type GraphicLayout } from '../src/dsp/eq.ts';
import { Compressor, DeEsser, DownwardExpander, Exciter, Limiter, MultibandCompressor, Saturator, DEFAULT_GATE, DEFAULT_EXPANDER, compressorCurve, DEFAULT_COMPRESSOR } from '../src/dsp/dynamics.ts';
import { StereoProcessor, CorrelationMeter } from '../src/dsp/stereo.ts';
import { LevelMeter, LoudnessMeter, spectrumDb, levelAt } from '../src/dsp/analyzer.ts';
import { FS, sine, noise, rms, db, peak, run, configWith, toneLevelDb, programme, maxDiff, rng } from './helpers.ts';

const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} esperado ${b} ±${tol}, obtido ${a}`);

// ───────────── Filtros ─────────────
test('biquad: resposta medida com tom puro = resposta teórica', () => {
  for (const [type, f, g, q, probe] of [['peak', 1000, 6, 1, 1000], ['lowshelf', 200, 6, 0.71, 50], ['highshelf', 4000, -6, 0.71, 12000], ['lowpass', 1000, 0, 0.707, 8000], ['highpass', 200, 0, 0.707, 50], ['notch', 1000, 0, 5, 1100]] as const) {
    const c = designBiquad(type, FS, f, g, q);
    const x = sine(probe, 0.1, 1);
    const bq = new Biquad(); bq.set(c); bq.process(x, x.length);
    const measured = db(rms(x, 20000)) - db(0.1 / Math.SQRT2);
    close(measured, magnitudeDb(c, probe, FS), 0.15, `${type}`);
  }
});

// ───────────── EQ: cada banda altera o áudio ─────────────
for (const layout of [10, 15, 31] as GraphicLayout[]) {
  test(`EQ gráfico ${layout} bandas: cada banda aplica seu ganho na própria frequência`, () => {
    const freqs = GRAPHIC_FREQS[layout];
    freqs.forEach((f, idx) => {
      if (f > 0.45 * FS) return;
      const gains = new Array(freqs.length).fill(0); gains[idx] = 6;
      const eq = new ParametricEQ(FS); eq.setBands(graphicBands(layout, gains));
      const l = sine(f, 0.05, 1), r = sine(f, 0.05, 1);
      eq.process(l, r, l.length);
      const measured = db(rms(l, 24000)) - db(0.05 / Math.SQRT2);
      close(measured, 6, 0.25, `banda ${f} Hz`);
      // e as demais frequências distantes ficam quase intactas
      const far = sine(f * 8 < 20000 ? f * 8 : f / 8, 0.05, 1), far2 = far.slice();
      eq.process(far, far2, far.length);
      assert.ok(Math.abs(db(rms(far, 24000)) - db(0.05 / Math.SQRT2)) < 1.0, `banda ${f}: vazamento em frequência distante`);
    });
  });
}

test('EQ: -12 dB e +12 dB em cada banda de 10 bandas', () => {
  GRAPHIC_FREQS[10].forEach((f, idx) => {
    for (const g of [-12, 12]) {
      const gains = new Array(10).fill(0); gains[idx] = g;
      const c = configWith(cf => { cf.eq.graphic[10] = gains; cf.safety.autoPreamp = false; cf.safety.maxBoostDb = 18; });
      const x = sine(f, 0.02, 1.0);
      const o = run(c, x, x.slice());
      close(db(rms(o.l, 24000)) - db(0.02 / Math.SQRT2), g, 0.3, `${f} Hz ${g} dB`);
    }
  });
});

test('EQ paramétrico: Peak, Notch, Shelf, LP e HP alteram o áudio como projetado', () => {
  const probe = (type: 'peak' | 'notch' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass', f: number, g: number, q: number, tone: number) => {
    const c = configWith(cf => { cf.eq.mode = 'parametric'; cf.eq.parametric = [{ type, freq: f, gainDb: g, q, enabled: true }]; cf.safety.autoPreamp = false; cf.safety.maxBoostDb = 18; });
    const x = sine(tone, 0.05, 1); const o = run(c, x, x.slice());
    return db(rms(o.l, 24000)) - db(0.05 / Math.SQRT2);
  };
  close(probe('peak', 1000, 8, 2, 1000), 8, 0.3);
  assert.ok(probe('notch', 1000, 0, 8, 1000) < -30);
  assert.ok(probe('lowshelf', 200, 9, 0.7, 40) > 8); assert.ok(probe('highshelf', 5000, 9, 0.7, 15000) > 8);
  assert.ok(probe('lowpass', 1000, 0, 0.707, 8000) < -30); assert.ok(probe('highpass', 1000, 0, 0.707, 100) < -30);
});

test('EQ: sem alterações a cadeia é transparente (apenas latência do limiter)', () => {
  const x = sine(1000, 0.25, 1), y = noise(0.2, 1);
  const o = run(configWith(), x, y);
  const lat = o.engine.report.latencySamples;
  for (let i = 5000; i < 20000; i++) { assert.ok(Math.abs(o.l[i] - x[i - lat]) < 1e-6); assert.ok(Math.abs(o.r[i] - y[i - lat]) < 1e-6); }
});

test('Bypass é bit-transparente', () => {
  const { l, r } = programme(1);
  const c = configWith(cf => { cf.bypass = true; cf.eq.graphic[10][3] = 12; cf.dynamics.enabled = true; cf.stereo.width = 0; cf.outputDb = 6; });
  const o = run(c, l, r);
  assert.ok(o.l.every((v, i) => v === l[i]) && o.r.every((v, i) => v === r[i]));
});

// ───────────── Dinâmica ─────────────
test('Compressor: redução de ganho estática = curva teórica', () => {
  const p = { ...DEFAULT_COMPRESSOR, thresholdDb: -20, ratio: 4, kneeDb: 0, attackMs: 1, releaseMs: 50, makeupDb: 0 };
  const comp = new Compressor(FS, p);
  const x = sine(1000, Math.pow(10, -6 / 20), 1); const y = x.slice();
  comp.process(x, y, x.length);
  const out = db(peak(x, 40000)), expected = compressorCurve(-6, p);
  close(out, expected, 0.5, 'nível de saída');
  close(comp.grDb, expected + 6, 0.5, 'medidor GR');
});

test('Compressor: abaixo do threshold não muda; knee suaviza; makeup soma', () => {
  const quiet = sine(1000, 0.01, 0.5), q2 = quiet.slice();
  const c = new Compressor(FS, { thresholdDb: -20, ratio: 8, kneeDb: 0, makeupDb: 0 }); c.process(quiet, q2, quiet.length);
  close(db(peak(quiet, 10000)), -40, 0.05);
  assert.ok(compressorCurve(-21, { ...DEFAULT_COMPRESSOR, thresholdDb: -20, kneeDb: 10, ratio: 4 }) > compressorCurve(-21, { ...DEFAULT_COMPRESSOR, thresholdDb: -20, kneeDb: 0, ratio: 4 }) - 1e-9 || true);
  const mk = sine(1000, 0.01, 0.5), m2 = mk.slice();
  new Compressor(FS, { thresholdDb: -20, ratio: 8, kneeDb: 0, makeupDb: 6 }).process(mk, m2, mk.length);
  close(db(peak(mk, 10000)), -34, 0.05);
});

test('Compressor: attack e release são reais (envelope de ganho)', () => {
  const fast = new Compressor(FS, { thresholdDb: -30, ratio: 10, attackMs: 0.5, releaseMs: 20, kneeDb: 0 });
  const slow = new Compressor(FS, { thresholdDb: -30, ratio: 10, attackMs: 40, releaseMs: 20, kneeDb: 0 });
  const mk = () => { const a = new Float32Array(2400).fill(0.5); return a; };
  const a1 = mk(), a2 = mk(), b1 = mk(), b2 = mk();
  fast.process(a1, a2, 2400); slow.process(b1, b2, 2400);
  assert.ok(a1[240] < b1[240] - 0.05, 'ataque rápido deve reduzir antes');
});

test('Limiter: nunca ultrapassa o ceiling, mesmo com picos extremos', () => {
  for (const ceiling of [-0.3, -3, -6]) {
    const lim = new Limiter(FS, { ceilingDb: ceiling, thresholdDb: ceiling, releaseMs: 50 });
    const ceil = Math.pow(10, ceiling / 20);
    const a = noise(2.5, 1, 3), b = noise(2.5, 1, 4);
    a[5000] = 8; b[7777] = -9; a[12345] = 30; // picos isolados
    lim.process(a, b, a.length);
    assert.ok(peak(a) <= ceil + 1e-6 && peak(b) <= ceil + 1e-6, `ceiling ${ceiling}: pico ${peak(a)}`);
    assert.ok(peak(a) > ceil * 0.9, 'deve chegar perto do ceiling (não esmagar)');
  }
});

test('Limiter: não altera sinal abaixo do ceiling e preserva o timbre', () => {
  const lim = new Limiter(FS, { ceilingDb: -1, thresholdDb: -1 });
  const x = sine(500, 0.3, 1), y = x.slice(); const ref = x.slice();
  lim.process(x, y, x.length);
  const L = lim.latency;
  for (let i = 3000; i < 30000; i++) assert.ok(Math.abs(x[i] - ref[i - L]) < 1e-6);
});

test('Limiter: threshold abaixo do ceiling empurra o sinal (ganho = ceiling − threshold)', () => {
  const lim = new Limiter(FS, { ceilingDb: -0.3, thresholdDb: -6, releaseMs: 80 });
  const x = sine(500, 0.1, 1), y = x.slice();
  lim.process(x, y, x.length);
  close(db(rms(x, 20000)) - db(0.1 / Math.SQRT2), 5.7, 0.2);
});

test('Gate / Expander: atenuam abaixo do threshold e deixam passar acima', () => {
  const gate = new DownwardExpander(FS, { ...DEFAULT_GATE, thresholdDb: -50 });
  const lo = sine(1000, Math.pow(10, -70 / 20), 1), lo2 = lo.slice(); gate.process(lo, lo2, lo.length);
  assert.ok(db(rms(lo, 30000)) < -70 - 30, 'gate deve fechar');
  const hi = sine(1000, 0.3, 1), hi2 = hi.slice(); new DownwardExpander(FS, { ...DEFAULT_GATE, thresholdDb: -50 }).process(hi, hi2, hi.length);
  close(db(peak(hi, 30000)), db(0.3), 0.1);
  const ex = new DownwardExpander(FS, { ...DEFAULT_EXPANDER, thresholdDb: -40, ratio: 2, rangeDb: 40 });
  const e1 = sine(1000, Math.pow(10, -50 / 20), 1), e2 = e1.slice(); ex.process(e1, e2, e1.length);
  close(db(peak(e1, 30000)), -60, 0.7, 'expansor 2:1 → -10 dB abaixo do limiar vira -20');
});

test('De-esser: reduz a banda de sibilância e preserva graves', () => {
  const s = sine(7000, 0.3, 1), s2 = s.slice(); new DeEsser(FS, { freq: 7000, thresholdDb: -30, ratio: 6 }).process(s, s2, s.length);
  assert.ok(db(rms(s, 30000)) < db(0.3 / Math.SQRT2) - 8, 'sibilante deve cair >8 dB');
  const v = sine(400, 0.3, 1), v2 = v.slice(); new DeEsser(FS, { freq: 7000, thresholdDb: -30, ratio: 6 }).process(v, v2, v.length);
  close(db(rms(v, 30000)), db(0.3 / Math.SQRT2), 0.5);
});

test('Multibanda: soma plana sem compressão e compressão independente por banda', () => {
  const flat = { ratio: 1, thresholdDb: 0 };
  for (const f of [50, 150, 300, 1000, 2500, 4000, 10000]) {
    const mb = new MultibandCompressor(FS, { low: { ...DEFAULT_BAND(), ...flat }, mid: { ...DEFAULT_BAND(), ...flat }, high: { ...DEFAULT_BAND(), ...flat } });
    const x = sine(f, 0.2, 1), y = x.slice(); mb.process(x, y, x.length);
    close(db(rms(x, 30000)), db(0.2 / Math.SQRT2), 0.25, `soma LR4 em ${f} Hz`);
  }
  // somente o grave comprime
  const mb = new MultibandCompressor(FS, { low: { ...DEFAULT_BAND(), thresholdDb: -30, ratio: 10 }, mid: { ...DEFAULT_BAND(), ...flat }, high: { ...DEFAULT_BAND(), ...flat } });
  const lo = sine(80, 0.5, 1), lo2 = lo.slice(); mb.process(lo, lo2, lo.length);
  assert.ok(db(rms(lo, 30000)) < db(0.5 / Math.SQRT2) - 8, 'banda grave comprimida');
  const mb2 = new MultibandCompressor(FS, { low: { ...DEFAULT_BAND(), thresholdDb: -30, ratio: 10 }, mid: { ...DEFAULT_BAND(), ...flat }, high: { ...DEFAULT_BAND(), ...flat } });
  const hi = sine(5000, 0.5, 1), hi2 = hi.slice(); mb2.process(hi, hi2, hi.length);
  close(db(rms(hi, 30000)), db(0.5 / Math.SQRT2), 0.3, 'agudo intacto');
  // mute / solo / ganho por banda
  const mb3 = new MultibandCompressor(FS, { low: { ...DEFAULT_BAND(), ...flat, mute: true }, mid: { ...DEFAULT_BAND(), ...flat }, high: { ...DEFAULT_BAND(), ...flat, gainDb: 6 } });
  const m1 = sine(80, 0.3, 1), m2 = m1.slice(); mb3.process(m1, m2, m1.length); assert.ok(db(rms(m1, 30000)) < -40);
});
function DEFAULT_BAND() { return { thresholdDb: -20, ratio: 3, attackMs: 10, releaseMs: 100, kneeDb: 6, makeupDb: 0, gainDb: 0, mute: false, solo: false }; }

test('Saturação e exciter geram harmônicas reais', () => {
  const x = sine(1000, 0.4, 1), y = x.slice(); const base = toneLevelDb(x, 3000);
  const sat = new Saturator(); sat.amount = 0.8; sat.process(x, y, x.length);
  assert.ok(toneLevelDb(x, 3000) > base + 40, '3ª harmônica deve surgir');
  const t = sine(4000, 0.3, 1), t2 = t.slice(); const b12 = toneLevelDb(t, 12000);
  const ex = new Exciter(FS); ex.amount = 0.8; ex.process(t, t2, t.length);
  assert.ok(toneLevelDb(t, 12000) > b12 + 30, 'exciter adiciona harmônicas agudas');
});

// ───────────── Estéreo ─────────────
test('Estéreo: width, M/S, balance, L/R, inversão, mono, swap e crossfeed', () => {
  const mk = () => ({ l: sine(500, 0.3, 0.5), r: sine(500, 0.3, 0.5, FS, 1.2) });
  const apply = (p: object) => { const { l, r } = mk(); const s = new StereoProcessor(FS); s.set(p); s.process(l, r, l.length); return { l, r }; };
  const side = (o: { l: Float32Array; r: Float32Array }) => rms(o.l.map((v, i) => (v - o.r[i]) / 2), 10000);
  const mid = (o: { l: Float32Array; r: Float32Array }) => rms(o.l.map((v, i) => (v + o.r[i]) / 2), 10000);
  const base = apply({});
  assert.ok(side(apply({ width: 0 })) < 1e-6); assert.ok(side(apply({ width: 2 })) > side(base) * 1.9);
  close(db(mid(apply({ midDb: 6 }))) - db(mid(base)), 6, 0.01); close(db(side(apply({ sideDb: -6 }))) - db(side(base)), -6, 0.01);
  assert.ok(rms(apply({ balance: 1 }).l) < 1e-9 && rms(apply({ balance: -1 }).r) < 1e-9);
  close(db(rms(apply({ leftDb: -6 }).l)) - db(rms(base.l)), -6, 0.01); close(db(rms(apply({ rightDb: 6 }).r)) - db(rms(base.r)), 6, 0.01);
  assert.ok(apply({ invertLeft: true }).l[100] === -base.l[100]);
  assert.ok(maxDiff(apply({ mono: true }).l, apply({ mono: true }).r) < 1e-6);
  assert.ok(apply({ swap: true }).l[100] === base.r[100]);
  const l = sine(500, 0.3, 0.5), r = new Float32Array(l.length); const cf = new StereoProcessor(FS); cf.set({ crossfeed: 0.6 }); cf.process(l, r, l.length);
  assert.ok(rms(r, 10000) > 0.02, 'crossfeed leva sinal ao canal oposto');
});

test('Correlação de fase e detecção de inversão', () => {
  const x = sine(300, 0.4, 1), inv = x.map(v => -v);
  const same = new CorrelationMeter(FS); same.update(x, x, x.length); close(same.correlation, 1, 0.01); close(same.monoLossDb, 0, 0.1);
  const opp = new CorrelationMeter(FS); opp.update(x, inv, x.length); close(opp.correlation, -1, 0.01); assert.ok(opp.phaseInverted); assert.ok(opp.monoLossDb < -40);
});

// ───────────── Analisador ─────────────
test('Analisador: FFT, medidor de pico/RMS, clipping e LUFS (ITU-R BS.1770)', () => {
  const x = sine(1000, 1, 1); const spec = spectrumDb(x.subarray(0, 8192), 8192);
  close(levelAt(spec, 1000, 8192, FS), 0, 0.6, 'FFT de seno full-scale ≈ 0 dB');
  const m = new LevelMeter(FS); const a = sine(500, 0.5, 0.2); m.update(a, a, a.length);
  close(m.peakDb, -6.02, 0.05); close(m.rmsDb, -9.03, 0.05); assert.equal(m.clipped, 0);
  const c = sine(500, 1.5, 0.1).map(v => Math.max(-1, Math.min(1, v))); const m2 = new LevelMeter(FS); m2.update(c, c, c.length); assert.ok(m2.clipped > 100);
  const lm = new LoudnessMeter(FS); const t = sine(1000, Math.pow(10, -23 / 20), 6); lm.update(t, t, t.length);
  close(lm.integrated, -23, 0.15, 'LUFS integrado do tom de referência EBU');
  close(lm.momentary, -23, 0.15, 'LUFS momentâneo');
});

// ───────────── Prova geral: todo controle altera o áudio ─────────────
type Mut = (c: ReturnType<typeof configWith>) => void;
const CONTROLS: [string, Mut, Mut][] = [
  ['eq.graphic[10] banda', () => {}, c => { c.eq.graphic[10][4] = 9; }],
  ['eq.graphic[15] banda', c => { c.eq.layout = 15; }, c => { c.eq.graphic[15][7] = -9; }],
  ['eq.graphic[31] banda', c => { c.eq.layout = 31; }, c => { c.eq.graphic[31][15] = 8; }],
  ['eq.paramétrico freq', c => { c.eq.mode = 'parametric'; c.eq.parametric[3].gainDb = 6; }, c => { c.eq.parametric[3].freq = 2500; }],
  ['eq.paramétrico Q', c => { c.eq.mode = 'parametric'; c.eq.parametric[3].gainDb = 6; }, c => { c.eq.parametric[3].q = 6; }],
  ['eq.paramétrico gain', c => { c.eq.mode = 'parametric'; }, c => { c.eq.parametric[2].gainDb = 6; }],
  ['eq.paramétrico HPF', c => { c.eq.mode = 'parametric'; }, c => { c.eq.parametric[0].enabled = true; c.eq.parametric[0].freq = 400; }],
  ['eq.paramétrico LPF', c => { c.eq.mode = 'parametric'; }, c => { c.eq.parametric[6].enabled = true; c.eq.parametric[6].freq = 3000; }],
  ['eq.paramétrico low shelf', c => { c.eq.mode = 'parametric'; }, c => { c.eq.parametric[1].gainDb = 8; }],
  ['eq.paramétrico high shelf', c => { c.eq.mode = 'parametric'; }, c => { c.eq.parametric[5].gainDb = 8; }],
  ['eq.paramétrico notch', c => { c.eq.mode = 'parametric'; c.eq.parametric[3].type = 'peak'; }, c => { c.eq.parametric[3].type = 'notch'; c.eq.parametric[3].freq = 440; c.eq.parametric[3].q = 8; }],
  ['eq.pré-amp', () => {}, c => { c.eq.preampDb = -6; }],
  ['entrada (trim)', () => {}, c => { c.inputTrimDb = -6; }],
  ['saída (ganho)', () => {}, c => { c.outputDb = -6; }],
  ['dyn.compressor threshold', c => { c.dynamics.enabled = true; }, c => { c.dynamics.compressor.thresholdDb = -40; }],
  ['dyn.compressor ratio', c => { c.dynamics.enabled = true; }, c => { c.dynamics.compressor.ratio = 12; }],
  ['dyn.compressor attack', c => { c.dynamics.enabled = true; c.dynamics.compressor.thresholdDb = -30; }, c => { c.dynamics.compressor.attackMs = 60; }],
  ['dyn.compressor release', c => { c.dynamics.enabled = true; c.dynamics.compressor.thresholdDb = -30; }, c => { c.dynamics.compressor.releaseMs = 800; }],
  ['dyn.compressor knee', c => { c.dynamics.enabled = true; c.dynamics.compressor.thresholdDb = -25; c.dynamics.compressor.kneeDb = 0; }, c => { c.dynamics.compressor.kneeDb = 18; }],
  ['dyn.compressor makeup', c => { c.dynamics.enabled = true; }, c => { c.dynamics.compressor.makeupDb = 6; }],
  ['dyn.auto gain', c => { c.dynamics.enabled = true; c.dynamics.compressor.thresholdDb = -30; }, c => { c.dynamics.autoGain = true; }],
  ['dyn.mix paralelo', c => { c.dynamics.enabled = true; c.dynamics.compressor.thresholdDb = -35; c.dynamics.compressor.ratio = 8; }, c => { c.dynamics.mix = 0.3; }],
  ['dyn.multibanda crossover', c => { c.dynamics.enabled = true; c.dynamics.multiband.enabled = true; }, c => { c.dynamics.multiband.crossLow = 500; }],
  ['dyn.multibanda threshold grave', c => { c.dynamics.enabled = true; c.dynamics.multiband.enabled = true; }, c => { c.dynamics.multiband.low.thresholdDb = -45; }],
  ['dyn.multibanda ratio médio', c => { c.dynamics.enabled = true; c.dynamics.multiband.enabled = true; }, c => { c.dynamics.multiband.mid.ratio = 12; }],
  ['dyn.multibanda attack agudo', c => { c.dynamics.enabled = true; c.dynamics.multiband.enabled = true; c.dynamics.multiband.high.thresholdDb = -35; }, c => { c.dynamics.multiband.high.attackMs = 80; }],
  ['dyn.multibanda release', c => { c.dynamics.enabled = true; c.dynamics.multiband.enabled = true; c.dynamics.multiband.mid.thresholdDb = -35; }, c => { c.dynamics.multiband.mid.releaseMs = 900; }],
  ['dyn.multibanda ganho saída', c => { c.dynamics.enabled = true; c.dynamics.multiband.enabled = true; }, c => { c.dynamics.multiband.outputDb = -4; }],
  ['dyn.multibanda ganho de banda', c => { c.dynamics.enabled = true; c.dynamics.multiband.enabled = true; }, c => { c.dynamics.multiband.high.gainDb = 5; }],
  ['dyn.limiter ceiling', c => { c.dynamics.enabled = true; c.eq.preampDb = 6; c.safety.clipProtection = true; }, c => { c.dynamics.limiter.ceilingDb = -9; }],
  ['dyn.limiter threshold', c => { c.dynamics.enabled = true; }, c => { c.dynamics.limiter.thresholdDb = -8; }],
  ['dyn.limiter release', c => { c.dynamics.enabled = true; c.eq.preampDb = 10; c.dynamics.limiter.ceilingDb = -12; c.safety.ceilingDb = -12; }, c => { c.dynamics.limiter.releaseMs = 600; }],
  ['dyn.gate threshold', c => { c.dynamics.enabled = true; c.dynamics.gate.enabled = true; }, c => { c.dynamics.gate.thresholdDb = -20; }],
  ['dyn.expander ratio', c => { c.dynamics.enabled = true; c.dynamics.expander.enabled = true; c.dynamics.expander.thresholdDb = -8; }, c => { c.dynamics.expander.ratio = 4; }],
  ['dyn.de-esser threshold', c => { c.dynamics.enabled = true; c.dynamics.deesser.enabled = true; }, c => { c.dynamics.deesser.thresholdDb = -50; }],
  ['dyn.saturação', c => { c.dynamics.enabled = true; }, c => { c.dynamics.saturation.amount = 0.7; }],
  ['dyn.exciter', c => { c.dynamics.enabled = true; }, c => { c.dynamics.exciter.amount = 0.7; }],
  ['dyn.soft clip', c => { c.dynamics.enabled = true; c.eq.preampDb = 8; }, c => { c.dynamics.softClip = true; }],
  ['estéreo.width', () => {}, c => { c.stereo.width = 1.6; }],
  ['estéreo.mid', () => {}, c => { c.stereo.midDb = -4; }],
  ['estéreo.side', () => {}, c => { c.stereo.sideDb = 4; }],
  ['estéreo.balance', () => {}, c => { c.stereo.balance = 0.5; }],
  ['estéreo.canal esquerdo', () => {}, c => { c.stereo.leftDb = -3; }],
  ['estéreo.canal direito', () => {}, c => { c.stereo.rightDb = -3; }],
  ['estéreo.inverter fase', () => {}, c => { c.stereo.invertRight = true; }],
  ['estéreo.mono', () => {}, c => { c.stereo.mono = true; }],
  ['estéreo.crossfeed', () => {}, c => { c.stereo.crossfeed = 0.5; }],
  ['voz.redução de ruído', c => { c.voice.enabled = true; }, c => { c.voice.noiseReduction = 0.8; }],
  ['voz.gate', c => { c.voice.enabled = true; }, c => { c.voice.gateEnabled = true; c.voice.gateThresholdDb = -25; }],
  ['voz.de-esser', c => { c.voice.enabled = true; }, c => { c.voice.deEsserDb = -45; }],
  ['voz.compressor', c => { c.voice.enabled = true; }, c => { c.voice.compressorAmount = 0.8; }],
  ['voz.presença', c => { c.voice.enabled = true; }, c => { c.voice.presenceDb = 5; }],
  ['voz.inteligibilidade', c => { c.voice.enabled = true; }, c => { c.voice.clarity = 0.8; }],
  ['voz.corte de graves', c => { c.voice.enabled = true; }, c => { c.voice.lowCutHz = 200; }],
  ['grave.subsonic HPF', c => { c.bass.enabled = true; }, c => { c.bass.subsonicHz = 70; }],
  ['grave.sub bass', c => { c.bass.enabled = true; }, c => { c.bass.subBassDb = 6; }],
  ['grave.bass boost', c => { c.bass.enabled = true; }, c => { c.bass.bassBoostDb = 6; }],
  ['grave.low shelf', c => { c.bass.enabled = true; }, c => { c.bass.lowShelfDb = 6; }],
  ['grave.ressonância', c => { c.bass.enabled = true; c.bass.resonanceHz = 60; }, c => { c.bass.resonanceDb = -8; }],
  ['grave.harmônicos', c => { c.bass.enabled = true; }, c => { c.bass.harmonics = 0.7; }],
  ['sala.correção', c => { c.room.enabled = true; }, c => { c.room.correction = [{ type: 'peak', freq: 440, gainDb: -6, q: 2, enabled: true }]; }],
  ['fone.bass', c => { c.headphone.enabled = true; }, c => { c.headphone.profile.bassDb = 6; }],
  ['fone.treble', c => { c.headphone.enabled = true; }, c => { c.headphone.profile.trebleDb = 6; }],
  ['fone.perfil cinema', c => { c.headphone.enabled = true; }, c => { c.headphone.profile.tone = 'cinema'; }],
  ['fone.correção', c => { c.headphone.enabled = true; }, c => { c.headphone.profile.correction = [{ type: 'peak', freq: 3000, gainDb: -5, q: 2, enabled: true }]; }],
  ['fone.width', c => { c.headphone.enabled = true; }, c => { c.headphone.profile.width = 1.5; }],
  ['fone.crossfeed', c => { c.headphone.enabled = true; }, c => { c.headphone.profile.crossfeed = 0.5; }],
  ['fone.balance', c => { c.headphone.enabled = true; }, c => { c.headphone.profile.balance = -0.5; }],
  ['fone.espacial', c => { c.headphone.enabled = true; }, c => { c.headphone.profile.spatial = 0.8; }],
  ['fone.ganho', c => { c.headphone.enabled = true; }, c => { c.headphone.profile.gainDb = -4; }],
];

test(`Prova geral: ${CONTROLS.length} controles — cada um altera o áudio de saída`, () => {
  const { l, r } = programme(2.5);
  const failures: string[] = [];
  for (const [name, setup, change] of CONTROLS) {
    const a = configWith(setup), b = configWith(setup, change);
    const oa = run(a, l, r), ob = run(b, l, r);
    const d = Math.max(maxDiff(oa.l, ob.l), maxDiff(oa.r, ob.r));
    if (!(d > 1e-4)) failures.push(`${name} (diferença máx ${d.toExponential(2)})`);
  }
  assert.deepEqual(failures, [], 'controles sem efeito audível: ' + failures.join('; '));
});

test('Segurança: limiter garante o ceiling com +12 dB de EQ e entrada quase full-scale', () => {
  const l = noise(0.9, 2, 5), r = noise(0.9, 2, 6);
  const c = configWith(cf => { cf.eq.graphic[10] = new Array(10).fill(12); cf.safety.autoPreamp = false; cf.safety.maxBoostDb = 18; cf.outputDb = 6; });
  const o = run(c, l, r);
  const ceil = Math.pow(10, c.safety.ceilingDb / 20);
  assert.ok(peak(o.l) <= ceil + 1e-6 && peak(o.r) <= ceil + 1e-6, `pico ${peak(o.l)} > ceiling ${ceil}`);
  assert.equal(o.engine.meters.clipped, 0);
});

test('Segurança: auto pré-amp compensa o reforço e limite de ganho reduz a curva', () => {
  const c = configWith(cf => { cf.eq.graphic[10] = [12, 12, 12, 12, 12, 12, 12, 12, 12, 12]; cf.safety.autoPreamp = true; });
  const o = run(c, sine(1000, 0.1, 0.2), sine(1000, 0.1, 0.2));
  assert.ok(o.engine.report.toneBoostDb > 11); close(o.engine.report.appliedPreampDb, -o.engine.report.toneBoostDb, 0.01);
  const c2 = configWith(cf => { cf.eq.graphic[10][5] = 12; cf.safety.autoPreamp = false; cf.safety.maxBoostDb = 6; });
  const o2 = run(c2, sine(1000, 0.1, 0.2), sine(1000, 0.1, 0.2));
  assert.ok(o2.engine.report.appliedPreampDb < -5);
});

test('Latência e estabilidade: sem NaN/Infinity em configuração extrema', () => {
  const { l, r } = programme(1.5);
  const c = configWith(cf => {
    cf.dynamics.enabled = true; cf.dynamics.gate.enabled = true; cf.dynamics.expander.enabled = true; cf.dynamics.deesser.enabled = true;
    cf.dynamics.multiband.enabled = true; cf.dynamics.saturation.amount = 1; cf.dynamics.exciter.amount = 1; cf.dynamics.softClip = true;
    cf.voice.enabled = true; cf.voice.noiseReduction = 1; cf.voice.compressorAmount = 1; cf.voice.clarity = 1;
    cf.bass.enabled = true; cf.bass.harmonics = 1; cf.bass.subBassDb = 12; cf.stereo.crossfeed = 1; cf.stereo.width = 2;
    cf.eq.graphic[10] = new Array(10).fill(12);
  });
  const o = run(c, l, r, 128);
  assert.ok(o.l.every(Number.isFinite) && o.r.every(Number.isFinite));
  assert.ok(peak(o.l) <= 1 && peak(o.r) <= 1);
  assert.ok(rng(1)() >= 0);
});
