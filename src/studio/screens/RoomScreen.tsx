import { useMemo, useState, type ReactNode } from 'react';
import { Card, Header, Icon, Knob, Tabs, Toggle, ToggleRow, fmtDb, fmtHz } from '../ui.tsx';
import { Display } from '../Display.tsx';
import { useNexus } from '../store.tsx';
import { logFreqs, responseOfBands, type EqBand } from '../../dsp/eq.ts';
import { DEFAULT_ROOM, LAYOUT_CHANNELS, MATERIALS, UNCALIBRATED_NOTE, analyzeMeasurement, estimateRt60, responseFromIr, roomModes, roomVolume, schroederFrequency, speakerAlignment, type BandLevel, type MaterialKey, type MeasurementResult, type RoomConfig, type SpeakerLayout, type TreatmentLevel } from '../../dsp/room.ts';
import { measureRoom } from '../../audio/measure.ts';

type Tab = 'sala' | 'pos' | 'corr' | 'med';
const PROFILES_KEY = 'nexus-room-profiles-v1';
interface RoomProfile { id: string; name: string; room: RoomConfig; correction: EqBand[] }

const ENV: { id: RoomConfig['environment']; label: string }[] = [{ id: 'quarto', label: 'Quarto' }, { id: 'sala', label: 'Sala' }, { id: 'home-studio', label: 'Home Studio' }, { id: 'escritorio', label: 'Escritório' }, { id: 'carro', label: 'Carro' }, { id: 'outro', label: 'Outro' }];
const TREAT: { id: TreatmentLevel; label: string }[] = [{ id: 'nenhum', label: 'Nenhum' }, { id: 'parcial', label: 'Parcial (básico)' }, { id: 'completo', label: 'Completo' }];
const LAYOUTS: { id: SpeakerLayout; label: string }[] = [{ id: 'stereo', label: 'Estéreo' }, { id: '2.1', label: '2.1' }, { id: '5.1', label: '5.1' }, { id: '7.1', label: '7.1' }];

function loadProfiles(): RoomProfile[] { try { const r = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? '[]'); return Array.isArray(r) ? r : []; } catch { return []; } }

function NumField({ label, value, min, max, step = 0.1, unit = 'm', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return <label className="nx-field"><span>{label}</span><div><input type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(Math.max(v, min), max)); }} /><em>{unit}</em></div></label>;
}
function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return <label className="nx-field"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value as T)}>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>;
}
const matOptions = (Object.keys(MATERIALS) as MaterialKey[]).map(k => ({ id: k, label: MATERIALS[k].label }));

/** Interpolates third-octave band levels onto the display's 160 log-spaced points. */
function toCurve(bands: BandLevel[]): number[] {
  return logFreqs(160).map(f => {
    if (f <= bands[0].freq) return bands[0].db;
    if (f >= bands[bands.length - 1].freq) return bands[bands.length - 1].db;
    const i = bands.findIndex(b => b.freq >= f), a = bands[i - 1], b = bands[i], t = Math.log(f / a.freq) / Math.log(b.freq / a.freq);
    return a.db + t * (b.db - a.db);
  });
}

export function RoomScreen({ onBack }: { onBack: () => void }) {
  const { cfg, update } = useNexus();
  const [tab, setTab] = useState<Tab>('sala');
  const room = cfg.room.config;
  const set = (fn: (r: RoomConfig) => void) => update(c => { fn(c.room.config); });

  return <div className="nx-screen">
    <Header title="Room Studio" onBack={onBack} right={<Toggle on={cfg.room.enabled} onChange={v => update(c => { c.room.enabled = v; })} label="Correção de sala ativa" />} />
    <Tabs items={[{ id: 'sala', label: 'Sala' }, { id: 'pos', label: 'Posição' }, { id: 'corr', label: 'Correção' }, { id: 'med', label: 'Medição' }] as { id: Tab; label: string }[]} value={tab} onChange={setTab} />
    {tab === 'sala' && <SalaTab room={room} set={set} />}
    {tab === 'pos' && <PosTab room={room} set={set} />}
    {tab === 'corr' && <CorrTab />}
    {tab === 'med' && <MedTab />}
  </div>;
}

