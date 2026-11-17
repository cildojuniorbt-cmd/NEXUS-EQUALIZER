// NEXUS DSP — Preset Manager: factory presets, versioned import/export, per-device bindings.
// Presets hold settings only — never audio files.
import { defaultConfig, sanitizeConfig, type NexusConfig } from './config.ts';

export const PRESET_FORMAT = 'nexus-eq-preset';
export const PRESET_VERSION = 2;

export interface Preset {
  id: string;
  name: string;
  createdAt: number;
  factory?: boolean;
  config: NexusConfig;
}

export interface PresetFile {
  format: typeof PRESET_FORMAT;
  version: number;
  presets: { name: string; config: NexusConfig }[];
}

const g10 = (gains: number[]): NexusConfig => {
  const c = defaultConfig();
  c.eq.graphic[10] = gains;
  return c;
};

export const FACTORY_EQ_10: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [5, 4, 3, 2, 0, 0, 0, 0, 0, 0],
  Vocal: [-2, -1, 0, 2, 3, 3, 2, 1, 0, -1],
  Rock: [4, 3, 1, -1, -2, 1, 3, 4, 4, 3],
  Jazz: [3, 2, 1, 2, -1, -1, 0, 2, 3, 3],
  'Treble Boost': [0, 0, 0, 0, 0, 1, 2, 3, 4, 4],
};

export function factoryPresets(): Preset[] {
  return Object.entries(FACTORY_EQ_10).map(([name, gains]) => ({ id: 'factory-' + name.toLowerCase().replace(/\s+/g, '-'), name, createdAt: 0, factory: true, config: g10(gains) }));
}

let counter = 0;
export const newId = (): string => `p-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const createPreset = (name: string, config: NexusConfig): Preset => ({ id: newId(), name: name.trim().slice(0, 40) || 'Perfil', createdAt: Date.now(), config: structuredClone(config) });
export const duplicatePreset = (p: Preset): Preset => ({ ...createPreset(p.name + ' (cópia)', p.config), factory: false });
export const renamePreset = (list: Preset[], id: string, name: string): Preset[] => list.map(p => (p.id === id && !p.factory ? { ...p, name: name.trim().slice(0, 40) || p.name } : p));
export const deletePreset = (list: Preset[], id: string): Preset[] => list.filter(p => p.id !== id || p.factory);
export const updatePreset = (list: Preset[], id: string, config: NexusConfig): Preset[] => list.map(p => (p.id === id && !p.factory ? { ...p, config: structuredClone(config) } : p));

export function exportPresets(presets: Preset[]): string {
  const file: PresetFile = { format: PRESET_FORMAT, version: PRESET_VERSION, presets: presets.filter(p => !p.factory).map(p => ({ name: p.name, config: p.config })) };
  return JSON.stringify(file, null, 2);
}

/** Parses an exported file (v2) or the legacy v1 web format ({gains, output}). Untrusted input is sanitised. */
export function importPresets(text: string): Preset[] {
  if (text.length > 2_000_000) throw new Error('Arquivo grande demais.');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('Arquivo inválido: não é JSON.'); }
  const d = data as { format?: string; presets?: unknown; gains?: unknown; output?: unknown; name?: unknown };
  if (d && d.format === PRESET_FORMAT && Array.isArray(d.presets)) {
    return d.presets.slice(0, 200).map((p: { name?: unknown; config?: unknown }) => createPreset(typeof p?.name === 'string' ? p.name : 'Importado', sanitizeConfig(p?.config)));
  }
  if (d && Array.isArray(d.gains)) { // legacy v1
    const cfg = defaultConfig();
    cfg.eq.graphic[10] = cfg.eq.graphic[10].map((_, i) => (typeof (d.gains as unknown[])[i] === 'number' ? Math.max(-12, Math.min(12, (d.gains as number[])[i])) : 0));
    if (typeof d.output === 'number') cfg.outputDb = Math.max(-24, Math.min(12, d.output));
    return [createPreset(typeof d.name === 'string' ? d.name : 'Importado (v1)', cfg)];
  }
  throw new Error('Formato de perfil não reconhecido.');
}

export type DeviceBindings = Record<string, string>; // deviceKey → preset id
export const bindDevice = (b: DeviceBindings, deviceKey: string, presetId: string): DeviceBindings => ({ ...b, [deviceKey]: presetId });
export const unbindDevice = (b: DeviceBindings, deviceKey: string): DeviceBindings => { const n = { ...b }; delete n[deviceKey]; return n; };
export const presetForDevice = (b: DeviceBindings, list: Preset[], deviceKey: string): Preset | undefined => list.find(p => p.id === b[deviceKey]);
