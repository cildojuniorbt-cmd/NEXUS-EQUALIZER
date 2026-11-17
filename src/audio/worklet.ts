// NEXUS EQ — AudioWorklet processor. Runs the same NexusEngine that the Node test-suite validates.
import { NexusEngine, type EngineMeters, type EngineReport } from '../dsp/chain.ts';
import type { NexusConfig } from '../dsp/config.ts';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

export type WorkletIn = { type: 'config'; config: NexusConfig } | { type: 'reset' };
export type WorkletOut = { type: 'meters'; meters: EngineMeters; report: EngineReport } | { type: 'error'; message: string };

const METER_EVERY_BLOCKS = 6; // ≈ 16 ms at 48 kHz

class NexusProcessor extends AudioWorkletProcessor {
  private engine!: NexusEngine;
  private blocks = 0;
  private zero = new Float32Array(128);

  constructor() {
    super();
    try {
      this.engine = new NexusEngine(sampleRate);
    } catch (err) {
      this.port.postMessage({ type: 'error', message: 'init: ' + String((err as Error)?.stack ?? err) } satisfies WorkletOut);
      throw err;
    }
    this.port.onmessage = (e: MessageEvent<WorkletIn>) => {
      try {
        if (e.data.type === 'config') this.engine.setConfig(e.data.config);
        else if (e.data.type === 'reset') this.engine.reset();
      } catch (err) {
        this.port.postMessage({ type: 'error', message: 'message: ' + String((err as Error)?.stack ?? err) } satisfies WorkletOut);
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const inp = inputs[0];
    const n = out[0].length;
    if (this.zero.length < n) this.zero = new Float32Array(n);
    const inL = inp && inp[0] ? inp[0] : this.zero;
    const inR = inp && inp[1] ? inp[1] : inL; // mono source → both channels
    const outL = out[0], outR = out[1] ?? out[0];
    try {
      this.engine.process(inL, inR, outL, outR, n);
    } catch (err) {
      const msg: WorkletOut = { type: 'error', message: String((err as Error)?.stack ?? err) };
      this.port.postMessage(msg);
      throw err;
    }
    if (++this.blocks % METER_EVERY_BLOCKS === 0) {
      const msg: WorkletOut = { type: 'meters', meters: this.engine.meters, report: this.engine.report };
      this.port.postMessage(msg);
    }
    return true;
  }
}

registerProcessor('nexus-eq', NexusProcessor as unknown as new () => AudioWorkletProcessor);
