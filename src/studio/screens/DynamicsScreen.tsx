import { useState } from 'react';
import { Card, Header, Knob, Meter, Slider, Tabs, Toggle, ToggleRow, fmtDb } from '../ui.tsx';
import { useNexus } from '../store.tsx';
import { compressorCurve, type CompressorParams } from '../../dsp/dynamics.ts';
import { defaultConfig } from '../../dsp/config.ts';

type Tab = 'comp' | 'multi' | 'limiter' | 'other';
const D = defaultConfig().dynamics;

/** Semicircular gain-reduction gauge (0 … −30 dB). Needle = real engine value. */
function GrGauge({ db }: { db: number }) {
  const gr = Math.min(Math.max(-db, 0), 30), ang = -90 + (gr / 30) * 180;
  const marks = [0, 3, 6, 12, 18, 24, 30];
  const pt = (a: number, r: number) => `${100 + r * Math.sin(a * Math.PI / 180)} ${100 - r * Math.cos(a * Math.PI / 180)}`;
  return <svg className="nx-gauge" viewBox="0 0 200 118" role="img" aria-label={`Redução de ganho ${gr.toFixed(1)} dB`}>
    <path d={`M ${pt(-90, 80)} A 80 80 0 0 1 ${pt(90, 80)}`} className="nx-gauge-arc" />
    {marks.map(m => { const a = -90 + (m / 30) * 180; return <g key={m}><line x1={100 + 74 * Math.sin(a * Math.PI / 180)} y1={100 - 74 * Math.cos(a * Math.PI / 180)} x2={100 + 86 * Math.sin(a * Math.PI / 180)} y2={100 - 86 * Math.cos(a * Math.PI / 180)} className="nx-gauge-tick" /><text x={100 + 64 * Math.sin(a * Math.PI / 180)} y={104 - 64 * Math.cos(a * Math.PI / 180)} textAnchor="middle" className="nx-gauge-txt">{m}</text></g>; })}
    <line x1="100" y1="100" x2={100 + 76 * Math.sin(ang * Math.PI / 180)} y2={100 - 76 * Math.cos(ang * Math.PI / 180)} className="nx-gauge-needle" />
    <circle cx="100" cy="100" r="5" className="nx-gauge-hub" />
    <text x="100" y="116" textAnchor="middle" className="nx-gauge-cap">REDUÇÃO DE GANHO (dB)</text>
  </svg>;
}

function TransferCurve({ p }: { p: CompressorParams }) {
  const pts = Array.from({ length: 61 }, (_, i) => { const x = -60 + i; return `${i ? 'L' : 'M'} ${(x + 60) * 3} ${180 - (compressorCurve(x, p) + 60) * 3}`; }).join(' ');
  return <svg className="nx-transfer" viewBox="0 0 180 180" role="img" aria-label="Curva de transferência do compressor"><path d="M0 180L180 0" className="nx-tr-diag" /><path d={pts} className="nx-tr-line" /><line x1={(p.thresholdDb + 60) * 3} y1="0" x2={(p.thresholdDb + 60) * 3} y2="180" className="nx-tr-thr" /></svg>;
}

function CompKnobs({ p, set, prefix = '' }: { p: CompressorParams; set: (k: keyof CompressorParams, v: number) => void; prefix?: string }) {
  return <div className="nx-knobs">
    <Knob label={prefix + 'Threshold'} value={p.thresholdDb} min={-60} max={0} step={0.5} def={-18} unit="dB" onChange={v => set('thresholdDb', v)} />
    <Knob label={prefix + 'Ratio'} value={p.ratio} min={1} max={20} step={0.1} def={4} format={v => v.toFixed(1) + ':1'} onChange={v => set('ratio', v)} />
    <Knob label={prefix + 'Attack'} value={p.attackMs} min={0.1} max={200} step={0.1} log def={10} format={v => (v < 10 ? v.toFixed(1) : v.toFixed(0)) + ' ms'} onChange={v => set('attackMs', v)} />
    <Knob label={prefix + 'Release'} value={p.releaseMs} min={10} max={2000} step={1} log def={120} format={v => v.toFixed(0) + ' ms'} onChange={v => set('releaseMs', v)} />
    <Knob label={prefix + 'Knee'} value={p.kneeDb} min={0} max={24} step={0.5} def={6} unit="dB" onChange={v => set('kneeDb', v)} />
    <Knob label={prefix + 'Makeup'} value={p.makeupDb} min={-12} max={24} step={0.5} def={0} format={v => fmtDb(v) + ' dB'} onChange={v => set('makeupDb', v)} />
  </div>;
}

