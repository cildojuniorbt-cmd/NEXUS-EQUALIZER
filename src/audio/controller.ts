// NEXUS EQ — Web audio controller. Web/PWA is a prototype path: it can only process audio that the
// browser hands to the page (microphone / line-in / USB interface or the built-in test signal).
// It can NOT equalize other apps (Spotify, YouTube, games). That requires the native Android/iOS builds.
import { defaultConfig, type NexusConfig } from '../dsp/config.ts';
import type { EngineMeters, EngineReport } from '../dsp/chain.ts';
import type { WorkletIn, WorkletOut } from './worklet.ts';

export type InputSource = 'input' | 'pink-noise' | 'sine';

export interface NexusAudioEvents {
  onMeters?: (m: EngineMeters, r: EngineReport) => void;
}

export class NexusAudio {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private node: AudioWorkletNode | null = null;
  private src: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private config: NexusConfig = defaultConfig();
  private loudness = false;
  outputId = '';
  constructor(private workletUrl: string | URL, private events: NexusAudioEvents = {}) {}

  get running(): boolean { return this.ctx?.state === 'running'; }
  get sampleRate(): number { return this.ctx?.sampleRate ?? 48000; }

  async start(source: InputSource = 'input', deviceId?: string): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      await this.ctx.audioWorklet.addModule(this.workletUrl);
      this.node = new AudioWorkletNode(this.ctx, 'nexus-eq', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      this.node.port.onmessage = (e: MessageEvent<WorkletOut>) => {
        if (e.data.type === 'meters') this.events.onMeters?.(e.data.meters, e.data.report);
      };
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 8192;
      this.analyser.smoothingTimeConstant = 0.7;
      this.node.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.post({ type: 'config', config: this.config });
      this.post({ type: 'loudness', enabled: this.loudness });
    }
    await this.setSource(source, deviceId);
    if (this.outputId) await this.setOutputDevice(this.outputId).catch(() => undefined);
    await this.ctx.resume();
  }

  async setSource(source: InputSource, deviceId?: string): Promise<void> {
    if (!this.ctx || !this.node) return;
    this.src?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (source === 'input') {
      // Disable the browser's voice processing so the signal reaching NEXUS is the raw input.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.src = this.ctx.createMediaStreamSource(this.stream);
    } else if (source === 'sine') {
      const o = this.ctx.createOscillator(); o.frequency.value = 1000;
      const g = this.ctx.createGain(); g.gain.value = 0.1;
      o.connect(g); o.start(); this.src = g;
    } else {
      this.src = pinkNoise(this.ctx, 0.1);
    }
    this.src.connect(this.node);
  }

  /** True when the browser can route an AudioContext to a chosen output (Chromium). Safari/Firefox cannot. */
  static get canSelectOutput(): boolean { return typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype; }
  get latencyInfo(): { base: number; output: number; channels: number } | null {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return c ? { base: c.baseLatency, output: c.outputLatency ?? 0, channels: c.destination.maxChannelCount } : null;
  }
  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputId = deviceId;
    const c = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (c?.setSinkId) await c.setSinkId(deviceId);
  }

  setConfig(cfg: NexusConfig): void { this.config = cfg; this.post({ type: 'config', config: cfg }); }
  reset(): void { this.post({ type: 'reset' }); }
  /** LUFS metering costs CPU, so it is only enabled while a screen needs it. */
  setLoudness(enabled: boolean): void { this.loudness = enabled; this.post({ type: 'loudness', enabled }); }

  /** Output spectrum in dBFS-like units from the AnalyserNode (for the display only). */
  spectrum(out: Float32Array<ArrayBuffer>): void { this.analyser?.getFloatFrequencyData(out); }

  async stop(): Promise<void> {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    await this.ctx?.close();
    this.ctx = null; this.node = null; this.src = null; this.analyser = null;
  }

  private post(m: WorkletIn): void { this.node?.port.postMessage(m); }
}

function pinkNoise(ctx: AudioContext, amp: number): AudioNode {
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) { // Paul Kellet's pink-noise filter
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = amp * 0.11 * (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362); b6 = w * 0.115926;
  }
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start();
  return s;
}
