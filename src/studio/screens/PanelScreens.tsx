// Schema-driven panels for Stereo, Voice, Bass and Headphone Studio. Every control writes the same
// NexusConfig the DSP engine consumes (and the test-suite proves each one changes the audio).
import { useMemo } from 'react';
import { Card, Header, Knob, Meter, Tabs, Toggle, ToggleRow, fmtDb } from '../ui.tsx';
import { Display } from '../Display.tsx';
import { useNexus } from '../store.tsx';
import { defaultConfig, type NexusConfig } from '../../dsp/config.ts';
import { logFreqs, responseOfBands } from '../../dsp/eq.ts';
import { bassEqBands } from '../../dsp/bass.ts';
import { profileBands, type ToneProfileId } from '../../dsp/headphone.ts';

type KnobCtl = { kind: 'knob'; label: string; min: number; max: number; step: number; def: number; log?: boolean; unit?: string; fmt?: (v: number) => string; get: (c: NexusConfig) => number; set: (c: NexusConfig, v: number) => void };
type ToggleCtl = { kind: 'toggle'; label: string; hint?: string; get: (c: NexusConfig) => boolean; set: (c: NexusConfig, v: boolean) => void };
type Ctl = KnobCtl | ToggleCtl;
interface Group { title: string; ctls: Ctl[] }

const pct = (v: number) => Math.round(v * 100) + '%';
const db = (v: number) => fmtDb(v) + ' dB';
const k = (label: string, min: number, max: number, step: number, def: number, get: KnobCtl['get'], set: KnobCtl['set'], extra: Partial<KnobCtl> = {}): KnobCtl => ({ kind: 'knob', label, min, max, step, def, get, set, ...extra });

function Controls({ groups }: { groups: Group[] }) {
  const { cfg, update } = useNexus();
  return <>{groups.map(g => <Card key={g.title} title={g.title}>
    <div className="nx-knobs">{g.ctls.filter((c): c is KnobCtl => c.kind === 'knob').map(c =>
      <Knob key={c.label} label={c.label} value={c.get(cfg)} min={c.min} max={c.max} step={c.step} log={c.log} def={c.def} unit={c.unit} format={c.fmt} onChange={v => update(n => c.set(n, v))} />)}</div>
    {g.ctls.filter((c): c is ToggleCtl => c.kind === 'toggle').map(c => <ToggleRow key={c.label} label={c.label} hint={c.hint} on={c.get(cfg)} onChange={v => update(n => c.set(n, v))} />)}
  </Card>)}</>;
}

function ModuleHeader({ title, onBack, on, onChange }: { title: string; onBack: () => void; on?: boolean; onChange?: (v: boolean) => void }) {
  return <Header title={title} onBack={onBack} right={on !== undefined && onChange ? <Toggle on={on} onChange={onChange} label={title + ' ativo'} /> : undefined} />;
}

// ───────────── Stereo ─────────────
const D = defaultConfig();
const STEREO: Group[] = [
  { title: 'Imagem estéreo', ctls: [
    k('Width', 0, 2, 0.01, 1, c => c.stereo.width, (c, v) => { c.stereo.width = v; }, { fmt: pct }),
    k('Balance L/R', -1, 1, 0.01, 0, c => c.stereo.balance, (c, v) => { c.stereo.balance = v; }, { fmt: v => (Math.abs(v) < 0.005 ? 'Centro' : (v < 0 ? 'L ' : 'R ') + Math.round(Math.abs(v) * 100)) }),
    k('Mid', -12, 12, 0.5, 0, c => c.stereo.midDb, (c, v) => { c.stereo.midDb = v; }, { fmt: db }),
    k('Side', -12, 12, 0.5, 0, c => c.stereo.sideDb, (c, v) => { c.stereo.sideDb = v; }, { fmt: db }),
  ] },
  { title: 'Canais', ctls: [
    k('Canal esquerdo', -12, 12, 0.5, 0, c => c.stereo.leftDb, (c, v) => { c.stereo.leftDb = v; }, { fmt: db }),
    k('Canal direito', -12, 12, 0.5, 0, c => c.stereo.rightDb, (c, v) => { c.stereo.rightDb = v; }, { fmt: db }),
    { kind: 'toggle', label: 'Inverter fase — esquerdo', get: c => c.stereo.invertLeft, set: (c, v) => { c.stereo.invertLeft = v; } },
    { kind: 'toggle', label: 'Inverter fase — direito', get: c => c.stereo.invertRight, set: (c, v) => { c.stereo.invertRight = v; } },
    { kind: 'toggle', label: 'Trocar L/R', get: c => c.stereo.swap, set: (c, v) => { c.stereo.swap = v; } },
    { kind: 'toggle', label: 'Mono Compatibility', hint: 'Soma L+R para checar a compatibilidade em mono', get: c => c.stereo.mono, set: (c, v) => { c.stereo.mono = v; } },
  ] },
  { title: 'Crossfeed', ctls: [
    k('Quantidade', 0, 1, 0.01, 0, c => c.stereo.crossfeed, (c, v) => { c.stereo.crossfeed = v; }, { fmt: pct }),
    k('Corte', 300, 1500, 10, D.stereo.crossfeedHz, c => c.stereo.crossfeedHz, (c, v) => { c.stereo.crossfeedHz = v; }, { fmt: v => v.toFixed(0) + ' Hz', log: true }),
  ] },
];
export function StereoScreen({ onBack }: { onBack: () => void }) {
  const { meters, running } = useNexus();
  return <div className="nx-screen"><ModuleHeader title="Stereo Studio" onBack={onBack} />
    <Card title="Correlação de fase"><Meter label="Corr." db={running ? meters.correlation : 1} min={-1} max={1} warnAt={2} />
      <p className="nx-hint">{!running ? 'Ligue o NEXUS EQ para medir.' : meters.phaseInverted ? 'Correlação negativa: possível inversão de fase (o som some em mono).' : `Perda ao somar em mono: ${Math.abs(meters.monoLossDb).toFixed(1)} dB.`}</p></Card>
    <Controls groups={STEREO} /></div>;
}

