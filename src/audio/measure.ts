// NEXUS EQ — room measurement (web). Plays an exponential sine sweep and records it with the device
// microphone, then deconvolves the impulse response. The result is ALWAYS indicative: phone/tablet
// microphones are not calibrated measurement microphones (unknown sensitivity, uneven response).
import { deconvolveSweep, generateLogSweep } from '../dsp/room.ts';

const RECORDER = `class Rec extends AudioWorkletProcessor {
  process(inputs) { const c = inputs[0] && inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; }
}
registerProcessor('nexus-rec', Rec);`;

export interface MeasureOutcome { ir: Float64Array; fs: number; inputPeak: number; clipped: boolean; tooQuiet: boolean }

export async function measureRoom(opts: { deviceId?: string; sweepSeconds?: number; level?: number; onPhase?: (p: 'preparando' | 'medindo' | 'processando') => void } = {}): Promise<MeasureOutcome> {
  const { sweepSeconds = 4, level = 0.25, onPhase } = opts;
  onPhase?.('preparando');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  try {
    const url = URL.createObjectURL(new Blob([RECORDER], { type: 'text/javascript' }));
    await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const fs = ctx.sampleRate;
    const chunks: Float32Array[] = [];
    const rec = new AudioWorkletNode(ctx, 'nexus-rec', { numberOfInputs: 1, numberOfOutputs: 1 });
    rec.port.onmessage = (e: MessageEvent<Float32Array>) => { chunks.push(e.data); };
    const src = ctx.createMediaStreamSource(stream);
    const mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(rec); rec.connect(mute); mute.connect(ctx.destination);

    const sweep = generateLogSweep(20, 20000, sweepSeconds, fs);
    const buf = ctx.createBuffer(1, sweep.length, fs);
    buf.getChannelData(0).set(sweep.map(v => v * level));
    await ctx.resume();
    onPhase?.('medindo');
    const player = ctx.createBufferSource(); player.buffer = buf; player.connect(ctx.destination);
    player.start();
    await new Promise(r => setTimeout(r, (sweepSeconds + 1.6) * 1000)); // sweep + room tail
    onPhase?.('processando');

    let total = 0; for (const c of chunks) total += c.length;
    const recorded = new Float32Array(total); let o = 0; for (const c of chunks) { recorded.set(c, o); o += c.length; }
    let peak = 0; for (let i = 0; i < recorded.length; i++) peak = Math.max(peak, Math.abs(recorded[i]));
    const ir = deconvolveSweep(recorded, sweep, fs);
    return { ir, fs, inputPeak: peak, clipped: peak >= 0.98, tooQuiet: peak < 0.003 };
  } finally {
    stream.getTracks().forEach(t => t.stop());
    await ctx.close();
  }
}
