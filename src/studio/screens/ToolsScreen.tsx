import { Card, Header, Icon, Knob, ToggleRow, fmtDb } from '../ui.tsx';
import { useNexus } from '../store.tsx';
import { openClassic } from '../../native/bridge.ts';
import { SPL_NOTICE } from '../../dsp/safety.ts';

export function ToolsScreen({ onLegacy }: { onLegacy: () => void }) {
  const { cfg, update, native } = useNexus();
  const s = cfg.safety;
  return <div className="nx-screen">
    <Header title="Ferramentas" />
    <Card title="Safety Control" right={<Icon name="shield" size={18} />}>
      <div className="nx-knobs">
        <Knob label="Trim de entrada" value={cfg.inputTrimDb} min={-24} max={24} step={0.5} def={0} format={v => fmtDb(v) + ' dB'} onChange={v => update(c => { c.inputTrimDb = v; })} />
        <Knob label="Ganho de saída" value={cfg.outputDb} min={-24} max={12} step={0.5} def={0} format={v => fmtDb(v) + ' dB'} onChange={v => update(c => { c.outputDb = v; })} />
        <Knob label="Ceiling" value={s.ceilingDb} min={-12} max={0} step={0.1} def={-0.3} format={v => v.toFixed(1) + ' dBFS'} onChange={v => update(c => { c.safety.ceilingDb = v; })} />
        <Knob label="Reforço máx." value={s.maxBoostDb} min={0} max={18} step={0.5} def={defaultMax} format={v => fmtDb(v) + ' dB'} onChange={v => update(c => { c.safety.maxBoostDb = v; })} />
      </div>
      <ToggleRow label="Pré-amp automático" hint="Reduz o pré-amp pelo maior reforço da curva para evitar clipping" on={s.autoPreamp} onChange={v => update(c => { c.safety.autoPreamp = v; })} />
      <ToggleRow label="Proteção contra clipping" hint="Limitador final sempre ativo no ceiling" on={s.clipProtection} onChange={v => update(c => { c.safety.clipProtection = v; })} />
      <p className="nx-hint">{SPL_NOTICE}</p>
    </Card>
    <Card title="O que a versão web faz e não faz">
      <p className="nx-hint">A versão web processa somente o áudio que o navegador entrega à página: entrada de microfone/interface de áudio e sinais de teste. Ela <strong>não</strong> equaliza Spotify, YouTube, jogos nem outros aplicativos. Isso depende dos aplicativos nativos de cada sistema, sujeitos às limitações do Android e do iOS.</p>
    </Card>
    {native?.platform === 'android' && <Card title="Modo clássico (Android)"><p className="nx-hint">Abre o painel nativo anterior, com o equalizador de sistema, Bass Boost, Loudness e a atualização do app.</p><button className="nx-btn" onClick={openClassic}>Abrir modo clássico</button></Card>}
    <Card title="Equalizador simples (versão anterior)"><button className="nx-btn" onClick={onLegacy}>Abrir painel de 10 bandas</button></Card>
  </div>;
}
const defaultMax = 12;
