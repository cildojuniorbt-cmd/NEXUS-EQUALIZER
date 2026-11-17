import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNativePlan, PLAN_FREQS, unsupportedModules } from '../src/native/plan.ts';
import { defaultConfig } from '../src/dsp/config.ts';

const close = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} esperado ${b} ±${tol}, obtido ${a}`);

test('Plano nativo: configuração padrão é plana, sem módulos não suportados', () => {
  const p = buildNativePlan(defaultConfig());
  assert.equal(p.eq.gainsDb.length, PLAN_FREQS.length);
  assert.ok(p.eq.gainsDb.every(g => Math.abs(g) < 0.1));
  assert.deepEqual(p.unsupported, []);
  assert.equal(p.compressor.enabled, false);
  assert.equal(p.enabled, true);
  assert.equal(p.limiter.enabled, true); // proteção contra clipping ligada por padrão
});

test('Plano nativo: EQ +6 dB em 1 kHz vira ≈ +6 dB na banda de 1 kHz e o pré-amp automático compensa', () => {
  const c = defaultConfig(); c.eq.graphic[10][5] = 6;
  const p = buildNativePlan(c);
  close(p.eq.gainsDb[PLAN_FREQS.indexOf(1000)], 6, 0.6, 'banda 1 kHz');
  assert.ok(p.preampDb <= -5, `pré-amp automático deveria compensar (obtido ${p.preampDb})`);
  const c2 = defaultConfig(); c2.eq.graphic[10][5] = 6; c2.safety.autoPreamp = false; c2.safety.maxBoostDb = 12;
  assert.equal(buildNativePlan(c2).preampDb, 0);
});

test('Plano nativo: sala, fones e graves entram na curva combinada', () => {
  const c = defaultConfig();
  c.room.enabled = true; c.room.correction = [{ type: 'peak', freq: 100, gainDb: -6, q: 2, enabled: true }];
  c.safety.autoPreamp = false;
  close(buildNativePlan(c).eq.gainsDb[PLAN_FREQS.indexOf(100)], -6, 0.8, 'sala 100 Hz');
  const h = defaultConfig(); h.bass.enabled = true; h.bass.bassBoostDb = 6; h.safety.autoPreamp = false;
  assert.ok(buildNativePlan(h).eq.gainsDb[PLAN_FREQS.indexOf(80)] > 3, 'bass boost deveria aparecer em 80 Hz');
});

test('Plano nativo: dinâmica, limiter e bypass', () => {
  const c = defaultConfig(); c.dynamics.enabled = true; c.dynamics.compressor.enabled = true; c.dynamics.compressor.thresholdDb = -24; c.dynamics.compressor.ratio = 6;
  c.dynamics.limiter.enabled = true; c.dynamics.limiter.ceilingDb = -2; c.dynamics.limiter.thresholdDb = -2;
  let p = buildNativePlan(c);
  assert.equal(p.compressor.enabled, true); assert.equal(p.compressor.ratio, 6); assert.equal(p.limiter.ceilingDb, -2);
  c.dynamics.multiband.enabled = true; p = buildNativePlan(c);
  assert.equal(p.compressor.enabled, false, 'multibanda substitui o compressor único');
  assert.equal(p.multiband.enabled, true);
  assert.equal(buildNativePlan(c, false).enabled, false);
  c.dynamics.enabled = false; assert.equal(buildNativePlan(c).compressor.enabled, false);
});

test('Plano nativo: módulos que a plataforma não aplica são listados, não escondidos', () => {
  const c = defaultConfig(); c.stereo.width = 1.5; c.voice.enabled = true; c.dynamics.enabled = true; c.dynamics.deesser.enabled = true; c.dynamics.saturation.amount = 0.3;
  const u = unsupportedModules(c);
  assert.equal(u.length, 4);
  assert.ok(u.some(x => x.startsWith('Stereo')) && u.some(x => x.startsWith('Voice')) && u.includes('De-Esser') && u.includes('Saturação / Exciter'));
});