function SalaTab({ room, set }: { room: RoomConfig; set: (fn: (r: RoomConfig) => void) => void }) {
  const rt = estimateRt60(room), vol = roomVolume(room), modes = useMemo(() => roomModes(room).slice(0, 8), [room]);
  return <>
    <Card title="Ambiente">
      <div className="nx-fields three">
        <NumField label="Largura" value={room.width} min={1} max={30} onChange={v => set(r => { r.width = v; })} />
        <NumField label="Comprimento" value={room.length} min={1} max={40} onChange={v => set(r => { r.length = v; })} />
        <NumField label="Altura" value={room.height} min={1.8} max={8} onChange={v => set(r => { r.height = v; })} />
      </div>
      <div className="nx-fields"><Select label="Tipo de ambiente" value={room.environment} options={ENV} onChange={v => set(r => { r.environment = v; })} />
        <Select label="Tratamento acústico" value={room.treatment} options={TREAT} onChange={v => set(r => { r.treatment = v; })} /></div>
    </Card>
    <Card title="Materiais e mobília">
      <div className="nx-fields three">
        <Select label="Paredes" value={room.walls} options={matOptions} onChange={v => set(r => { r.walls = v; })} />
        <Select label="Piso" value={room.floor} options={matOptions} onChange={v => set(r => { r.floor = v; })} />
        <Select label="Teto" value={room.ceiling} options={matOptions} onChange={v => set(r => { r.ceiling = v; })} />
      </div>
      <ToggleRow label="Cortinas" on={room.curtains} onChange={v => set(r => { r.curtains = v; })} />
      <ToggleRow label="Tapete" on={room.rug} onChange={v => set(r => { r.rug = v; })} />
      <NumField label="Móveis grandes" value={room.furniture} min={0} max={30} step={1} unit="un." onChange={v => set(r => { r.furniture = Math.round(v); })} />
    </Card>
    <Card title="Estimativa teórica">
      <div className="nx-stats">
        <div><small>Volume</small><strong>{vol.toFixed(1)} m³</strong></div>
        <div><small>RT60 estimado</small><strong>{rt.toFixed(2)} s</strong></div>
        <div><small>Freq. de Schroeder</small><strong>{Math.round(schroederFrequency(rt, vol))} Hz</strong></div>
        <div><small>Modos axiais &lt; 300 Hz</small><strong>{modes.length ? modes.map(m => Math.round(m.freq)).join(', ') : '—'}</strong></div>
      </div>
      <p className="nx-hint">Valores calculados a partir dos materiais (Sabine, coeficientes genéricos), não medidos. Use a aba Medição para comparar com a sala real.</p>
    </Card>
  </>;
}

function PosTab({ room, set }: { room: RoomConfig; set: (fn: (r: RoomConfig) => void) => void }) {
  const { cfg, update } = useNexus();
  const channels = LAYOUT_CHANNELS[room.layout];
  const dist: Record<string, number> = {};
  channels.forEach(ch => { dist[ch] = room.speakerDistances[ch] ?? (ch === 'SUB' ? room.listenerDistance : room.listenerDistance); });
  const align = speakerAlignment(dist);
  return <>
    <Card title="Sistema de caixas">
      <Tabs items={LAYOUTS} value={room.layout} onChange={v => set(r => { r.layout = v; })} />
      {(room.layout === '5.1' || room.layout === '7.1') && <p className="nx-hint warn">Saída multicanal depende do sistema e do aparelho. A versão web entrega estéreo: use os valores abaixo para ajustar o receptor.</p>}
      <div className="nx-fields">
        <NumField label="Distância entre caixas" value={room.speakerSpacing} min={0.3} max={10} onChange={v => set(r => { r.speakerSpacing = v; })} />
        <NumField label="Distância do ouvinte" value={room.listenerDistance} min={0.3} max={10} onChange={v => set(r => { r.listenerDistance = v; })} />
      </div>
      <p className="nx-hint">Posição ideal: triângulo equilátero — distância entre as caixas ≈ {room.listenerDistance.toFixed(1)} m (atual: {room.speakerSpacing.toFixed(1)} m).</p>
    </Card>
    <Card title="Alinhamento por canal">
      <div className="nx-fields three head"><span>Canal</span><span>Distância</span><span>Delay / nível</span></div>
      {channels.map(ch => <div key={ch} className="nx-fields three"><strong>{ch}</strong>
        <NumField label="" value={dist[ch]} min={0.3} max={15} onChange={v => set(r => { r.speakerDistances[ch] = v; })} />
        <span className="nx-mono">{align[ch].delayMs.toFixed(2)} ms · {fmtDb(align[ch].trimDb)} dB</span></div>)}
      <p className="nx-hint">Valores para configurar no receptor/ampli. O NEXUS web não aplica delay por caixa (saída estéreo única); balanço e nível L/R estão em Stereo Studio.</p>
    </Card>
    <Card title="Balanço rápido L/R">
      <div className="nx-knobs two">
        <Knob label="Balance" value={cfg.stereo.balance} min={-1} max={1} step={0.01} def={0} format={v => (Math.abs(v) < 0.005 ? 'Centro' : (v < 0 ? 'L ' : 'R ') + Math.round(Math.abs(v) * 100))} onChange={v => update(c => { c.stereo.balance = v; })} />
        <Knob label="Nível L" value={cfg.stereo.leftDb} min={-12} max={12} step={0.5} def={0} format={v => fmtDb(v) + ' dB'} onChange={v => update(c => { c.stereo.leftDb = v; })} />
      </div>
    </Card>
  </>;
}