export function DynamicsScreen({ onBack }: { onBack: () => void }) {
  const { cfg, update, meters } = useNexus();
  const [tab, setTab] = useState<Tab>('comp');
  const d = cfg.dynamics;
  const mb = d.multiband;

  return <div className="nx-screen">
    <Header title="Dynamics Studio" onBack={onBack} right={<Toggle on={d.enabled} onChange={v => update(c => { c.dynamics.enabled = v; })} label="Dynamics ativo" />} />
    <Tabs items={[{ id: 'comp', label: 'Compressor' }, { id: 'multi', label: 'Multibanda' }, { id: 'limiter', label: 'Limiter' }, { id: 'other', label: 'Outros' }] as { id: Tab; label: string }[]} value={tab} onChange={setTab} />
    {!d.enabled && <p className="nx-hint warn">Dynamics está desligado: os controles abaixo só têm efeito depois de ligar o módulo (chave no topo).</p>}

    {tab === 'comp' && <>
      <Card title="Compressor" right={<Toggle on={d.compressor.enabled && !mb.enabled} onChange={v => update(c => { c.dynamics.compressor.enabled = v; if (v) c.dynamics.multiband.enabled = false; })} label="Compressor ativo" />}>
        <div className="nx-split"><GrGauge db={d.compressor.enabled && !mb.enabled ? meters.compGrDb : 0} /><TransferCurve p={d.compressor} /></div>
        <CompKnobs p={d.compressor} set={(k, v) => update(c => { c.dynamics.compressor[k] = v; })} />
        <ToggleRow label="Auto Gain" hint="Compensa o nível perdido pela compressão" on={d.autoGain} onChange={v => update(c => { c.dynamics.autoGain = v; })} />
        <ToggleRow label="Soft Clip" on={d.softClip} onChange={v => update(c => { c.dynamics.softClip = v; })} />
        <Slider label="Compressão Global" value={d.mix * 100} min={0} max={100} step={1} unit="%" onChange={v => update(c => { c.dynamics.mix = v / 100; })} />
      </Card>
    </>}

    {tab === 'multi' && <Card title="Compressor Multibanda" right={<Toggle on={mb.enabled} onChange={v => update(c => { c.dynamics.multiband.enabled = v; })} label="Multibanda ativo" />}>
      <div className="nx-knobs two">
        <Knob label="Corte Graves/Médios" value={mb.crossLow} min={40} max={1000} step={1} log def={200} format={v => v.toFixed(0) + ' Hz'} onChange={v => update(c => { c.dynamics.multiband.crossLow = Math.min(v, c.dynamics.multiband.crossHigh - 100); })} />
        <Knob label="Corte Médios/Agudos" value={mb.crossHigh} min={500} max={12000} step={10} log def={2500} format={v => v.toFixed(0) + ' Hz'} onChange={v => update(c => { c.dynamics.multiband.crossHigh = Math.max(v, c.dynamics.multiband.crossLow + 100); })} />
      </div>
      {(['low', 'mid', 'high'] as const).map((k, i) => <div key={k} className="nx-band">
        <div className="nx-row"><div><strong>{['Graves', 'Médios', 'Agudos'][i]}</strong></div>
          <div className="nx-mini">
            <button className={mb[k].mute ? 'on' : ''} onClick={() => update(c => { c.dynamics.multiband[k].mute = !c.dynamics.multiband[k].mute; })} aria-pressed={mb[k].mute}>M</button>
            <button className={mb[k].solo ? 'on' : ''} onClick={() => update(c => { c.dynamics.multiband[k].solo = !c.dynamics.multiband[k].solo; })} aria-pressed={mb[k].solo}>S</button>
          </div></div>
        <Meter label="GR" db={mb.enabled ? meters.multibandGrDb[i] : 0} min={-24} max={0} reverse />
        <CompKnobs p={mb[k]} set={(p, v) => update(c => { c.dynamics.multiband[k][p] = v; })} />
        <Knob label="Ganho da banda" value={mb[k].gainDb} min={-24} max={24} step={0.5} def={0} format={v => fmtDb(v) + ' dB'} onChange={v => update(c => { c.dynamics.multiband[k].gainDb = v; })} size={52} />
      </div>)}
      <Slider label="Ganho de saída" value={mb.outputDb} min={-24} max={24} step={0.5} onChange={v => update(c => { c.dynamics.multiband.outputDb = v; })} format={v => fmtDb(v) + ' dB'} />
    </Card>}

    {tab === 'limiter' && <Card title="Limiter" right={<Toggle on={d.limiter.enabled} onChange={v => update(c => { c.dynamics.limiter.enabled = v; })} label="Limiter ativo" />}>
      <Meter label="Redução" db={meters.limiterGrDb} min={-12} max={0} reverse />
      <div className="nx-knobs">
        <Knob label="Ceiling" value={d.limiter.ceilingDb} min={-12} max={0} step={0.1} def={D.limiter.ceilingDb} format={v => v.toFixed(1) + ' dBFS'} onChange={v => update(c => { c.dynamics.limiter.ceilingDb = v; if (c.dynamics.limiter.thresholdDb > v) c.dynamics.limiter.thresholdDb = v; })} />
        <Knob label="Threshold" value={d.limiter.thresholdDb} min={-24} max={0} step={0.1} def={D.limiter.thresholdDb} format={v => v.toFixed(1) + ' dB'} onChange={v => update(c => { c.dynamics.limiter.thresholdDb = Math.min(v, c.dynamics.limiter.ceilingDb); })} />
        <Knob label="Release" value={d.limiter.releaseMs} min={10} max={1000} step={1} log def={D.limiter.releaseMs} format={v => v.toFixed(0) + ' ms'} onChange={v => update(c => { c.dynamics.limiter.releaseMs = v; })} />
      </div>
      <p className="nx-hint">Limiter com antecipação: garante que nenhuma amostra passe do ceiling. A proteção final de clipping fica sempre ativa em Ferramentas › Segurança.</p>
    </Card>}

    {tab === 'other' && <>
      <Card title="Noise Gate" right={<Toggle on={d.gate.enabled} onChange={v => update(c => { c.dynamics.gate.enabled = v; })} label="Gate ativo" />}>
        <div className="nx-knobs">
          <Knob label="Threshold" value={d.gate.thresholdDb} min={-90} max={0} step={0.5} def={D.gate.thresholdDb} unit="dB" onChange={v => update(c => { c.dynamics.gate.thresholdDb = v; })} />
          <Knob label="Attack" value={d.gate.attackMs} min={0.1} max={100} step={0.1} log def={D.gate.attackMs} unit="ms" onChange={v => update(c => { c.dynamics.gate.attackMs = v; })} />
          <Knob label="Release" value={d.gate.releaseMs} min={10} max={2000} step={1} log def={D.gate.releaseMs} unit="ms" onChange={v => update(c => { c.dynamics.gate.releaseMs = v; })} />
        </div>
      </Card>
      <Card title="Expander" right={<Toggle on={d.expander.enabled} onChange={v => update(c => { c.dynamics.expander.enabled = v; })} label="Expander ativo" />}>
        <div className="nx-knobs">
          <Knob label="Threshold" value={d.expander.thresholdDb} min={-90} max={0} step={0.5} def={D.expander.thresholdDb} unit="dB" onChange={v => update(c => { c.dynamics.expander.thresholdDb = v; })} />
          <Knob label="Ratio" value={d.expander.ratio} min={1} max={10} step={0.1} def={D.expander.ratio} format={v => '1:' + v.toFixed(1)} onChange={v => update(c => { c.dynamics.expander.ratio = v; })} />
          <Knob label="Range" value={d.expander.rangeDb} min={0} max={60} step={1} def={D.expander.rangeDb} unit="dB" onChange={v => update(c => { c.dynamics.expander.rangeDb = v; })} />
        </div>
      </Card>
      <Card title="De-Esser" right={<Toggle on={d.deesser.enabled} onChange={v => update(c => { c.dynamics.deesser.enabled = v; })} label="De-Esser ativo" />}>
        <Meter label="Redução" db={meters.deesserGrDb} min={-12} max={0} reverse />
        <div className="nx-knobs">
          <Knob label="Frequência" value={d.deesser.freq} min={3000} max={12000} step={50} log def={D.deesser.freq} format={v => (v / 1000).toFixed(1) + ' kHz'} onChange={v => update(c => { c.dynamics.deesser.freq = v; })} />
          <Knob label="Threshold" value={d.deesser.thresholdDb} min={-60} max={0} step={0.5} def={D.deesser.thresholdDb} unit="dB" onChange={v => update(c => { c.dynamics.deesser.thresholdDb = v; })} />
          <Knob label="Ratio" value={d.deesser.ratio} min={1} max={10} step={0.1} def={D.deesser.ratio} format={v => v.toFixed(1) + ':1'} onChange={v => update(c => { c.dynamics.deesser.ratio = v; })} />
        </div>
      </Card>
      <Card title="Saturação e Exciter">
        <div className="nx-knobs">
          <Knob label="Saturação" value={d.saturation.amount} min={0} max={1} step={0.01} def={0} format={v => Math.round(v * 100) + '%'} onChange={v => update(c => { c.dynamics.saturation.amount = v; })} />
          <Knob label="Exciter" value={d.exciter.amount} min={0} max={1} step={0.01} def={0} format={v => Math.round(v * 100) + '%'} onChange={v => update(c => { c.dynamics.exciter.amount = v; })} />
          <Knob label="Exciter freq." value={d.exciter.freq} min={1500} max={12000} step={50} log def={D.exciter.freq} format={v => (v / 1000).toFixed(1) + ' kHz'} onChange={v => update(c => { c.dynamics.exciter.freq = v; })} />
        </div>
      </Card>
    </>}
  </div>;
}
