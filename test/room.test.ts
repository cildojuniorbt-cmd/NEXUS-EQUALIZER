import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fft, ifft, nextPow2 } from '../src/dsp/analyzer.ts';
import { designBiquad, Biquad } from '../src/dsp/biquad.ts';
import { DEFAULT_ROOM, analyzeMeasurement, deconvolveSweep, estimateRt60, generateLogSweep, roomModes, speakerAlignment, estimateRt60FromIr } from '../src/dsp/room.ts';
import { rng } from './helpers.ts';

const FS = 48000;
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} esperado ${b} ±${tol}, obtido ${a}`);

/** Linear convolution via FFT. */
function convolve(x: ArrayLike<number>, h: ArrayLike<number>): Float64Array {
  const N = nextPow2(x.length + h.length);
  const xr = new Float64Array(N), xi = new Float64Array(N), hr = new Float64Array(N), hi = new Float64Array(N);
  for (let i = 0; i < x.length; i++) xr[i] = x[i];
  for (let i = 0; i < h.length; i++) hr[i] = h[i];
  fft(xr, xi); fft(hr, hi);
  for (let k = 0; k < N; k++) { const a = xr[k] * hr[k] - xi[k] * hi[k], b = xr[k] * hi[k] + xi[k] * hr[k]; xr[k] = a; xi[k] = b; }
  ifft(xr, xi);
  return xr.slice(0, x.length + h.length - 1);
}

/** Synthetic room: direct sound after `delayMs` plus exponentially decaying noise with the given RT60. */
function syntheticIr(rt60: number, delayMs = 20, seconds = 1.2, seed = 3): Float64Array {
  const n = Math.round(seconds * FS), ir = new Float64Array(n), r = rng(seed), d0 = Math.round(delayMs * FS / 1000);
  const tau = rt60 / (3 * Math.LN10); // amplitude falls 60 dB (×1e-3) after rt60
  ir[d0] = 1;
  for (let i = d0 + 1; i < n; i++) ir[i] = 0.25 * (r() * 2 - 1) * Math.exp(-(i - d0) / FS / tau);
  return ir;
}

test('Sala: sweep + deconvolução recuperam o RT60 de uma sala sintética (±20 %)', () => {
  for (const rt60 of [0.4, 0.8]) {
    const sweep = generateLogSweep(20, 20000, 4, FS);
    const recorded = convolve(sweep, syntheticIr(rt60));
    const ir = deconvolveSweep(recorded, sweep, FS);
    const est = estimateRt60FromIr(ir, FS);
    assert.ok(est !== null, `RT60 ${rt60}: sem estimativa`);
    close(est!, rt60, rt60 * 0.2, `RT60 ${rt60}`);
  }
});

test('Sala: a resposta medida reproduz um pico de +6 dB em 100 Hz e o ajuste sugere um corte', () => {
  const sweep = generateLogSweep(20, 20000, 4, FS);
  const f = new Biquad(); f.set(designBiquad('peak', FS, 100, 6, 2));
  const shaped = Float32Array.from(sweep, v => f.tick(v));
  const result = analyzeMeasurement(deconvolveSweep(shaped, sweep, FS), FS);
  assert.equal(result.calibrated, false);
  const at = (hz: number) => result.response.reduce((b, p) => (Math.abs(Math.log(p.freq / hz)) < Math.abs(Math.log(b.freq / hz)) ? p : b)).db;
  close(at(100) - at(1000), 6, 1.5, 'pico em 100 Hz');
  assert.ok(result.deviations.some(d => d.kind === 'pico' && d.freq > 70 && d.freq < 140), 'pico não detectado');
  const cut = result.suggested.find(b => b.freq > 70 && b.freq < 140);
  assert.ok(cut && cut.gainDb < -2, 'sugestão deveria cortar o pico');
});

test('Sala: alinhamento de caixas, modos axiais e RT60 teórico', () => {
  const a = speakerAlignment({ L: 2, R: 3 });
  close(a.L.delayMs, 1000 / 343, 0.01); close(a.L.trimDb, 20 * Math.log10(2 / 3), 0.01); close(a.R.delayMs, 0, 1e-9);
  close(roomModes({ width: 4, length: 5, height: 2.7 })[0].freq, 34.3, 0.05);
  const bare = estimateRt60({ ...DEFAULT_ROOM, walls: 'concreto', floor: 'concreto', ceiling: 'concreto', furniture: 0 });
  const treated = estimateRt60({ ...DEFAULT_ROOM, walls: 'concreto', floor: 'concreto', ceiling: 'concreto', furniture: 0, treatment: 'completo', rug: true, curtains: true });
  assert.ok(treated < bare * 0.6, `tratamento deveria reduzir o RT60 (${bare.toFixed(2)} → ${treated.toFixed(2)})`);
});