// ───────────── Voice ─────────────
const VOICE: Group[] = [
  { title: 'Limpeza', ctls: [
    k('Redução de ruído', 0, 1, 0.01, 0, c => c.voice.noiseReduction, (c, v) => { c.voice.noiseReduction = v; }, { fmt: pct }),
    { kind: 'toggle', label: 'Noise Gate', get: c => c.voice.gateEnabled, set: (c, v) => { c.voice.gateEnabled = v; } },
    k('Gate threshold', -90, -10, 1, -50, c => c.voice.gateThresholdDb, (c, v) => { c.voice.gateThresholdDb = v; }, { unit: 'dB' }),
    k('Corte de graves', 0, 400, 5, 0, c => c.voice.lowCutHz, (c, v) => { c.voice.lowCutHz = v; }, { fmt: v => (v === 0 ? 'Off' : v.toFixed(0) + ' Hz') }),
  ] },
  { title: 'Voz', ctls: [
    k('De-Esser', -60, -10, 1, -10, c => c.voice.deEsserDb, (c, v) => { c.voice.deEsserDb = v; }, { fmt: v => (v >= -10 ? 'Off' : v.toFixed(0) + ' dB') }),
    k('Compressor vocal', 0, 1, 0.01, 0, c => c.voice.compressorAmount, (c, v) => { c.voice.compressorAmount = v; }, { fmt: pct }),
    k('Presença', -12, 12, 0.5, 0, c => c.voice.presenceDb, (c, v) => { c.voice.presenceDb = v; }, { fmt: db }),
    k('Inteligibilidade', 0, 1, 0.01, 0, c => c.voice.clarity, (c, v) => { c.voice.clarity = v; }, { fmt: pct }),
  ] },
];
export function VoiceScreen({ onBack }: { onBack: () => void }) {
  const { cfg, update } = useNexus();
  return <div className="nx-screen"><ModuleHeader title="Voice Studio" onBack={onBack} on={cfg.voice.enabled} onChange={v => update(c => { c.voice.enabled = v; })} />
    <p className="nx-hint">Voice Enhancement para fala e microfone. A redução de ruído adiciona uma pequena latência.</p><Controls groups={VOICE} /></div>;
}

