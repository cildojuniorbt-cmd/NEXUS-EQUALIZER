// NEXUS EQ — application state: configuration (persisted), audio engine controller, meters, presets.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultConfig, sanitizeConfig, type NexusConfig } from '../dsp/config.ts';
import type { EngineMeters, EngineReport } from '../dsp/chain.ts';
import { evaluateSafety, type SafetyWarning } from '../dsp/safety.ts';
import { factoryPresets, type Preset } from '../dsp/presets.ts';
import { NexusAudio, type InputSource } from '../audio/controller.ts';
import workletUrl from '../audio/worklet.ts?worker&url';
import { buildNativePlan } from '../native/plan.ts';
import { nativePlatform, readStatus, sendPlan, type NativeStatus } from '../native/bridge.ts';

const CFG_KEY = 'nexus-eq-studio-config-v1';
const PRESET_KEY = 'nexus-eq-studio-presets-v1';
const NATIVE_KEY = 'nexus-eq-native-on-v1';

function load<T>(key: string, fallback: T, map: (raw: unknown) => T): T {
  try { const raw = localStorage.getItem(key); return raw ? map(JSON.parse(raw)) : fallback; } catch { return fallback; }
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const EMPTY_METERS: EngineMeters = {
  inPeakDb: -Infinity, inRmsDb: -Infinity, outPeakDb: -Infinity, outRmsDb: -Infinity, outHeldDb: -Infinity, clipped: 0,
  compGrDb: 0, limiterGrDb: 0, gateGrDb: 0, deesserGrDb: 0, multibandGrDb: [0, 0, 0],
  correlation: 1, monoLossDb: 0, phaseInverted: false, momentaryLufs: -Infinity, integratedLufs: -Infinity,
};
const EMPTY_REPORT: EngineReport = { toneBoostDb: 0, appliedPreampDb: 0, latencySamples: 0, stages: [] };

export interface NativeState { platform: 'android' | 'ios'; on: boolean; status: NativeStatus | null; unsupported: string[]; toggle: () => void }

interface Store {
  native: NativeState | null;
  cfg: NexusConfig;
  update: (fn: (c: NexusConfig) => void) => void;
  replace: (c: NexusConfig) => void;
  running: boolean;
  source: InputSource;
  setSource: (s: InputSource) => void;
  toggleRun: () => Promise<void>;
  error: string | null;
  meters: EngineMeters;
  report: EngineReport;
  warnings: SafetyWarning[];
  spectrum: (out: Float32Array<ArrayBuffer>) => boolean;
  setLoudness: (on: boolean) => void;
  setOutputDevice: (id: string) => Promise<void>;
  latencyInfo: () => { base: number; output: number; channels: number } | null;
  sampleRate: number;
  userPresets: Preset[];
  setUserPresets: (p: Preset[]) => void;
  presets: Preset[];
  updateAvailable: boolean;
  updateInstalling: boolean;
  applyUpdate: () => void;
}

const Ctx = createContext<Store | null>(null);
export const useNexus = (): Store => { const c = useContext(Ctx); if (!c) throw new Error('NexusProvider ausente'); return c; };

export function NexusProvider({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<NexusConfig>(() => load(CFG_KEY, defaultConfig(), sanitizeConfig));
  const [userPresets, setUserPresets] = useState<Preset[]>(() => load<Preset[]>(PRESET_KEY, [], raw => (Array.isArray(raw) ? (raw as Preset[]).filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.config).map(p => ({ ...p, factory: false, config: sanitizeConfig(p.config) })) : [])));
  const [running, setRunning] = useState(false);
  const [source, setSourceState] = useState<InputSource>('pink-noise');
  const [error, setError] = useState<string | null>(null);
  const [meters, setMeters] = useState<EngineMeters>(EMPTY_METERS);
  const [report, setReport] = useState<EngineReport>(EMPTY_REPORT);
  const audio = useRef<NexusAudio | null>(null);
  const latest = useRef<{ m: EngineMeters; r: EngineReport }>({ m: EMPTY_METERS, r: EMPTY_REPORT });
  const cfgRef = useRef(cfg); cfgRef.current = cfg;

  if (!audio.current) audio.current = new NexusAudio(workletUrl, { onMeters: (m, r) => { latest.current = { m, r }; } });

  // Persist + push to the engine whenever the configuration changes.
  useEffect(() => {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* storage unavailable */ }
    audio.current?.setConfig(cfg);
  }, [cfg]);
  useEffect(() => { try { localStorage.setItem(PRESET_KEY, JSON.stringify(userPresets)); } catch { /* ignore */ } }, [userPresets]);

  // Meters are throttled to ≈ 20 fps for React; the engine itself posts faster.
  useEffect(() => {
    const id = window.setInterval(() => { if (audio.current?.running) setMeters(latest.current.m), setReport(latest.current.r); }, 50);
    return () => window.clearInterval(id);
  }, []);

  const update = useCallback((fn: (c: NexusConfig) => void) => { setCfg(prev => { const n = clone(prev); fn(n); return n; }); }, []);
  const replace = useCallback((c: NexusConfig) => setCfg(clone(c)), []);

  const toggleRun = useCallback(async () => {
    setError(null);
    try {
      if (audio.current?.running) { await audio.current.stop(); setRunning(false); setMeters(EMPTY_METERS); return; }
      audio.current = new NexusAudio(workletUrl, { onMeters: (m, r) => { latest.current = { m, r }; } });
      audio.current.setConfig(cfgRef.current);
      audio.current.outputId = outputId.current;
      await audio.current.start(source);
      setRunning(true);
    } catch (e) {
      setRunning(false);
      const msg = e instanceof Error ? e.message : String(e);
      setError(source === 'input' ? `Não foi possível abrir a entrada de áudio (${msg}). Verifique a permissão do microfone.` : `Não foi possível iniciar o áudio (${msg}).`);
    }
  }, [source]);

  const setSource = useCallback((s: InputSource) => {
    setSourceState(s);
    if (audio.current?.running) audio.current.setSource(s).catch(e => setError(String(e instanceof Error ? e.message : e)));
  }, []);

  const spectrum = useCallback((out: Float32Array<ArrayBuffer>) => { if (!audio.current?.running || !audio.current.analyser) return false; audio.current.spectrum(out); return true; }, []);

  const outputId = useRef('');
  const setOutputDevice = useCallback(async (id: string) => { outputId.current = id; if (audio.current) { audio.current.outputId = id; if (audio.current.running) await audio.current.setOutputDevice(id); } }, []);
  const latencyInfo = useCallback(() => audio.current?.latencyInfo ?? null, []);
  const loudnessWanted = useRef(false);
  const setLoudness = useCallback((on: boolean) => { loudnessWanted.current = on; audio.current?.setLoudness(on); }, []);
  useEffect(() => { if (running) audio.current?.setLoudness(loudnessWanted.current); }, [running]);

  // Service-worker update flow (kept from the previous app).
  // Native shell (Android/iOS): the same UI drives the platform effect through the bridge.
  const platform = useMemo(() => nativePlatform(), []);
  const [nativeOn, setNativeOn] = useState<boolean>(() => { try { return localStorage.getItem(NATIVE_KEY) === '1'; } catch { return false; } });
  const [nativeStatus, setNativeStatus] = useState<NativeStatus | null>(null);
  const plan = useMemo(() => (platform ? buildNativePlan(cfg, nativeOn && !cfg.bypass) : null), [platform, cfg, nativeOn]);
  useEffect(() => {
    if (!plan) return;
    const id = window.setTimeout(() => { const st = sendPlan(plan) ?? readStatus(); if (st) setNativeStatus(st); }, 120);
    return () => window.clearTimeout(id);
  }, [plan]);
  useEffect(() => { try { localStorage.setItem(NATIVE_KEY, nativeOn ? '1' : '0'); } catch { /* ignore */ } }, [nativeOn]);
  useEffect(() => { if (!platform) return; window.__nexusNativeStatus = json => { try { setNativeStatus(JSON.parse(json) as NativeStatus); } catch { /* ignore */ } }; return () => { window.__nexusNativeStatus = undefined; }; }, [platform]);
  const native: NativeState | null = platform && plan ? { platform, on: nativeOn, status: nativeStatus, unsupported: plan.unsupported, toggle: () => setNativeOn(v => !v) } : null;

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const applying = useRef(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reg: ServiceWorkerRegistration | undefined, timer: number | undefined, disposed = false;
    const inspect = () => { if (!disposed && reg?.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true); };
    const onController = () => { if (applying.current) window.location.reload(); };
    const check = () => { if (document.visibilityState === 'visible') reg?.update().catch(() => undefined); };
    const onFound = () => reg?.installing?.addEventListener('statechange', inspect);
    navigator.serviceWorker.ready.then(r => {
      if (disposed || !r) return;
      reg = r; inspect(); r.addEventListener('updatefound', onFound);
      window.addEventListener('focus', check); timer = window.setInterval(check, 6 * 3600 * 1000); check();
    }).catch(() => undefined);
    navigator.serviceWorker.addEventListener('controllerchange', onController);
    return () => { disposed = true; if (timer) window.clearInterval(timer); reg?.removeEventListener('updatefound', onFound); window.removeEventListener('focus', check); navigator.serviceWorker.removeEventListener('controllerchange', onController); };
  }, []);
  const applyUpdate = useCallback(() => {
    navigator.serviceWorker?.getRegistration().then(r => {
      if (!r?.waiting) { setUpdateAvailable(false); return; }
      applying.current = true; setUpdateInstalling(true); r.waiting.postMessage({ type: 'NEXUS_SKIP_WAITING' });
    }).catch(() => setUpdateInstalling(false));
  }, []);

  const warnings = useMemo(() => (running ? evaluateSafety(cfg, report, meters) : []), [running, cfg, report, meters]);
  const presets = useMemo(() => [...factoryPresets(), ...userPresets], [userPresets]);

  const value: Store = { native, cfg, update, replace, running, source, setSource, toggleRun, error, meters, report, warnings, spectrum, setLoudness, setOutputDevice, latencyInfo, sampleRate: audio.current?.sampleRate ?? 48000, userPresets, setUserPresets, presets, updateAvailable, updateInstalling, applyUpdate };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
