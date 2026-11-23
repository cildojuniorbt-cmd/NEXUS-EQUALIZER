// NEXUS EQ — bridge to the native shell. In the Android app (WebView) `window.NexusNative` is injected by
// StudioActivity; on iOS the WKWebView exposes `webkit.messageHandlers.nexus`. In a plain browser neither exists.
import type { NativePlan } from './plan.ts';

export interface NativeStatus {
  platform: 'android' | 'ios';
  state: 'active' | 'unavailable' | 'idle';
  message: string;
  sessions?: number;
  api?: number;
}
export interface NativeUpdateResult { status: 'available' | 'current' | 'error' | 'installing'; message: string; version?: string; notes?: string }
interface AndroidBridge { apply(planJson: string): string; status(): string; openClassic?(): void; checkUpdates?(): void; installUpdate?(): void }
declare global {
  interface Window {
    NexusNative?: AndroidBridge;
    webkit?: { messageHandlers?: { nexus?: { postMessage(m: unknown): void } } };
    __nexusNativeStatus?: (json: string) => void;
    __nexusUpdateResult?: (json: string) => void;
  }
}

export const nativePlatform = (): 'android' | 'ios' | null =>
  typeof window === 'undefined' ? null : window.NexusNative ? 'android' : window.webkit?.messageHandlers?.nexus ? 'ios' : null;

export function sendPlan(plan: NativePlan): NativeStatus | null {
  const p = nativePlatform();
  try {
    if (p === 'android') return JSON.parse(window.NexusNative!.apply(JSON.stringify(plan))) as NativeStatus;
    if (p === 'ios') { window.webkit!.messageHandlers!.nexus!.postMessage({ type: 'plan', plan }); return null; }
  } catch { /* native side unavailable */ }
  return null;
}
export function readStatus(): NativeStatus | null {
  try { return nativePlatform() === 'android' ? (JSON.parse(window.NexusNative!.status()) as NativeStatus) : null; } catch { return null; }
}
export const openClassic = (): void => { window.NexusNative?.openClassic?.(); };

export const checkNativeUpdates = (): void => { window.NexusNative?.checkUpdates?.(); };
export const installNativeUpdate = (): void => { window.NexusNative?.installUpdate?.(); };
