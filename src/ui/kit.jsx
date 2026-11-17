// Reusable UI building blocks: sheets, dialogs, toasts, fields.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { pushOverlay } from '../store.js';

// ---------- Bottom sheet ----------
export function Sheet({ title, onClose, children, footer, full = false, actions }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const done = pushOverlay(() => { closeRef.current = null; onClose(); });
    closeRef.current = done;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; if (closeRef.current) { closeRef.current(); closeRef.current = null; } };
  }, []);
  return (
    <div class="backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class={`sheet ${full ? 'full' : ''}`} role="dialog" aria-label={title}>
        {!full && <div class="grabber" />}
        <div class="sheet-h" style={full ? { paddingTop: 'calc(var(--safe-top) + 10px)' } : null}>
          <h3>{title}</h3>
          {actions}
          <button class="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div class="sheet-b">{children}</div>
        {footer && <div class="sheet-f">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- imperative dialogs & toasts ----------
let hostSet = null;
let toastSet = null;
const queue = [];
export function DialogHost() {
  const [dlg, setDlg] = useState(null);
  const [toasts, setToasts] = useState([]);
  hostSet = setDlg; toastSet = setToasts;
  useEffect(() => { if (queue.length && !dlg) setDlg(queue.shift()); }, [dlg]);
  return (
    <>
      {dlg && <DialogView d={dlg} onDone={(v) => { dlg.resolve(v); setDlg(null); }} />}
      <div class="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} class={`toast ${t.type || ''}`}>
            <span>{t.msg}</span>
            {t.action && <button onClick={() => { t.action.fn(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </>
  );
}
function DialogView({ d, onDone }) {
  const [val, setVal] = useState(d.value || '');
  const doneRef = useRef(null);
  useEffect(() => { doneRef.current = pushOverlay(() => { doneRef.current = null; onDone(d.kind === 'prompt' ? null : false); }); return () => { if (doneRef.current) doneRef.current(); }; }, []);
  const finish = (v) => { onDone(v); };
  return (
    <div class="backdrop dialog-wrap" onClick={(e) => { if (e.target === e.currentTarget) finish(d.kind === 'prompt' ? null : false); }}>
      <div class="dialog" role="alertdialog">
        <h3>{d.title}</h3>
        {d.message && <div class="muted" style={{ whiteSpace: 'pre-line', marginBottom: 14 }}>{d.message}</div>}
        {d.kind === 'prompt' && (
          <input class="input" autoFocus value={val} placeholder={d.placeholder || ''} onInput={(e) => setVal(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') finish(val); }} style={{ marginBottom: 14 }} />
        )}
        <div class="row" style={{ justifyContent: 'flex-end' }}>
          {d.kind !== 'alert' && <button class="btn outline" onClick={() => finish(d.kind === 'prompt' ? null : false)}>{d.cancelText || 'Cancel'}</button>}
          <button class={`btn ${d.danger ? 'danger' : ''}`} onClick={() => finish(d.kind === 'prompt' ? val : true)} disabled={d.kind === 'prompt' && d.typeToConfirm && val !== d.typeToConfirm}>{d.okText || 'OK'}</button>
        </div>
      </div>
    </div>
  );
}
function openDialog(d) {
  return new Promise((resolve) => {
    const item = { ...d, resolve };
    if (hostSet) hostSet((cur) => { if (cur) { queue.push(item); return cur; } return item; });
    else resolve(d.kind === 'prompt' ? null : false);
  });
}
export const confirmDialog = (o) => openDialog({ kind: 'confirm', ...o });
export const alertDialog = (o) => openDialog({ kind: 'alert', ...o });
export const promptDialog = (o) => openDialog({ kind: 'prompt', ...o });

let tid = 0;
export function toast(msg, { type, action, ms = 2800 } = {}) {
  if (!toastSet) return;
  const id = ++tid;
  toastSet((t) => [...t.slice(-2), { id, msg, type, action }]);
  setTimeout(() => toastSet && toastSet((t) => t.filter((x) => x.id !== id)), action ? Math.max(ms, 5000) : ms);
}

// ---------- form helpers ----------
export function Field({ label, children, class: cls = '', style }) {
  return <label class={`field ${cls}`} style={style}><span>{label}</span>{children}</label>;
}
export function Switch({ checked, onChange, disabled }) {
  return (
    <label class="switch">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
      <i />
    </label>
  );
}
export function ToggleRow({ title, desc, checked, onChange, disabled }) {
  return (
    <div class="toggle-row">
      <div class="grow"><div class="bold">{title}</div>{desc && <div class="small muted">{desc}</div>}</div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}
export function Seg({ value, options, onChange }) {
  return (
    <div class="seg">
      {options.map((o) => <button key={o.value} class={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
export function Empty({ icon = 'file', title, text, children }) {
  return (
    <div class="empty">
      <Icon name={icon} size={46} stroke={1.5} />
      <div class="bold" style={{ color: 'var(--text)', fontSize: 16 }}>{title}</div>
      {text && <div class="small" style={{ marginTop: 4 }}>{text}</div>}
      {children && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}
export function Spinner({ size = 22 }) { return <div class="spinner" style={{ width: size, height: size }} />; }

/** Busy overlay for long jobs (exports, backups) */
export function useBusy() {
  const [busy, setBusy] = useState(null);
  const run = async (label, fn) => {
    setBusy({ label, p: null });
    try { return await fn((p) => setBusy({ label, p })); } finally { setBusy(null); }
  };
  const view = busy ? (
    <div class="backdrop dialog-wrap" style={{ zIndex: 300 }}>
      <div class="dialog center" style={{ maxWidth: 300 }}>
        <div class="row" style={{ justifyContent: 'center', marginBottom: 12 }}><Spinner size={34} /></div>
        <div class="bold">{busy.label}</div>
        {busy.p != null && <div class="progress" style={{ marginTop: 12 }}><i style={{ width: `${Math.round(busy.p * 100)}%` }} /></div>}
        <div class="small muted" style={{ marginTop: 6 }}>Please keep the app open…</div>
      </div>
    </div>
  ) : null;
  return [run, view];
}

/** Object URL for a Blob, revoked automatically */
export function useBlobURL(blob) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!blob) { setUrl(null); return undefined; }
    const u = URL.createObjectURL(blob); setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