function CorrTab() {
  const { cfg, update, replace } = useNexus();
  const [sel, setSel] = useState(0);
  const [profiles, setProfiles] = useState<RoomProfile[]>(loadProfiles);
  const [name, setName] = useState('');
  const bands = cfg.room.correction;
  const persist = (p: RoomProfile[]) => { setProfiles(p); try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } };
  const curve = useMemo(() => responseOfBands(cfg.room.enabled ? bands : [], logFreqs(160), 48000), [cfg.room.enabled, bands]);
  const b = bands[Math.min(sel, bands.length - 1)];
  const idx = Math.min(sel, bands.length - 1);
  return <>
    <Display curve={curve} showSpectrum={false} height={120} />
    {!cfg.room.enabled && bands.length > 0 && <p className="nx-hint warn">A correção de sala está desligada (chave no topo): a curva acima não está sendo aplicada.</p>}
    <Card title="Equalização de compensação" right={<button className="nx-btn" style={{ flex: 'none', minWidth: 0, padding: '8px 12px' }} disabled={bands.length >= 12} onClick={() => { update(c => { c.room.correction.push({ type: 'peak', freq: 100, gainDb: -3, q: 2, enabled: true }); c.room.enabled = true; }); setSel(bands.length); }}>+ Banda</button>}>
      {bands.length === 0 ? <p className="nx-hint">Nenhuma banda. Adicione manualmente ou meça a sala na aba Medição para receber uma sugestão.</p> : <>
        <div className="nx-chips">{bands.map((x, i) => <button key={i} className={(i === idx ? 'on ' : '') + (x.enabled ? 'act' : '')} onClick={() => setSel(i)}>{fmtHz(x.freq)} Hz</button>)}</div>
        <div className="nx-row"><div><strong>{fmtHz(b.freq)} Hz</strong><small>{fmtDb(b.gainDb)} dB · Q {b.q.toFixed(2)}</small></div>
          <div className="nx-mini"><button aria-label="Excluir banda" onClick={() => { update(c => { c.room.correction.splice(idx, 1); }); setSel(0); }}>×</button><Toggle on={b.enabled} onChange={v => update(c => { c.room.correction[idx].enabled = v; })} label="Banda ativa" /></div></div>
        <div className="nx-knobs">
          <Knob label="Frequência" value={b.freq} min={20} max={500} step={1} log def={100} format={v => v.toFixed(0) + ' Hz'} onChange={v => update(c => { c.room.correction[idx].freq = v; })} />
          <Knob label="Ganho" value={b.gainDb} min={-12} max={6} step={0.1} def={0} format={v => fmtDb(v) + ' dB'} onChange={v => update(c => { c.room.correction[idx].gainDb = v; })} />
          <Knob label="Q" value={b.q} min={0.3} max={12} step={0.05} log def={2} format={v => v.toFixed(2)} onChange={v => update(c => { c.room.correction[idx].q = v; })} />
        </div></>}
    </Card>
    <Card title="Perfis por sala">
      <div className="nx-save"><input value={name} onChange={e => setName(e.target.value)} placeholder="Nome da sala (ex.: Quarto)" maxLength={40} aria-label="Nome da sala" />
        <button className="nx-btn gold" disabled={!name.trim()} onClick={() => { persist([...profiles, { id: `r-${Date.now().toString(36)}`, name: name.trim(), room: JSON.parse(JSON.stringify(cfg.room.config)), correction: JSON.parse(JSON.stringify(cfg.room.correction)) }]); setName(''); }}><Icon name="save" size={16} /> Salvar</button></div>
      <ul className="nx-list">{profiles.map(p => <li key={p.id}><button className="nx-list-main" onClick={() => { const n = JSON.parse(JSON.stringify(cfg)); n.room.config = { ...DEFAULT_ROOM, ...p.room }; n.room.correction = p.correction; n.room.enabled = true; replace(n); }}><strong>{p.name}</strong><small>{p.room.width}×{p.room.length}×{p.room.height} m · {p.correction.length} banda(s) · toque para carregar</small></button>
        <div className="nx-list-actions"><button className="danger" onClick={() => persist(profiles.filter(x => x.id !== p.id))}>Excluir</button></div></li>)}</ul>
    </Card>
  </>;
}

