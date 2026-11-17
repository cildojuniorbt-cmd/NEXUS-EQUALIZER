import { useState } from 'react';
import { NexusProvider } from './studio/store.tsx';
import { Icon } from './studio/ui.tsx';
import { HomeScreen, type ModuleId } from './studio/screens/HomeScreen.tsx';
import { EqualizerScreen } from './studio/screens/EqualizerScreen.tsx';
import { DynamicsScreen } from './studio/screens/DynamicsScreen.tsx';
import { BassScreen, HeadphoneScreen, StereoScreen, VoiceScreen } from './studio/screens/PanelScreens.tsx';
import { AnalyzerScreen } from './studio/screens/AnalyzerScreen.tsx';
import { PresetsScreen } from './studio/screens/PresetsScreen.tsx';
import { ToolsScreen } from './studio/screens/ToolsScreen.tsx';
import { RoomScreen } from './studio/screens/RoomScreen.tsx';
import { DeviceScreen } from './studio/screens/DeviceScreen.tsx';
import LegacyApp from './LegacyApp.tsx';
import './studio/theme.css';

type Tab = 'home' | 'presets' | 'tools';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [module, setModule] = useState<ModuleId | null>(null);
  const [legacy, setLegacy] = useState(false);

  if (legacy) return <div><button className="nx-legacy-back" onClick={() => setLegacy(false)}>← Voltar ao NEXUS EQ Studio</button><LegacyApp /></div>;

  const back = () => setModule(null);
  const screens: Record<ModuleId, JSX.Element> = {
    eq: <EqualizerScreen onBack={back} />, dyn: <DynamicsScreen onBack={back} />, phones: <HeadphoneScreen onBack={back} />,
    analyzer: <AnalyzerScreen onBack={back} />, stereo: <StereoScreen onBack={back} />, voice: <VoiceScreen onBack={back} />, bass: <BassScreen onBack={back} />,
    room: <RoomScreen onBack={back} />, device: <DeviceScreen onBack={back} />,
  };
  const go = (t: Tab) => { setTab(t); setModule(null); };

  return <NexusProvider>
    <div className="nx-app">
      <main>{module ? screens[module] : tab === 'home' ? <HomeScreen open={setModule} /> : tab === 'presets' ? <PresetsScreen /> : <ToolsScreen onLegacy={() => setLegacy(true)} />}</main>
      <nav className="nx-nav" aria-label="Navegação principal">
        {([['home', 'Início', 'home'], ['presets', 'Presets', 'presets'], ['tools', 'Ferramentas', 'tools']] as const).map(([id, label, icon]) =>
          <button key={id} className={tab === id && !module ? 'on' : ''} aria-current={tab === id && !module ? 'page' : undefined} onClick={() => go(id)}><Icon name={icon} size={22} /><span>{label}</span></button>)}
      </nav>
    </div>
  </NexusProvider>;
}
