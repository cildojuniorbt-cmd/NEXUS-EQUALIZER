import { useEffect } from 'react';
import { Card, Header, Meter } from '../ui.tsx';
import { Display } from '../Display.tsx';
import { useNexus } from '../store.tsx';

const lufs = (v: number) => (Number.isFinite(v) ? v.toFixed(1) + ' LUFS' : '— LUFS');

export function AnalyzerScreen({ onBack }: { onBack: () => void }) {
  const { meters: m, running, report, setLoudness } = useNexus();
  useEffect(() => { setLoudness(true); return () => setLoudness(false); }, [setLoudness]);
  return <div className="nx-screen">
    <Header title="Audio Analyzer" onBack={onBack} />
    <Display showSpectrum height={170} />
    {!running && <p className="nx-hint">O analisador só mostra dados com sinal real. Ligue o NEXUS EQ na tela inicial.</p>}
    <Card title="Níveis (dBFS)">
      <Meter label="Entrada pico" db={m.inPeakDb} />
      <Meter label="Entrada RMS" db={m.inRmsDb} />
      <Meter label="Saída pico" db={m.outPeakDb} hold={m.outHeldDb} />
      <Meter label="Saída RMS" db={m.outRmsDb} />
    </Card>
    <Card title="Medições">
      <div className="nx-stats">
        <div><small>LUFS momentâneo (entrada)</small><strong>{lufs(m.momentaryLufs)}</strong></div>
        <div><small>LUFS integrado (entrada)</small><strong>{lufs(m.integratedLufs)}</strong></div>
        <div><small>Clipping na saída</small><strong className={m.clipped > 0 ? 'bad' : ''}>{m.clipped} amostras</strong></div>
        <div><small>Correlação de fase</small><strong>{m.correlation.toFixed(2)}</strong></div>
        <div><small>Diferença de pico (saída − entrada)</small><strong>{Number.isFinite(m.outPeakDb) && Number.isFinite(m.inPeakDb) ? (m.outPeakDb - m.inPeakDb > 0 ? '+' : '') + (m.outPeakDb - m.inPeakDb).toFixed(1) + ' dB' : '—'}</strong></div>
        <div><small>Reforço máximo da curva</small><strong>+{report.toneBoostDb.toFixed(1)} dB</strong></div>
      </div>
      <p className="nx-hint">Valores digitais (dBFS/LUFS) do sinal que passa pelo NEXUS. Não são pressão sonora (dB SPL).</p>
    </Card>
  </div>;
}
