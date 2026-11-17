// Date & number helpers. Dates are stored as local 'YYYY-MM-DD' strings to avoid timezone shifts.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export { MONTHS, DAYS };

export const pad2 = (n) => String(n).padStart(2, '0');
export function toYMD(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function parseYMD(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
export function todayYMD() { return toYMD(new Date()); }
export function addDays(ymd, n) { const d = parseYMD(ymd); d.setDate(d.getDate() + n); return toYMD(d); }
export function diffDays(a, b) { return Math.round((parseYMD(b) - parseYMD(a)) / 86400000); }
/** 17-Nov-2026 (Tue) */
export function fmtDate(ymd, { weekday = true } = {}) {
  const d = parseYMD(ymd); if (!d) return ymd || '';
  return `${pad2(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()}${weekday ? ` (${DAYS[d.getDay()]})` : ''}`;
}
export function fmtShort(ymd) { const d = parseYMD(ymd); return d ? `${pad2(d.getDate())} ${MONTHS[d.getMonth()]}` : ''; }
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${pad2(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${h}:${pad2(d.getMinutes())} ${ap}`;
}
export function fmtTime(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${pad2(d.getMinutes())} ${ap}`;
}
/** value for <input type="datetime-local"> */
export function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date(); if (isNaN(d)) return '';
  return `${toYMD(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function fromLocalInput(v) { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); }

export function startOfWeek(ymd) { const d = parseYMD(ymd); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return toYMD(d); }
export function startOfMonth(ymd) { const d = parseYMD(ymd); return toYMD(new Date(d.getFullYear(), d.getMonth(), 1)); }
export function endOfMonth(ymd) { const d = parseYMD(ymd); return toYMD(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
export function startOfYear(ymd) { return `${ymd.slice(0, 4)}-01-01`; }
export function endOfYear(ymd) { return `${ymd.slice(0, 4)}-12-31`; }
export function daysBetween(from, to) { const out = []; let d = from; let guard = 0; while (d <= to && guard++ < 4000) { out.push(d); d = addDays(d, 1); } return out; }
export function monthLabel(ymd) { const d = parseYMD(ymd); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }

// ---------- numbers ----------
export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}
export function fmtNum(v, { dec = 2, trim = true } = {}) {
  const n = num(v); if (n === null) return '';
  let s = n.toFixed(dec);
  if (trim && s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
/** Matches the Excel style 50.00 */
export function fmtQty(v) { const n = num(v); return n === null ? '' : n.toFixed(2); }
export function fmtPct(ratio, dec = 0) { if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return ''; return `${(ratio * 100).toFixed(dec)}%`; }
export function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

export function fileSafe(s) { return String(s || 'report').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 60); }
export function bytesLabel(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
export function debounce(fn, ms) {
  let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}
export function hexToRgb(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
export function rgbToHex([r, g, b]) { return '#' + [r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase(); }
export function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); }
export function blobToDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }
export async function blobToBase64(blob) { const d = await blobToDataURL(blob); return String(d).split(',')[1]; }
export function dataURLToBlob(dataURL) {
  const [meta, b64] = dataURL.split(',');
  const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
