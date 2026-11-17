// Runs the real AudioWorklet in headless Chromium and checks that NEXUS audibly changes the signal.
// Needs: tsc and playwright available globally (no project dependencies required).
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, '.tmp-browser-check');
rmSync(out, { recursive: true, force: true });
execFileSync('tsc', ['--ignoreConfig', '--outDir', out, '--rootDir', join(root, 'src'), '--target', 'es2022', '--module', 'esnext',
  '--moduleResolution', 'bundler', '--allowImportingTsExtensions', '--rewriteRelativeImportExtensions', '--lib', 'es2022,dom,dom.iterable',
  '--skipLibCheck', '--strict', join(root, 'src/audio/worklet.ts'), join(root, 'src/audio/controller.ts'), join(root, 'src/dsp/config.ts')], { stdio: 'inherit' });

const mime = { '.js': 'text/javascript', '.html': 'text/html' };
const page = `<!doctype html><meta charset=utf-8><body><script type=module>
import { defaultConfig } from '/dsp/config.js';
const FS = 48000;
async function render(mutate) {
  const ctx = new OfflineAudioContext(2, FS, FS);
  await ctx.audioWorklet.addModule('/audio/worklet.js');
  const node = new AudioWorkletNode(ctx, 'nexus-eq', { outputChannelCount: [2] });
  node.port.onmessage = e => { if (e.data.type === 'error') console.error('worklet:', e.data.message); };
  node.onprocessorerror = e => console.error('processorerror', e.type);
  const cfg = defaultConfig(); mutate(cfg);
  node.port.postMessage({ type: 'config', config: cfg });
  await new Promise(r => setTimeout(r, 100));
  const o = ctx.createOscillator(); o.frequency.value = 1000;
  const g = ctx.createGain(); g.gain.value = 0.1; o.connect(g); g.connect(node); node.connect(ctx.destination); o.start();
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0); let s = 0; const from = FS / 2;
  for (let i = from; i < d.length; i++) s += d[i] * d[i];
  return 20 * Math.log10(Math.sqrt(s / (d.length - from)));
}
window.run = async () => ({
  flat: await render(() => {}),
  eq6: await render(c => { c.safety.autoPreamp = false; c.eq.graphic[10][5] = 6; }),
  preampM6: await render(c => { c.eq.preampDb = -6; }),
  bypassEq: await render(c => { c.bypass = true; c.eq.graphic[10][5] = 6; c.safety.autoPreamp = false; }),
});
</script>`;
const server = createServer((req, res) => {
  if (req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end(page); }
  const f = join(out, req.url);
  if (!existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', mime[extname(f)] ?? 'application/octet-stream'); res.end(readFileSync(f));
}).listen(0);
const port = server.address().port;

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const pg = await browser.newPage();
pg.on('pageerror', e => console.error('page error:', e.message));
await pg.goto(`http://localhost:${port}/`);
const r = await pg.evaluate(() => window.run());
await browser.close(); server.close(); rmSync(out, { recursive: true, force: true });
console.log(r);
const checks = [
  ['EQ +6 dB em 1 kHz sobe o nível ≈ +6 dB', Math.abs(r.eq6 - r.flat - 6) < 0.5],
  ['Pré-amp −6 dB reduz ≈ 6 dB', Math.abs(r.flat - r.preampM6 - 6) < 0.5],
  ['Bypass ignora o EQ (igual ao flat)', Math.abs(r.bypassEq - r.flat) < 0.1],
];
let ok = true; for (const [n, p] of checks) { console.log(p ? 'ok  ' : 'FAIL', n); ok &&= p; }
process.exit(ok ? 0 : 1);
