import React, { useEffect, useState } from 'react';
import { useI18n } from './i18n.jsx';

export function Card({ title, children, right }) {
  return (
    <div className="card">
      {(title || right) && <div className="row" style={{ marginBottom: 6 }}><strong className="grow">{title}</strong>{right}</div>}
      {children}
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <div className="small muted" style={{ marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

export function NumInput({ value, onChange, step = 'any', min, placeholder, ...rest }) {
  return (
    <input type="number" inputMode="decimal" step={step} min={min} placeholder={placeholder}
      value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...rest} />
  );
}

export function Select({ value, onChange, options, placeholder }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0 }) {
  const v = Number(value) || 0;
  return (
    <div className="stepper">
      <button type="button" className="btn secondary" aria-label="menos" onClick={() => onChange(Math.max(min, v - step))}>−</button>
      <input type="number" inputMode="numeric" value={value} onChange={e => onChange(e.target.value === '' ? '' : Math.max(min, Number(e.target.value)))} />
      <button type="button" className="btn secondary" aria-label="más" onClick={() => onChange(v + step)}>+</button>
    </div>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button type="button" key={o.value} className={'btn ' + (value === o.value ? 'sel' : 'secondary')} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(o => <button key={o.value} role="tab" className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Stat({ k, v, tone }) {
  return <div className="stat"><div className="k">{k}</div><div className="v" style={tone ? { color: `var(--${tone})` } : null}>{v}</div></div>;
}

export function Empty({ children }) { return <div className="empty">{children}</div>; }

export function Notice({ tone = '', children }) { return <div className={'notice ' + tone}>{children}</div>; }

export function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="row"><h3 className="grow" style={{ margin: 0 }}>{title}</h3><button className="btn ghost" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** Confirmación en pantalla (sin diálogos del navegador). */
export function useConfirm() {
  const [state, setState] = useState(null);
  const { L } = useI18n();
  const ask = (text, onYes) => setState({ text, onYes });
  const ui = (
    <Modal open={!!state} onClose={() => setState(null)} title={L('Confirmar', 'Confirm')}>
      <p>{state?.text}</p>
      <div className="grid2" style={{ marginTop: 12 }}>
        <button className="btn secondary" onClick={() => setState(null)}>{L('Cancelar', 'Cancel')}</button>
        <button className="btn" onClick={() => { const f = state.onYes; setState(null); f(); }}>{L('Sí, confirmar', 'Yes')}</button>
      </div>
    </Modal>
  );
  return [ask, ui];
}

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const h = e => {
      const id = Math.random();
      setItems(x => [...x, { id, ...e.detail }]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), e.detail.kind === 'error' ? 6000 : 2800);
    };
    window.addEventListener('mb-toast', h);
    return () => window.removeEventListener('mb-toast', h);
  }, []);
  return <div className="toasts" aria-live="polite">{items.map(t => <div key={t.id} className={'toast ' + (t.kind || '')}>{t.text}</div>)}</div>;
}

export function Logo({ size = 36 }) {
  // Marca simple. Reemplaza public/icon.svg por el logo oficial si lo tienes en archivo.
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill="#fff" stroke="#2f5f96" strokeWidth="2" />
      <path d="M10 36 L22 20 L29 29 L36 16 L54 36 Z" fill="#2f5f96" opacity=".85" />
      <path d="M16 38 h32 a2 2 0 0 1 0 4 h-32 a2 2 0 0 1 0-4z" fill="#2f5f96" />
      <path d="M17 44 h30 v3 a6 6 0 0 1-6 6 h-18 a6 6 0 0 1-6-6z" fill="#2f5f96" opacity=".7" />
    </svg>
  );
}

const P = {
  produce: 'M4 15h16M5 15c0-4 3-7 7-7s7 3 7 7M3 18h18M12 5v3',
  fridge: 'M6 3h12v18H6zM6 10h12M9 6v2M9 13v3',
  coins: 'M12 7c4 0 7-1 7-2.5S16 2 12 2 5 3 5 4.5 8 7 12 7zM5 4.5v5C5 11 8 12 12 12s7-1 7-2.5v-5M5 9.5v5c0 1.5 3 2.5 7 2.5s7-1 7-2.5v-5M5 14.5v5C5 21 8 22 12 22s7-1 7-2.5v-5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 1.8L6 8.3 4 8l-1 3 2 1v1l-2 1 1 3 2-.3 1.5 1.5L7 20l3 1 1-2h2l1 2 3-1-.5-1.8 1.5-1.5 2 .3 1-3-2-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  cart: 'M3 4h2l2 12h11l2-8H6M9 20a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01',
  truck: 'M2 6h11v10H2zM13 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01',
  cash: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01',
  box: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10',
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  book: 'M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM18 20H7a3 3 0 0 1-3-3',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18'
};
export function Icon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={P[name] || P.list} /></svg>;
}