// ───────────── Bass ─────────────
const BASS: Group[] = [
  { title: 'Graves', ctls: [
    k('Sub Bass (45 Hz)', -12, 12, 0.5, 0, c => c.bass.subBassDb, (c, v) => { c.bass.subBassDb = v; }, { fmt: db }),
    k('Bass Boost (80 Hz)', -12, 12, 0.5, 0, c => c.bass.bassBoostDb, (c, v) => { c.bass.bassBoostDb = v; }, { fmt: db }),
    k('Low Shelf', -12, 12, 0.5, 0, c => c.bass.lowShelfDb, (c, v) => { c.bass.lowShelfDb = v; }, { fmt: db }),
    k('Freq. do shelf', 40, 400, 5, D.bass.lowShelfHz, c => c.bass.lowShelfHz, (c, v) => { c.bass.lowShelfHz = v; }, { fmt: v => v.toFixed(0) + ' Hz', log: true }),
  ] },
  { title: 'Ressonância e proteção', ctls: [
    k('Ressonância', -12, 12, 0.5, 0, c => c.bass.resonanceDb, (c, v) => { c.bass.resonanceDb = v; }, { fmt: db }),
    k('Freq. ressonância', 30, 300, 1, D.bass.resonanceHz, c => c.bass.resonanceHz, (c, v) => { c.bass.resonanceHz = v; }, { fmt: v => v.toFixed(0) + ' Hz', log: true }),
    k('Filtro passa-altas', 0, 80, 1, 0, c => c.bass.subsonicHz, (c, v) => { c.bass.subsonicHz = v; }, { fmt: v => (v === 0 ? 'Off' : v.toFixed(0) + ' Hz') }),
    k('Harmônicos', 0, 1, 0.01, 0, c => c.bass.harmonics, (c, v) => { c.bass.harmonics = v; }, { fmt: pct }),
    { kind: 'toggle', label: 'Proteção contra excesso de ganho', hint: 'Limita o reforço total nos graves', get: c => c.bass.protect, set: (c, v) => { c.bass.protect = v; } },
    k('Reforço máx.', 0, 18, 0.5, D.bass.maxBoostDb, c => c.bass.maxBoostDb, (c, v) => { c.bass.maxBoostDb = v; }, { fmt: db }),
  ] },
];
export function BassScreen({ onBack }: { onBack: () => void }) {
  const { cfg, update } = useNexus();
  const curve = useMemo(() => responseOfBands(cfg.bass.enabled ? bassEqBands(cfg.bass) : [], logFreqs(160), 48000), [cfg.bass]);
  return <div className="nx-screen"><ModuleHeader title="Bass Studio" onBack={onBack} on={cfg.bass.enabled} onChange={v => update(c => { c.bass.enabled = v; })} />
    <Display curve={curve} showSpectrum={false} height={110} /><Controls groups={BASS} /></div>;
}

// ───────────── Headphone ─────────────
const TONES: { id: ToneProfileId; label: string }[] = [
  { id: 'monitor', label: 'Estúdio' }, { id: 'musica', label: 'Música' }, { id: 'cinema', label: 'Cinema' }, { id: 'jogos', label: 'Jogos' },
  { id: 'voz', label: 'Voz' }, { id: 'neutro', label: 'Neutro' }, { id: 'personalizado', label: 'Custom' },
];
const HP: Group[] = [
  { title: 'Correção tonal', ctls: [
    k('Bass', -12, 12, 0.5, 0, c => c.headphone.profile.bassDb, (c, v) => { c.headphone.profile.bassDb = v; }, { fmt: db }),
    k('Treble', -12, 12, 0.5, 0, c => c.headphone.profile.trebleDb, (c, v) => { c.headphone.profile.trebleDb = v; }, { fmt: db }),
    k('Ganho', -24, 24, 0.5, 0, c => c.headphone.profile.gainDb, (c, v) => { c.headphone.profile.gainDb = v; }, { fmt: db }),
  ] },
  { title: 'Espacialidade', ctls: [
    k('Stereo Width', 0, 2, 0.01, 1, c => c.headphone.profile.width, (c, v) => { c.headphone.profile.width = v; }, { fmt: pct }),
    k('Crossfeed', 0, 1, 0.01, 0, c => c.headphone.profile.crossfeed, (c, v) => { c.headphone.profile.crossfeed = v; }, { fmt: pct }),
    k('Espacial', 0, 1, 0.01, 0, c => c.headphone.profile.spatial, (c, v) => { c.headphone.profile.spatial = v; }, { fmt: pct }),
    k('Balance L/R', -1, 1, 0.01, 0, c => c.headphone.profile.balance, (c, v) => { c.headphone.profile.balance = v; }, { fmt: v => (Math.abs(v) < 0.005 ? 'Centro' : (v < 0 ? 'L ' : 'R ') + Math.round(Math.abs(v) * 100)) }),
  ] },
];
export function HeadphoneScreen({ onBack }: { onBack: () => void }) {
  const { cfg, update } = useNexus();
  const p = cfg.headphone.profile;
  const curve = useMemo(() => responseOfBands(cfg.headphone.enabled ? profileBands(p) : [], logFreqs(160), 48000), [cfg.headphone.enabled, p]);
  return <div className="nx-screen"><ModuleHeader title="Headphone Studio" onBack={onBack} on={cfg.headphone.enabled} onChange={v => update(c => { c.headphone.enabled = v; })} />
    <Display curve={curve} showSpectrum={false} height={110} />
    <Card title="Perfil"><Tabs items={TONES} value={p.tone} onChange={v => update(c => { c.headphone.profile.tone = v; })} />
      <p className="nx-hint">Os perfis são ajustes tonais genéricos. O NEXUS não traz curvas de modelos específicos de fones: sem uma medição verificável do seu fone, ajuste manualmente.</p></Card>
    <Controls groups={HP} /></div>;
}
