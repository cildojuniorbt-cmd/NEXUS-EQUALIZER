import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AudioLines, Headphones, Pause, Play, Power, RotateCcw, Upload, Volume2 } from 'lucide-react';

const FREQUENCIES = [20,25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000,20000];
const PARAM_FREQS = [32,64,125,250,500,1000,2000,4000,8000,16000];

type Preset = 'Flat' | 'Bass Boost' | 'Vocal' | 'Bright' | 'Warm';

export default function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const paramFiltersRef = useRef<BiquadFilterNode[]>([]);
  const masterRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fileName, setFileName] = useState('');
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [tab, setTab] = useState<'graphic' | 'parametric'>('graphic');
  const [values, setValues] = useState<number[]>(FREQUENCIES.map(() => 0));
  const [paramValues, setParamValues] = useState<number[]>(PARAM_FREQS.map(() => 0));
  const [paramFrequencies, setParamFrequencies] = useState<number[]>(PARAM_FREQS);
  const [paramQs, setParamQs] = useState<number[]>(PARAM_FREQS.map(() => 1));
  const objectUrlRef = useRef<string | null>(null);
  const [output, setOutput] = useState(0);
  const [compressorEnabled, setCompressorEnabled] = useState(false);
  const [threshold, setThreshold] = useState(-24);
  const [ratio, setRatio] = useState(3);
  const [preset, setPreset] = useState<Preset>('Flat');
  const [message, setMessage] = useState('Carregue uma música para começar');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const bars = useMemo(() => Array.from({ length: 36 }, (_, i) => 12 + ((i * 17) % 54)), []);

  function setupAudio() {
    const audio = audioRef.current;
    if (!audio || sourceRef.current) return;
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      setMessage('Este navegador não oferece suporte ao processamento de áudio necessário.');
      return;
    }
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(audio);
    const filters = FREQUENCIES.map((frequency, index) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1.15;
      filter.gain.value = enabled ? (values[index] || 0) : 0;
      return filter;
    });
    const paramFilters = paramFrequencies.map((frequency, index) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = paramQs[index];
      filter.gain.value = enabled ? (paramValues[index] || 0) : 0;
      return filter;
    });
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = compressorEnabled ? threshold : 0;
    compressor.ratio.value = compressorEnabled ? ratio : 1;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.18;
    compressor.knee.value = 18;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.08;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    const master = ctx.createGain();
    master.gain.value = Math.pow(10, output / 20);
    source.connect(filters[0]);
    filters.forEach((filter, index) => {
      if (index < filters.length - 1) filter.connect(filters[index + 1]);
    });
    filters[filters.length - 1].connect(paramFilters[0]);
    paramFilters.forEach((filter, index) => {
      if (index < paramFilters.length - 1) filter.connect(paramFilters[index + 1]);
    });
    paramFilters[paramFilters.length - 1].connect(compressor);
    compressor.connect(analyser);
    analyser.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    contextRef.current = ctx;
    sourceRef.current = source;
    filtersRef.current = filters;
    paramFiltersRef.current = paramFilters;
    masterRef.current = master;
    compressorRef.current = compressor;
    limiterRef.current = limiter;
    analyserRef.current = analyser;
    setReady(true);
    setMessage('Motor de áudio ativo');
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexus-equalizer-settings-v1');
      if (saved) {
        const data = JSON.parse(saved) as Record<string, unknown>;
        if (Array.isArray(data.values) && data.values.length === FREQUENCIES.length) setValues(data.values as number[]);
        if (Array.isArray(data.paramValues) && data.paramValues.length === PARAM_FREQS.length) setParamValues(data.paramValues as number[]);
        if (Array.isArray(data.paramFrequencies) && data.paramFrequencies.length === PARAM_FREQS.length) setParamFrequencies(data.paramFrequencies as number[]);
        if (Array.isArray(data.paramQs) && data.paramQs.length === PARAM_FREQS.length) setParamQs(data.paramQs as number[]);
        if (typeof data.output === 'number') setOutput(data.output);
        if (typeof data.threshold === 'number') setThreshold(data.threshold);
        if (typeof data.ratio === 'number') setRatio(data.ratio);
        if (typeof data.enabled === 'boolean') setEnabled(data.enabled);
        if (typeof data.compressorEnabled === 'boolean') setCompressorEnabled(data.compressorEnabled);
        if (typeof data.preset === 'string' && ['Flat','Bass Boost','Vocal','Bright','Warm'].includes(data.preset)) setPreset(data.preset as Preset);
      }
    } catch {
      // Ignore unavailable or invalid local settings and continue with defaults.
    }
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      localStorage.setItem('nexus-equalizer-settings-v1', JSON.stringify({
        values, paramValues, paramFrequencies, paramQs, output, threshold, ratio, enabled, compressorEnabled, preset
      }));
    } catch {
      // Audio processing remains available when storage is unavailable.
    }
  }, [settingsLoaded, values, paramValues, paramFrequencies, paramQs, output, threshold, ratio, enabled, compressorEnabled, preset]);

  useEffect(() => {
    filtersRef.current.forEach((filter, index) => {
      filter.gain.setTargetAtTime(enabled ? values[index] : 0, contextRef.current?.currentTime ?? 0, 0.015);
    });
  }, [values, enabled]);

  useEffect(() => {
    paramFiltersRef.current.forEach((filter, index) => {
      filter.gain.setTargetAtTime(enabled ? paramValues[index] : 0, contextRef.current?.currentTime ?? 0, 0.015);
    });
  }, [paramValues, enabled]);

  useEffect(() => {
    paramFiltersRef.current.forEach((filter, index) => {
      filter.frequency.setTargetAtTime(paramFrequencies[index], contextRef.current?.currentTime ?? 0, 0.02);
    });
  }, [paramFrequencies]);

  useEffect(() => {
    paramFiltersRef.current.forEach((filter, index) => {
      filter.Q.setTargetAtTime(paramQs[index], contextRef.current?.currentTime ?? 0, 0.02);
    });
  }, [paramQs]);

  useEffect(() => {
    if (compressorRef.current) {
      compressorRef.current.threshold.setTargetAtTime(compressorEnabled ? threshold : 0, contextRef.current?.currentTime ?? 0, 0.02);
      compressorRef.current.ratio.setTargetAtTime(compressorEnabled ? ratio : 1, contextRef.current?.currentTime ?? 0, 0.02);
    }
  }, [threshold, ratio, compressorEnabled]);

  useEffect(() => {
    masterRef.current?.gain.setTargetAtTime(Math.pow(10, output / 20), contextRef.current?.currentTime ?? 0, 0.015);
  }, [output]);

  useEffect(() => () => {
    contextRef.current?.close();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser || !playing) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frame = 0;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(data);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const count = 64;
      const gap = 3;
      const barWidth = Math.max(1, (width - gap * (count - 1)) / count);
      for (let i = 0; i < count; i++) {
        const start = Math.floor(Math.pow(i / count, 2.15) * data.length);
        const end = Math.max(start + 1, Math.floor(Math.pow((i + 1) / count, 2.15) * data.length));
        let peak = 0;
        for (let j = start; j < end; j++) peak = Math.max(peak, data[j]);
        const barHeight = Math.max(2, (peak / 255) * (height - 5));
        const x = i * (barWidth + gap);
        context.fillStyle = i % 3 === 0 ? '#343a42' : '#89919b';
        context.beginPath();
        context.roundRect(x, height - barHeight, barWidth, barHeight, 3);
        context.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [playing, ready]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    setupAudio();
    if (contextRef.current?.state === 'suspended') await contextRef.current.resume();
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setMessage('Não foi possível iniciar. Tente tocar novamente.');
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function loadFile(file?: File) {
    if (!file || !audioRef.current) return;
    if (!file.type.startsWith('audio/')) {
      setMessage('Selecione um arquivo de áudio válido.');
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    audioRef.current.src = objectUrlRef.current;
    audioRef.current.load();
    setFileName(file.name);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setMessage('Arquivo carregado. Pressione reproduzir.');
  }

  function applyPreset(next: Preset) {
    setPreset(next);
    const shapes: Record<Preset, number[]> = {
      Flat: FREQUENCIES.map(() => 0),
      'Bass Boost': FREQUENCIES.map(f => f < 160 ? 5 : f < 500 ? 2 : 0),
      Vocal: FREQUENCIES.map(f => f < 250 ? -2 : f >= 500 && f <= 4000 ? 3 : 0),
      Bright: FREQUENCIES.map(f => f >= 4000 ? 3 : f < 160 ? -1 : 0),
      Warm: FREQUENCIES.map(f => f < 250 ? 3 : f > 5000 ? -2 : 1),
    };
    setValues(shapes[next]);
    setParamValues(PARAM_FREQS.map(() => 0));
  }

  function updateBand(index: number, value: number) {
    setValues(current => current.map((v, i) => i === index ? value : v));
  }

  function updateParam(index: number, value: number) {
    setParamValues(current => current.map((v, i) => i === index ? value : v));
  }

  function updateParamFrequency(index: number, value: number) {
    setParamFrequencies(current => current.map((v, i) => i === index ? value : v));
  }

  function updateParamQ(index: number, value: number) {
    setParamQs(current => current.map((v, i) => i === index ? value : v));
  }

  function formatTime(seconds: number) {
    if (!Number.isFinite(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60).toString().padStart(2, '0');
    return minutes + ':' + remaining;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><AudioLines size={22}/></div><div><strong>NEXUS</strong><span>EQUALIZER</span></div></div>
        <div className="top-status"><span className={ready ? 'status-dot active' : 'status-dot'} />{ready ? 'MOTOR DE ÁUDIO ATIVO' : 'MOTOR DE ÁUDIO EM ESPERA'}</div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">PROCESSADOR DE ÁUDIO PESSOAL</p><h1>Seu som.<br/><em>Suas regras.</em></h1><p className="hero-copy">Ajuste cada detalhe da sua experiência sonora.</p></div>
        <div className="hero-icon"><Headphones size={58} strokeWidth={1.2}/></div>
      </section>

      <section className="player-card">
        <div className="player-head"><div><p className="section-kicker">TOCANDO AGORA</p><strong>{fileName || 'Nenhuma música selecionada'}</strong><span>{message}</span></div><label className="upload-button"><Upload size={17}/> Abrir áudio<input type="file" accept="audio/*" onChange={e => loadFile(e.target.files?.[0])}/></label></div>
        <audio ref={audioRef} onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(e.currentTarget.duration || 0)} onEnded={() => setPlaying(false)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} controls={false}/>
        <div className="player-controls"><button className="play-button" onClick={togglePlayback} disabled={!fileName}>{playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</button><div className="waveform" aria-hidden="true">{bars.map((height, i) => <i key={i} style={{ height: height + '%' }}/>)}</div><Volume2 size={18}/></div><div className="timeline"><span>{formatTime(currentTime)}</span><input aria-label="Posição da música" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} disabled={!duration} onChange={e => { const next = Number(e.target.value); if (audioRef.current) audioRef.current.currentTime = next; setCurrentTime(next); }}/><span>{formatTime(duration)}</span></div>
      </section>

      <section className="analyzer-card">
        <div className="section-heading"><div><p className="section-kicker">MONITOR EM TEMPO REAL</p><h2>Espectro sonoro</h2></div><span className="live-label"><Activity size={14}/> {playing ? 'PLAYING' : 'STANDBY'}</span></div>
        <canvas ref={canvasRef} className="spectrum-canvas" aria-label="Analisador de espectro de áudio em tempo real" />
        <div className="spectrum-labels"><span>20 Hz</span><span>200 Hz</span><span>2 kHz</span><span>20 kHz</span></div>
      </section>

      <section className="eq-card">
        <div className="section-heading"><div><p className="section-kicker">PROCESSAMENTO</p><h2>Equalizador</h2></div><button className={'power-button ' + (enabled ? 'on' : '')} onClick={() => setEnabled(v => !v)}><Power size={16}/> {enabled ? 'ON' : 'BYPASS'}</button></div>
        <div className="tabs"><button className={tab === 'graphic' ? 'selected' : ''} onClick={() => setTab('graphic')}>Gráfico de 31 bandas</button><button className={tab === 'parametric' ? 'selected' : ''} onClick={() => setTab('parametric')}>Paramétrico de 10 bandas</button></div>
        {tab === 'graphic' ? <div className="graphic-eq">{FREQUENCIES.map((frequency, index) => <div className="band" key={frequency}><span className="band-value">{values[index] > 0 ? '+' : ''}{values[index].toFixed(0)}</span><input aria-label={frequency + ' Hz gain'} type="range" min="-12" max="12" step=".5" value={values[index]} onChange={e => updateBand(index, Number(e.target.value))}/><span className="band-frequency">{frequency >= 1000 ? (frequency / 1000).toString().replace('.0','') + 'k' : frequency}</span></div>)}</div> : <div className="parametric-grid">{paramFrequencies.map((frequency, index) => <div className="param-band" key={index}><strong>BAND {index + 1} · {frequency >= 1000 ? (frequency / 1000).toFixed(2).replace(/0+$/,'') + ' kHz' : Math.round(frequency) + ' Hz'}</strong><label>GANHO <b>{paramValues[index] > 0 ? '+' : ''}{paramValues[index].toFixed(1)} dB</b><input type="range" min="-12" max="12" step=".5" value={paramValues[index]} onChange={e => updateParam(index, Number(e.target.value))}/></label><label>FREQUÊNCIA <b>{Math.round(frequency)} Hz</b><input type="range" min="20" max="20000" step="1" value={frequency} onChange={e => updateParamFrequency(index, Number(e.target.value))}/></label><label>Q / LARGURA <b>{paramQs[index].toFixed(2)}</b><input type="range" min="0.3" max="8" step=".05" value={paramQs[index]} onChange={e => updateParamQ(index, Number(e.target.value))}/></label><small>FILTRO PEAKING</small></div>)}</div>}
        <div className="eq-footer"><label>PRÉ-AMPLIFICAÇÃO / SAÍDA <strong>{output > 0 ? '+' : ''}{output.toFixed(1)} dB</strong></label><input type="range" min="-12" max="6" step=".5" value={output} onChange={e => setOutput(Number(e.target.value))}/><button className="reset-button" onClick={() => { applyPreset('Flat'); setOutput(0); }}><RotateCcw size={14}/> Redefinir EQ</button></div>
      </section>

      <section className="presets-card"><div className="section-heading"><div><p className="section-kicker">DYNAMICS PROCESSAMENTO</p><h2>Compressor</h2></div><button className={'power-button ' + (compressorEnabled ? 'on' : '')} onClick={() => setCompressorEnabled(v => !v)}><Power size={16}/> {compressorEnabled ? 'ON' : 'OFF'}</button></div><p className="module-copy">Controle a dinâmica e reduza picos. O compressor não aumenta automaticamente o volume percebido.</p><div className="dynamics-grid"><label>LIMIAR <strong>{threshold} dB</strong><input type="range" min="-60" max="0" step="1" value={threshold} onChange={e => setThreshold(Number(e.target.value))}/></label><label>PROPORÇÃO <strong>{ratio.toFixed(1)}:1</strong><input type="range" min="1" max="12" step="0.5" value={ratio} onChange={e => setRatio(Number(e.target.value))}/></label></div></section>

      <section className="presets-card"><div className="section-heading"><div><p className="section-kicker">AJUSTE RÁPIDO</p><h2>Presets de som</h2></div></div><div className="preset-list">{(['Flat','Bass Boost','Vocal','Bright','Warm'] as Preset[]).map(item => <button key={item} className={preset === item ? 'preset active-preset' : 'preset'} onClick={() => applyPreset(item)}>{item}</button>)}</div></section>
      <footer><span>NEXUS EQUALIZER</span><span>WEB AUDIO ENGINE · PREVIEW 0.1.0</span></footer>
    </main>
  );
}