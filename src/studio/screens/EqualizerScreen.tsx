import { useMemo, useRef, useState } from 'react';
import { Card, Header, Icon, Knob, Slider, Tabs, Toggle, VFader, fmtDb, fmtHz } from '../ui.tsx';
import { Display } from '../Display.tsx';
import { useNexus } from '../store.tsx';
import { GRAPHIC_FREQS, graphicBands, logFreqs, responseOfBands, type EqBand, type GraphicLayout } from '../../dsp/eq.ts';
import { defaultConfig, type NexusConfig } from '../../dsp/config.ts';
import { createPreset } from '../../dsp/presets.ts';

const BAND_NAMES = ['HPF', 'Low Shelf', 'Peak 1', 'Peak 2', 'Peak 3', 'High Shelf', 'LPF'];
const TYPE_LABEL: Record<string, string> = { peak: 'Peak', notch: 'Notch', lowshelf: 'Low Shelf', highshelf: 'High Shelf', lowpass: 'Low Pass', highpass: 'High Pass' };

export function EqualizerScreen({ onBack }: { onBack: () => void }) {
  const { cfg, update, replace, userPresets, setUserPresets } = useNexus();
  const eq = cfg.eq;
  const [sel, setSel] = useState(3);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const other = useRef<NexusConfig | null>(null);
  const [slot, setSlot] = useState<'A' | 'B'>('A');

  const curve = useMemo(() => {
    const bands: EqBand[] = eq.mode === 'graphic' ? graphicBands(eq.layout, eq.graphic[eq.layout]) : eq.parametric;
    return responseOfBands(eq.enabled ? bands : [], logFreqs(160), 48000, eq.enabled ? eq.preampDb : 0);
  }, [eq]);

  const layout = eq.layout;
  const freqs = GRAPHIC_FREQS[layout];
  const gains = eq.graphic[layout];
  const band = eq.parametric[sel];
  const gainType = band.type === 'peak' || band.type === 'lowshelf' || band.type === 'highshelf';
  const qType = band.type !== 'lowshelf' && band.type !== 'highshelf';

  const swapAB = () => {
    const next: NexusConfig = other.current ?? JSON.parse(JSON.stringify(cfg));
    other.current = JSON.parse(JSON.stringify(cfg)); replace(next); setSlot(s => (s === 'A' ? 'B' : 'A'));
  };
  const save = () => {
    if (!name.trim()) return;
    setUserPresets([...userPresets, createPreset(name, cfg)]); setName(''); setNaming(false);
  };

  return <div className="nx-screen">
    <Header title="Equalizador Studio" onBack={onBack} right={<Toggle on={eq.enabled} onChange={v => update(c => { c.eq.enabled = v; })} label="Equalizador ativo" />} />
    <Tabs items={[{ id: 10, label: '10 Bandas' }, { id: 15, label: '15 Bandas' }, { id: 31, label: '31 Bandas' }]} value={layout}
      onChange={v => update(c => { c.eq.layout = v as GraphicLayout; c.eq.mode = 'graphic'; })} />
    <Display curve={curve} />
    <Tabs items={[{ id: 'graphic', label: 'Gráfico' }, { id: 'parametric', label: 'Paramétrico' }]} value={eq.mode} onChange={v => update(c => { c.eq.mode = v; })} />

    {eq.mode === 'graphic' ? <Card>
      <div className={'nx-faders' + (layout === 31 ? ' scroll' : '')}>
        {freqs.map((f, i) => <div key={f} className="nx-fader-col" style={{ minWidth: layout === 31 ? 26 : undefined }}>
          <VFader value={gains[i]} min={-12} max={12} label={`${fmtHz(f)} Hz`} onChange={v => update(c => { c.eq.graphic[layout][i] = v; })} />
          <span className={'nx-fader-gain' + (gains[i] !== 0 ? ' on' : '')}>{gains[i] > 0 ? '+' : ''}{Number.isInteger(gains[i]) ? gains[i] : gains[i].toFixed(1)}</span>
          <span className="nx-fader-freq">{fmtHz(f)}</span>
        </div>)}
      </div>
      <p className="nx-hint">Arraste cada faixa. Toque duas vezes para zerar. Setas do teclado ajustam 0,5 dB.</p>
    </Card> : <Card>
      <div className="nx-chips">{eq.parametric.map((b, i) => <button key={i} className={(i === sel ? 'on ' : '') + (b.enabled ? 'act' : '')} onClick={() => setSel(i)}>{BAND_NAMES[i]}</button>)}</div>
      <div className="nx-row"><div><strong>{BAND_NAMES[sel]}</strong><small>{TYPE_LABEL[band.type]}</small></div><Toggle on={band.enabled} onChange={v => update(c => { c.eq.parametric[sel].enabled = v; })} label={`Banda ${BAND_NAMES[sel]}`} /></div>
      <div className="nx-knobs">
        <Knob label="Frequência" value={band.freq} min={20} max={20000} step={1} log def={defaultConfig().eq.parametric[sel].freq} format={v => fmtHz(v) + ' Hz'} onChange={v => update(c => { c.eq.parametric[sel].freq = v; })} />
        {gainType && <Knob label="Ganho" value={band.gainDb} min={-12} max={12} step={0.1} def={0} format={v => fmtDb(v) + ' dB'} onChange={v => update(c => { c.eq.parametric[sel].gainDb = v; })} />}
        {qType && <Knob label="Q" value={band.q} min={0.1} max={18} step={0.05} log def={1} format={v => v.toFixed(2)} onChange={v => update(c => { c.eq.parametric[sel].q = v; })} />}
      </div>
      {(band.type === 'peak' || band.type === 'notch') && <Tabs items={[{ id: 'peak', label: 'Peak' }, { id: 'notch', label: 'Notch' }]} value={band.type as 'peak' | 'notch'} onChange={v => update(c => { c.eq.parametric[sel].type = v; })} />}
    </Card>}

    <Card title="Pré-amplificação"><Slider label="Pré-amp" value={eq.preampDb} min={-24} max={12} step={0.5} unit="dB" onChange={v => update(c => { c.eq.preampDb = v; })} format={v => fmtDb(v) + ' dB'} /></Card>

    <div className="nx-actions">
      <button className={'nx-btn gold'} onClick={swapAB} aria-label="Comparar A/B">A/B · {slot}</button>
      <button className="nx-btn" onClick={() => update(c => { c.eq = defaultConfig().eq; })}><Icon name="reset" size={16} /> Reset</button>
      <button className="nx-btn" onClick={() => setNaming(n => !n)}><Icon name="save" size={16} /> Salvar</button>
    </div>
    {naming && <div className="nx-save"><input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do perfil" maxLength={40} aria-label="Nome do perfil" onKeyDown={e => e.key === 'Enter' && save()} /><button className="nx-btn gold" onClick={save} disabled={!name.trim()}>Salvar perfil</button></div>}
  </div>;
}
