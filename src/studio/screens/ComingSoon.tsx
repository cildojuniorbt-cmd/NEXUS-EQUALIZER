import { Card, Header } from '../ui.tsx';

const TEXT: Record<string, { title: string; engine: string; missing: string }> = {
  room: { title: 'Room Studio', engine: 'O motor já tem modelo de sala, alinhamento de caixas, medição por sweep, cálculo de RT60 e ajuste de EQ de correção.', missing: 'Falta a tela de configuração e o fluxo de medição. Medição com o microfone do aparelho nunca será apresentada como calibrada ou profissional.' },
  device: { title: 'Device Studio', engine: 'Os perfis por dispositivo já existem no Preset Manager.', missing: 'A detecção e identificação de saídas (Bluetooth, USB DAC, fones) depende de APIs nativas e de permissões de cada sistema. Ainda não implementado.' },
};
export function ComingSoon({ id, onBack }: { id: string; onBack: () => void }) {
  const t = TEXT[id] ?? { title: id, engine: '', missing: '' };
  return <div className="nx-screen"><Header title={t.title} onBack={onBack} />
    <Card title="Em desenvolvimento"><p className="nx-hint">{t.engine}</p><p className="nx-hint">{t.missing}</p><p className="nx-hint">Nenhum controle é exibido aqui até que esteja ligado a processamento real.</p></Card></div>;
}
