// NEXUS EQ — shared design-system components (graphite / chrome / gold). Used by every screen.
import { useRef, type ReactNode, type KeyboardEvent, type PointerEvent } from 'react';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const snap = (v: number, step: number) => Math.round(v / step) * step;

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const p: Record<string, ReactNode> = {
    eq: <><path d="M5 4v16M12 4v16M19 4v16" /><circle cx="5" cy="14" r="2" /><circle cx="12" cy="8" r="2" /><circle cx="19" cy="16" r="2" /></>,
    dyn: <path d="M2 13h4l2-7 3 14 3-10 2 3h6" />,
    room: <><path d="M3 8l9-5 9 5v9l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v9" /></>,
    phones: <><path d="M4 15v-3a8 8 0 0116 0v3" /><rect x="3" y="14" width="4" height="7" rx="1.5" /><rect x="17" y="14" width="4" height="7" rx="1.5" /></>,
    analyzer: <path d="M5 20V10M10 20V4M15 20v-8M20 20V7" />,
    stereo: <><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></>,
    voice: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>,
    bass: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
    device: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
    home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
    presets: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
    tools: <path d="M14 6a4 4 0 005 5l-9 9a2 2 0 01-3-3zM14 6l3-3 3 3-3 3" />,
    power: <path d="M12 3v9M6.5 6.5a8 8 0 1011 0" />,
    back: <path d="M15 5l-7 7 7 7" />,
    save: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
    reset: <path d="M4 12a8 8 0 108-8M4 4v5h5" />,
    shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  };
  return <svg className="nx-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p[name]}</svg>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={'nx-toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)}><span /></button>;
}

export function Tabs<T extends string | number>({ items, value, onChange }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return <div className="nx-tabs" role="tablist">{items.map(i => <button key={String(i.id)} role="tab" aria-selected={i.id === value} className={i.id === value ? 'on' : ''} onClick={() => onChange(i.id)}>{i.label}</button>)}</div>;
}

export function Card({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={'nx-card ' + className}>{(title || right) && <header><h3>{title}</h3>{right}</header>}{children}</section>;
}

export function ToggleRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return <div className="nx-row"><div><strong>{label}</strong>{hint && <small>{hint}</small>}</div><Toggle on={on} onChange={onChange} label={label} /></div>;
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return <header className="nx-head">{onBack ? <button className="nx-iconbtn" onClick={onBack} aria-label="Voltar"><Icon name="back" /></button> : <span className="nx-iconbtn ghost" />}<h1>{title}</h1><div className="nx-head-right">{right}</div></header>;
}

interface KnobProps {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; def?: number; log?: boolean;
  onChange: (v: number) => void; format?: (v: number) => string; size?: number;
}

/** Rotary control: drag vertically, arrow keys (Shift = ×10), double-click resets to default. */
export function Knob({ label, value, min, max, step = 0.1, unit = '', def, log = false, onChange, format, size = 64 }: KnobProps) {
  const toFrac = (v: number) => clamp(log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min), 0, 1);
  const fromFrac = (f: number) => clamp(snap(log ? min * Math.pow(max / min, f) : min + f * (max - min), step), min, max);
  const drag = useRef<{ y: number; f: number } | null>(null);
  const frac = toFrac(value), angle = -135 + 270 * frac;
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const text = format ? format(value) : value.toFixed(decimals) + (unit ? ' ' + unit : '');
  const down = (e: PointerEvent) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); drag.current = { y: e.clientY, f: frac }; };
  const move = (e: PointerEvent) => { if (drag.current) onChange(fromFrac(drag.current.f + (drag.current.y - e.clientY) / 160)); };
  const key = (e: KeyboardEvent) => {
    const d = (e.shiftKey ? 10 : 1) * (log ? 0 : step);
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onChange(log ? fromFrac(frac + 0.02) : clamp(value + d, min, max)); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(log ? fromFrac(frac - 0.02) : clamp(value - d, min, max)); }
  };
  const r = size / 2 - 4, c = size / 2, a0 = (-135 - 90) * Math.PI / 180, a1 = (angle - 90) * Math.PI / 180;
  const pt = (a: number) => `${c + r * Math.cos(a)} ${c + r * Math.sin(a)}`;
  return <div className="nx-knob">
    <div role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={text}
      className="nx-knob-dial" style={{ width: size, height: size }} onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}
      onDoubleClick={() => def !== undefined && onChange(def)} onKeyDown={key}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path d={`M ${pt(a0)} A ${r} ${r} 0 1 1 ${pt((135 - 90) * Math.PI / 180)}`} className="nx-arc-bg" />
        {frac > 0.001 && <path d={`M ${pt(a0)} A ${r} ${r} 0 ${angle + 135 > 180 ? 1 : 0} 1 ${pt(a1)}`} className="nx-arc" />}
      </svg>
      <div className="nx-knob-cap" style={{ transform: `rotate(${angle}deg)` }}><i /></div>
    </div>
    <span className="nx-knob-label">{label}</span>
    <span className="nx-knob-value">{text}</span>
  </div>;
}