function MedTab() {
  const { cfg, update, running } = useNexus();
  const [phase, setPhase] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ m: MeasurementResult; warn: string | null } | null>(null);
  const [target, setTarget] = useState<'plana' | 'graves'>('plana');
  const [ir, setIr] = useState<{ ir: Float64Array; fs: number } | null>(null);

  const analyse = (data: { ir: Float64Array; fs: number }, t: 'plana' | 'graves', warn: string | null) => {
    const freqs = responseFromIr(data.ir, data.fs).map(b => b.freq);
    const tgt = t === 'graves' ? freqs.map(f => ({ freq: f, db: f < 100 ? 3 : f < 200 ? 3 * (200 - f) / 100 : 0 })) : null;
    setRes({ m: analyzeMeasurement(data.ir, data.fs, tgt), warn });
  };
  const run = async () => {
    setErr(null); setRes(null);
    try {
      const out = await measureRoom({ onPhase: setPhase });
      const warn = out.clipped ? 'O microfone saturou (clipping). Reduza o volume e repita: esta medição não é confiável.' : out.tooQuiet ? 'Quase nenhum sinal foi captado. Aumente o volume do alto-falante ou aproxime o microfone.' : null;
      setIr({ ir: out.ir, fs: out.fs }); analyse({ ir: out.ir, fs: out.fs }, target, warn);
    } catch (e) { setErr(e instanceof Error ? `Não foi possível medir: ${e.message}` : 'Não foi possível medir.'); }
    finally { setPhase(null); }
  };
  const curve = res ? toCurve(res.m.response) : undefined;
  return <>
    <Card title="Medição com o microfone do aparelho">
      <p className="nx-hint warn">{UNCALIBRATED_NOTE}</p>
      <ol className="nx-hint nx-steps"><li>Desligue o NEXUS EQ na tela inicial (a medição toca direto no alto-falante).</li><li>Coloque o aparelho na posição de escuta, em silêncio.</li><li>Abaixe o volume: será tocado um sweep de 4 s.</li></ol>
      {running && <p className="nx-hint bad">O NEXUS EQ está ligado. Desligue-o antes de medir.</p>}
      <button className="nx-btn gold" style={{ width: '100%' }} disabled={!!phase || running} onClick={run}>{phase ? `${phase[0].toUpperCase()}${phase.slice(1)}…` : 'Iniciar medição'}</button>
      {err && <p className="nx-hint bad" role="alert">{err}</p>}
    </Card>
    {res && curve && <>
      {res.warn && <p className="nx-hint bad" role="alert">{res.warn}</p>}
      <Display curve={curve} curveRange={15} showSpectrum={false} height={150} />
      <Card title="Resultado (indicativo)">
        <Tabs items={[{ id: 'plana', label: 'Alvo: plana' }, { id: 'graves', label: 'Alvo: graves +3 dB' }]} value={target} onChange={t => { setTarget(t); if (ir) analyse(ir, t, res.warn); }} />
        <div className="nx-stats"><div><small>RT60 medido</small><strong>{res.m.rt60 ? res.m.rt60.toFixed(2) + ' s' : 'indisponível'}</strong></div><div><small>RT60 teórico</small><strong>{estimateRt60(cfg.room.config).toFixed(2)} s</strong></div></div>
        <h4 className="nx-h4">Picos e vales</h4>
        {res.m.deviations.length ? <ul className="nx-plain">{res.m.deviations.map(d => <li key={d.freq}>{d.kind === 'pico' ? 'Pico' : 'Vale'} em {fmtHz(d.freq)} Hz ({fmtDb(d.db)} dB)</li>)}</ul> : <p className="nx-hint">Nenhum desvio acima de 4 dB.</p>}
        <h4 className="nx-h4">Sugestão de correção</h4>
        {res.m.suggested.length ? <><ul className="nx-plain">{res.m.suggested.map((b, i): ReactNode => <li key={i}>{fmtHz(b.freq)} Hz · {fmtDb(b.gainDb)} dB · Q {b.q}</li>)}</ul>
          <button className="nx-btn gold" style={{ width: '100%' }} onClick={() => update(c => { c.room.correction = res.m.suggested.map(b => ({ ...b })); c.room.enabled = true; })}>Aplicar como perfil de calibração</button></> : <p className="nx-hint">Sem correção necessária dentro da tolerância.</p>}
        <p className="nx-hint">Cortes são preferidos a reforços: um vale causado por cancelamento não se corrige com ganho. Meça de novo com a correção ligada para comparar.</p>
      </Card>
    </>}
  </>;
}
