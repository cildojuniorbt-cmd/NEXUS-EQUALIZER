import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Header, Icon } from '../ui.tsx';
import { useNexus } from '../store.tsx';
import { NexusAudio } from '../../audio/controller.ts';
import { bindDevice, presetForDevice, unbindDevice, type DeviceBindings } from '../../dsp/presets.ts';

const BIND_KEY = 'nexus-eq-device-bindings-v1';
type Kind = 'bluetooth' | 'usb' | 'fone' | 'alto-falante' | 'outro';
const KIND_LABEL: Record<Kind, string> = { bluetooth: 'Bluetooth', usb: 'USB / DAC', fone: 'Fone com fio', 'alto-falante': 'Alto-falante', outro: 'Dispositivo de áudio' };

/** The browser only exposes a label, so the type is a best guess from the name — never a guarantee. */
function guessKind(label: string): Kind {
  const l = label.toLowerCase();
  if (/bluetooth|airpods|buds|\bbt\b|wh-|wf-|jbl|sony/.test(l)) return 'bluetooth';
  if (/usb|dac|interface|scarlett|focusrite|audio\s?box|behringer/.test(l)) return 'usb';
  if (/head(set|phone)|fone|earphone|auricular/.test(l)) return 'fone';
  if (/speaker|alto-?falante|caixa|default|padr/.test(l)) return 'alto-falante';
  return 'outro';
}

interface Dev { id: string; label: string; kind: 'audioinput' | 'audiooutput' }

function useDevices() {
  const [devs, setDevs] = useState<Dev[]>([]);
  const [labelsHidden, setLabelsHidden] = useState(false);
  const [change, setChange] = useState<{ added: Dev[]; removed: Dev[] } | null>(null);
  const prev = useRef<Dev[] | null>(null);
  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput');
    const list: Dev[] = all.map(d => ({ id: d.deviceId, label: d.label, kind: d.kind as Dev['kind'] }));
    setLabelsHidden(list.length > 0 && list.every(d => !d.label));
    if (prev.current) {
      const key = (d: Dev) => d.kind + ':' + (d.label || d.id);
      const before = new Set(prev.current.map(key)), now = new Set(list.map(key));
      const added = list.filter(d => !before.has(key(d))), removed = prev.current.filter(d => !now.has(key(d)));
      if (added.length || removed.length) setChange({ added, removed });
    }
    prev.current = list; setDevs(list);
  }, []);
  useEffect(() => { refresh(); navigator.mediaDevices?.addEventListener?.('devicechange', refresh); return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh); }, [refresh]);
  const askPermission = useCallback(async () => {
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()); } catch { /* denied */ }
    await refresh();
  }, [refresh]);
  return { devs, labelsHidden, change, dismiss: () => setChange(null), askPermission };
}