/** Vertical fader (EQ bands). Pointer drag, arrow keys, double-click = reset. */
export function VFader({ value, min, max, step = 0.5, onChange, label, def = 0, height = 150 }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; def?: number; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (clientY: number) => {
    const b = ref.current!.getBoundingClientRect();
    onChange(clamp(snap(max - ((clientY - b.top) / b.height) * (max - min), step), min, max));
  };
  const pos = (max - value) / (max - min);
  return <div ref={ref} role="slider" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
    className="nx-fader" style={{ height }}
    onPointerDown={e => { (e.currentTarget as Element).setPointerCapture(e.pointerId); set(e.clientY); }}
    onPointerMove={e => { if (e.buttons) set(e.clientY); }}
    onDoubleClick={() => onChange(def)}
    onKeyDown={e => {
      if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + step * (e.shiftKey ? 4 : 1), min, max)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - step * (e.shiftKey ? 4 : 1), min, max)); }
    }}>
    <span className="nx-fader-track" /><span className="nx-fader-fill" style={{ top: `${Math.min(pos, 0.5) * 100}%`, height: `${Math.abs(pos - 0.5) * 100}%` }} />
    <span className="nx-fader-thumb" style={{ top: `${pos * 100}%` }} />
  </div>;
}

export function Slider({ label, value, min, max, step = 0.1, unit = '', onChange, format }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; format?: (v: number) => string }) {
  return <label className="nx-slider"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label} /><output>{format ? format(value) : value.toFixed(step >= 1 ? 0 : 1) + (unit ? ' ' + unit : '')}</output></label>;
}

/** Horizontal level meter for dBFS-type values. */
export function Meter({ label, db, min = -60, max = 0, hold, warnAt = -3, reverse = false }: { label: string; db: number; min?: number; max?: number; hold?: number; warnAt?: number; reverse?: boolean }) {
  const f = (v: number) => clamp(((reverse ? -v : v) - (reverse ? -max : min)) / (max - min), 0, 1);
  const level = Number.isFinite(db) ? f(db) : 0;
  return <div className="nx-meter"><span>{label}</span><div className="nx-meter-bar"><i className={!reverse && db > warnAt ? 'hot' : ''} style={{ width: `${level * 100}%` }} />{hold !== undefined && Number.isFinite(hold) && <b style={{ left: `${f(hold) * 100}%` }} />}</div><output>{Number.isFinite(db) ? db.toFixed(1) : '−∞'}</output></div>;
}

export const fmtHz = (f: number) => (f >= 1000 ? `${Number((f / 1000).toFixed(2))}k` : `${Number(f.toFixed(1))}`);
export const fmtDb = (v: number) => (v > 0 ? '+' : '') + v.toFixed(1);
