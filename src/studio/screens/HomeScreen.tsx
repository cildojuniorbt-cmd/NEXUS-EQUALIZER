import { Icon, Tabs, Toggle } from '../ui.tsx';
import { useNexus } from '../store.tsx';
import type { InputSource } from '../../audio/controller.ts';

export type ModuleId = 'eq' | 'dyn' | 'room' | 'phones' | 'analyzer' | 'stereo' | 'voice' | 'bass' | 'device';
export const MODULES: { id: ModuleId; icon: string; label: string; ready: boolean }[] = [
  { id: 'eq', icon: 'eq', label: 'Equalizador Studio', ready: true },
  { id: 'dyn', icon: 'dyn', label: 'Dynamics Studio', ready: true },
  { id: 'room', icon: 'room', label: 'Room Studio', ready: false },
  { id: 'phones', icon: 'phones', label: 'Headphone Studio', ready: true },
  { id: 'analyzer', icon: 'analyzer', label: 'Analyzer', ready: true },
  { id: 'stereo', icon: 'stereo', label: 'Stereo Studio', ready: true },
  { id: 'voice', icon: 'voice', label: 'Voice Studio', ready: true },
  { id: 'bass', icon: 'bass', label: 'Bass Studio', ready: true },
  { id: 'device', icon: 'device', label: 'Device Studio', ready: false },
];

const SOURCES: { id: InputSource; label: string }[] = [{ id: 'pink-noise', label: 'Ruído rosa' }, { id: 'sine', label: 'Tom 1 kHz' }, { id: 'input', label: 'Entrada' }];

export function HomeScreen({ open }: { open: (m: ModuleId) => void }) {
  const { cfg, update, running, toggleRun, source, setSource, error, warnings, meters, updateAvailable, updateInstalling, applyUpdate } = useNexus();
  return <div className="nx-screen">
    <div className="nx-brand"><svg viewBox="0 0 60 24" width="46" height="20" aria-hidden><path d="M1 12h8l3-9 5 18 5-14 3 5h9l2-3 3 3h8" fill="none" stroke="#f2b632" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg><h1>NEXUS <em>EQ</em></h1><small>AUDIO STUDIO MOBILE</small></div>
    {updateAvailable && <div className="nx-update" role="status"><div><strong>Nova versão disponível</strong><small>Atualize para usar as últimas melhorias.</small></div><button className="nx-btn gold" disabled={updateInstalling} onClick={applyUpdate}>{updateInstalling ? 'Atualizando…' : 'Atualizar'}</button></div>}

    <section className={'nx-power' + (running ? ' on' : '')}>
      <button className="nx-power-btn" onClick={toggleRun} aria-pressed={running} aria-label={running ? 'Desligar NEXUS EQ' : 'Ligar NEXUS EQ'}><Icon name="power" size={26} /></button>
      <div className="nx-power-text"><strong>NEXUS EQ</strong><small>{running ? 'Processando o áudio da fonte escolhida' : 'Desligado — toque para ligar'}</small></div>
      <Toggle on={!cfg.bypass} onChange={v => update(c => { c.bypass = !v; })} label="Processamento ativo (desligue para comparar com o original)" />
    </section>
    <Tabs items={SOURCES} value={source} onChange={setSource} />
    {source === 'input' && <p className="nx-hint warn">Entrada de áudio abre o microfone/interface. Use fones para evitar microfonia.</p>}
    <p className="nx-hint">Versão web: processa a entrada e sinais de teste. Não equaliza outros aplicativos — isso é papel dos apps nativos.</p>
    {error && <p className="nx-hint bad" role="alert">{error}</p>}
    {warnings.map(w => <p key={w.code} className={'nx-hint ' + (w.level === 'danger' ? 'bad' : w.level === 'warn' ? 'warn' : '')} role="status">{w.message}</p>)}
    {running && <p className="nx-hint">Saída: {Number.isFinite(meters.outPeakDb) ? meters.outPeakDb.toFixed(1) : '−∞'} dBFS pico</p>}

    <div className="nx-grid">{MODULES.map(m => <button key={m.id} className="nx-tile" onClick={() => open(m.id)}><Icon name={m.icon} size={28} /><span>{m.label}</span>{!m.ready && <i>em breve</i>}</button>)}</div>
  </div>;
}