export function DeviceScreen({ onBack }: { onBack: () => void }) {
  const { running, presets, replace, setOutputDevice, latencyInfo, sampleRate } = useNexus();
  const { devs, labelsHidden, change, dismiss, askPermission } = useDevices();
  const [bindings, setBindings] = useState<DeviceBindings>(() => { try { return JSON.parse(localStorage.getItem(BIND_KEY) ?? '{}'); } catch { return {}; } });
  const [active, setActive] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const canSelect = NexusAudio.canSelectOutput;
  const save = (b: DeviceBindings) => { setBindings(b); try { localStorage.setItem(BIND_KEY, JSON.stringify(b)); } catch { /* unavailable */ } };
  const outputs = devs.filter(d => d.kind === 'audiooutput'), inputs = devs.filter(d => d.kind === 'audioinput');
  const keyOf = (d: Dev) => d.label || d.id;
  const info = running ? latencyInfo() : null;

  const choose = async (d: Dev) => {
    try {
      await setOutputDevice(d.id); setActive(d.id);
      const p = presetForDevice(bindings, presets, keyOf(d));
      if (p) { replace(p.config); setMsg(`Perfil “${p.name}” aplicado para ${d.label || 'esta saída'}.`); } else setMsg(null);
    } catch (e) { setMsg(e instanceof Error ? `Não foi possível usar esta saída: ${e.message}` : 'Não foi possível usar esta saída.'); }
  };
  const newBound = change?.added.filter(d => presetForDevice(bindings, presets, keyOf(d))) ?? [];

  const row = (d: Dev, output: boolean) => {
    const kind = guessKind(d.label), p = presetForDevice(bindings, presets, keyOf(d));
    return <li key={d.kind + d.id + d.label}>
      <div className="nx-list-main" style={{ cursor: 'default' }}><strong>{d.label || 'Dispositivo sem nome'}</strong><small>{KIND_LABEL[kind]} (por nome){active === d.id ? ' · saída ativa' : ''}</small></div>
      {output && <div className="nx-field"><span>Perfil desta saída</span>
        <select value={bindings[keyOf(d)] ?? ''} onChange={e => save(e.target.value ? bindDevice(bindings, keyOf(d), e.target.value) : unbindDevice(bindings, keyOf(d)))}>
          <option value="">Nenhum</option>{presets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}
      {output && canSelect && <div className="nx-list-actions"><button onClick={() => choose(d)}>Usar esta saída{p ? ' + perfil' : ''}</button></div>}
    </li>;
  };

  return <div className="nx-screen">
    <Header title="Device Studio" onBack={onBack} />
    {change && <div className="nx-update" role="status"><div><strong>Dispositivo de áudio alterado</strong><small>{[...change.added.map(d => `+ ${d.label || 'novo'}`), ...change.removed.map(d => `− ${d.label || 'removido'}`)].join(' · ')}</small>{newBound.length > 0 && <small>Há um perfil salvo para {newBound[0].label}.</small>}</div>
      {newBound.length > 0 && canSelect ? <button className="nx-btn gold" onClick={() => { choose(newBound[0]); dismiss(); }}>Aplicar</button> : <button className="nx-btn" onClick={dismiss}>OK</button>}</div>}
    {labelsHidden && <Card><p className="nx-hint">O navegador oculta os nomes dos dispositivos até você permitir o acesso ao áudio.</p><button className="nx-btn gold" style={{ width: '100%' }} onClick={askPermission}>Permitir e identificar dispositivos</button></Card>}
    <Card title="Saídas de áudio" right={<Icon name="phones" size={18} />}>
      {!canSelect && <p className="nx-hint warn">Este navegador não permite escolher a saída de áudio da página (isso funciona no Chromium/Chrome/Edge). O áudio vai para a saída padrão do sistema. Perfis por saída ficam salvos e são aplicados nos aplicativos nativos.</p>}
      <ul className="nx-list">{outputs.length ? outputs.map(d => row(d, true)) : <li><small className="nx-hint">Nenhuma saída listada.</small></li>}</ul>
    </Card>
    <Card title="Entradas de áudio"><ul className="nx-list">{inputs.length ? inputs.map(d => row(d, false)) : <li><small className="nx-hint">Nenhuma entrada listada.</small></li>}</ul></Card>
    <Card title="Formato do sinal">
      <div className="nx-stats">
        <div><small>Taxa de amostragem</small><strong>{running ? `${sampleRate / 1000} kHz` : '—'}</strong></div>
        <div><small>Canais de saída</small><strong>{info ? info.channels : '—'}</strong></div>
        <div><small>Latência de saída</small><strong>{info ? `${((info.base + info.output) * 1000).toFixed(0)} ms` : '—'}</strong></div>
        <div><small>Profundidade de bits</small><strong>indisponível</strong></div>
      </div>
      <p className="nx-hint">Ligue o NEXUS EQ para ver a taxa e a latência. O navegador não informa a profundidade de bits nem o DAC real; o tipo do dispositivo é deduzido pelo nome.</p>
    </Card>
    {msg && <p className="nx-hint" role="status">{msg}</p>}
  </div>;
}
