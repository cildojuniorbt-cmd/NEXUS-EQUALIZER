import { useEffect, useMemo, useState } from 'react';
import { AudioLines, Power, RotateCcw, SlidersHorizontal, Save, Trash2, Activity } from 'lucide-react';

const BANDS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const PRESETS = {
  Flat: [0,0,0,0,0,0,0,0,0,0],
  'Bass Boost': [5,4,3,2,0,0,0,0,0,0],
  Vocal: [-2,-1,0,2,3,3,2,1,0,-1],
  Rock: [4,3,1,-1,-2,1,3,4,4,3],
  Jazz: [3,2,1,2,-1,-1,0,2,3,3],
  'Treble Boost': [0,0,0,0,0,1,2,3,4,4],
};
type PresetName = keyof typeof PRESETS;
type SavedPreset = { gains: number[]; output: number };

export default function App() {
  const [gains, setGains] = useState<number[]>(PRESETS.Flat);
  const [output, setOutput] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [preset, setPreset] = useState<PresetName>('Flat');
  const [custom, setCustom] = useState<Record<string, SavedPreset>>({});
  const [name, setName] = useState('');
  const [tab, setTab] = useState<'eq'|'presets'>('eq');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nexus-equalizer-control-v1');
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.gains) && data.gains.length === BANDS.length) setGains(data.gains);
        if (typeof data.output === 'number') setOutput(data.output);
        if (typeof data.enabled === 'boolean') setEnabled(data.enabled);
        if (data.custom && typeof data.custom === 'object') setCustom(data.custom);
        if (data.preset && data.preset in PRESETS) setPreset(data.preset);
      }
    } catch { /* Keep defaults if local storage is unavailable. */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('nexus-equalizer-control-v1', JSON.stringify({ gains, output, enabled, custom, preset }));
      setSaved(true);
      const id = window.setTimeout(() => setSaved(false), 1200);
      return () => window.clearTimeout(id);
    } catch { setSaved(false); }
  }, [gains, output, enabled, custom, preset]);

  const curve = useMemo(() => gains.map((gain, i) => ({ x: 28 + i * 8.2, y: 50 - gain * 2.2 })), [gains]);
  const path = curve.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');

  function applyPreset(key: PresetName) {
    setPreset(key);
    setGains([...PRESETS[key]]);
  }
  function savePreset() {
    const clean = name.trim();
    if (!clean) return;
    setCustom(current => ({ ...current, [clean]: { gains: [...gains], output } }));
    setName('');
  }
  function loadCustom(key: string) {
    const item = custom[key];
    if (!item) return;
    setGains([...item.gains]);
    setOutput(item.output);
    setPreset('Flat');
  }
  function reset() { setGains([...PRESETS.Flat]); setOutput(0); setPreset('Flat'); }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><AudioLines size={22}/></div><div><strong>NEXUS</strong><span>EQUALIZER</span></div></div>
      <div className="top-status"><span className="status-dot active"/> CONTROL PANEL <span className="save-state">{saved ? '· SALVO' : ''}</span></div>
    </header>

    <section className="hero">
      <div><p className="eyebrow">PRECISÃO SONORA · CONTROLE DE EQUALIZAÇÃO</p><h1>Seu som.<br/><em>Seu equilíbrio.</em></h1><p className="hero-copy">Um equalizador dedicado. Sem player, sem biblioteca, sem importar músicas.</p></div>
      <div className="hero-icon"><AudioLines size={54} strokeWidth={1.2}/></div>
    </section>

    <section className="notice-card">
      <div className="notice-icon"><Activity size={18}/></div>
      <div><strong>Interface de controle Web</strong><p>Esta versão permite configurar e salvar seus ajustes. O navegador não pode equalizar o áudio de outros aplicativos do celular. A integração com o áudio do sistema continuará na versão nativa.</p></div>
    </section>

    <section className="eq-card">
      <div className="section-heading"><div><p className="section-kicker">PROCESSAMENTO</p><h2>Equalizador gráfico</h2></div><button className={'power-button ' + (enabled ? 'on' : '')} onClick={() => setEnabled(v => !v)}><Power size={16}/>{enabled ? 'ATIVO' : 'BYPASS'}</button></div>
      <div className="eq-visual">
        <div className="curve-labels"><span>+12 dB</span><span>0 dB</span><span>−12 dB</span></div>
        <svg viewBox="0 0 112 100" preserveAspectRatio="none" role="img" aria-label="Curva de equalização atual">
          {[24,50,76].map(y => <line key={y} x1="20" x2="108" y1={y} y2={y} stroke="#e6e8eb" strokeDasharray="1.5 1.5"/>)}
          <path d={path} fill="none" stroke={enabled ? '#303840' : '#aeb4bb'} strokeWidth="1.7" vectorEffect="non-scaling-stroke"/>
          {curve.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r="1.4" fill={enabled ? '#303840' : '#aeb4bb'}/>)}
        </svg>
      </div>
      <div className="band-grid">{BANDS.map((frequency,index) => <label className="band" key={frequency}>
        <span className="band-value">{enabled ? (gains[index] > 0 ? '+' : '') + gains[index].toFixed(1) : 'OFF'}</span>
        <input aria-label={frequency + ' Hz'} type="range" min="-12" max="12" step=".5" value={gains[index]} disabled={!enabled} onChange={e => { setGains(v => v.map((x,i) => i === index ? Number(e.target.value) : x)); setPreset('Flat'); }}/>
        <span className="band-frequency">{frequency >= 1000 ? (frequency/1000)+'k' : frequency}</span>
      </label>)}</div>
      <div className="eq-footer"><label>GANHO DE SAÍDA <strong>{output > 0 ? '+' : ''}{output.toFixed(1)} dB</strong></label><input aria-label="Ganho de saída" type="range" min="-12" max="6" step=".5" value={output} onChange={e => setOutput(Number(e.target.value))}/><button className="reset-button" onClick={reset}><RotateCcw size={14}/> Redefinir</button></div>
    </section>

    <section className="presets-card">
      <div className="section-heading"><div><p className="section-kicker">AJUSTE RÁPIDO</p><h2>Perfis de equalização</h2></div><SlidersHorizontal size={19}/></div>
      <div className="preset-list">{(Object.keys(PRESETS) as PresetName[]).map(key => <button key={key} className={preset === key ? 'preset active-preset' : 'preset'} onClick={() => applyPreset(key)}>{key}</button>)}</div>
    </section>

    <section className="presets-card">
      <div className="section-heading"><div><p className="section-kicker">PERSONALIZAÇÃO</p><h2>Meus perfis</h2></div></div>
      <div className="save-preset-row"><input aria-label="Nome do perfil" placeholder="Nome do perfil" value={name} maxLength={28} onChange={e => setName(e.target.value)}/><button className="save-preset-button" disabled={!name.trim()} onClick={savePreset}><Save size={15}/> Salvar</button></div>
      <div className="custom-preset-list">{Object.entries(custom).map(([key]) => <div className="custom-preset" key={key}><button onClick={() => loadCustom(key)}>{key}</button><button className="delete-preset" aria-label={'Excluir '+key} onClick={() => setCustom(v => { const next = {...v}; delete next[key]; return next; })}><Trash2 size={14}/></button></div>)}</div>
      <p className="module-copy">Seus ajustes ficam salvos neste navegador.</p>
    </section>

    <footer><span>NEXUS EQUALIZER</span><span>WEB CONTROL · PREVIEW 0.2.0</span></footer>
  </main>;
}
