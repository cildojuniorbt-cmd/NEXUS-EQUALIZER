// NEXUS EQ — canvas display: live output spectrum (only with real signal) + computed frequency-response curve.
import { useEffect, useRef } from 'react';
import { useNexus } from './store.tsx';
import { logFreqs } from '../dsp/eq.ts';

const GOLD = '#f2b632', GOLD_SOFT = 'rgba(242,182,50,.55)';

interface Props {
  /** Response curve in dB over log-spaced freqs (20 Hz…20 kHz); drawn as a gold line. */
  curve?: number[];
  curveRange?: number;     // ± dB shown for the curve
  showSpectrum?: boolean;
  height?: number;
}

export function Display({ curve, curveRange = 12, showSpectrum = true, height = 150 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { spectrum, running, sampleRate } = useNexus();
  const curveRef = useRef(curve); curveRef.current = curve;
  const bins = useRef(new Float32Array(4096) as Float32Array<ArrayBuffer>);

  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!;
    let raf = 0, alive = true;
    const bars = 72, freqs = logFreqs(bars + 1);
    const draw = () => {
      if (!alive) return;
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const xOf = (f: number) => (Math.log(f / 20) / Math.log(1000)) * w;
      ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '9px DM Mono, monospace';
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = xOf(f); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x + 2, h - 3); }
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      if (showSpectrum && spectrum(bins.current)) {
        const nyq = sampleRate / 2, n = bins.current.length;
        for (let i = 0; i < bars; i++) {
          const a = Math.max(1, Math.floor(freqs[i] / nyq * n)), b = Math.max(a + 1, Math.ceil(freqs[i + 1] / nyq * n));
          let m = -140; for (let k = a; k < b && k < n; k++) if (bins.current[k] > m) m = bins.current[k];
          const v = Math.min(Math.max((m + 100) / 100, 0), 1), x = xOf(freqs[i]), bw = Math.max(1, xOf(freqs[i + 1]) - x - 1);
          const g = ctx.createLinearGradient(0, h, 0, h - v * h); g.addColorStop(0, 'rgba(139,90,0,.9)'); g.addColorStop(1, GOLD);
          ctx.fillStyle = g; ctx.fillRect(x, h - v * (h - 12), bw, v * (h - 12));
        }
      }
      const cu = curveRef.current;
      if (cu && cu.length > 1) {
        ctx.beginPath();
        cu.forEach((db, i) => { const x = (i / (cu.length - 1)) * w, y = h / 2 - (Math.max(-curveRange, Math.min(curveRange, db)) / curveRange) * (h / 2 - 8); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.shadowColor = GOLD_SOFT; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [spectrum, sampleRate, showSpectrum, curveRange]);

  return <div className="nx-display" style={{ height }}>
    <canvas ref={ref} />
    {showSpectrum && !running && <span className="nx-display-note">Ligue o NEXUS EQ para ver o espectro do sinal real</span>}
  </div>;
}
