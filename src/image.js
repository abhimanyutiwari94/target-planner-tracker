// Photo processing: smart resize + JPEG compression (great quality, small size), thumbnails, optional stamp.
export const QUALITY_PRESETS = {
  high: { label: 'High (≈400–700 KB)', maxEdge: 2048, q: 0.85 },
  balanced: { label: 'Balanced (≈200–400 KB) – recommended', maxEdge: 1600, q: 0.8 },
  saver: { label: 'Space saver (≈100–200 KB)', maxEdge: 1280, q: 0.72 },
};

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back */ }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image format cannot be read. Please use JPG or PNG.')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, q) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), type, q));
}

function drawScaled(src, maxEdge) {
  const sw = src.width, sh = src.height;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  // two-step downscale for very large photos keeps details crisp
  if (scale < 0.5) {
    const mid = document.createElement('canvas'); mid.width = Math.round(sw * 0.5); mid.height = Math.round(sh * 0.5);
    const m = mid.getContext('2d'); m.imageSmoothingQuality = 'high'; m.drawImage(src, 0, 0, mid.width, mid.height);
    ctx.drawImage(mid, 0, 0, w, h);
  } else ctx.drawImage(src, 0, 0, w, h);
  return c;
}

function stampCanvas(c, lines) {
  if (!lines.length) return;
  const ctx = c.getContext('2d');
  const fs = Math.max(14, Math.round(c.width / 48));
  ctx.font = `600 ${fs}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const pad = Math.round(fs * 0.6), lh = Math.round(fs * 1.3);
  const boxH = lines.length * lh + pad * 2;
  const boxW = Math.min(c.width, Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, c.height - boxH, boxW, boxH);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, pad, c.height - boxH + pad + i * lh));
}

export function getPosition(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}

/**
 * @param {File|Blob} file
 * @param {{preset?:string, stamp?:{date?:boolean,time?:boolean,gps?:boolean,project?:boolean}, projectName?:string, position?:object}} opts
 */
export async function processPhoto(file, opts = {}) {
  const preset = QUALITY_PRESETS[opts.preset] || QUALITY_PRESETS.balanced;
  const src = await decode(file);
  const canvas = drawScaled(src, preset.maxEdge);
  const takenAt = new Date(file.lastModified && Math.abs(Date.now() - file.lastModified) < 86400000 * 3650 ? file.lastModified : Date.now());
  const s = opts.stamp || {};
  const lines = [];
  if (s.project && opts.projectName) lines.push(opts.projectName);
  const dt = [];
  if (s.date) dt.push(takenAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
  if (s.time) dt.push(takenAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  if (dt.length) lines.push(dt.join('  '));
  if (s.gps && opts.position) lines.push(`Lat ${opts.position.lat.toFixed(6)}, Long ${opts.position.lng.toFixed(6)}`);
  stampCanvas(canvas, lines);
  const blob = await canvasToBlob(canvas, 'image/jpeg', preset.q);
  const thumbC = drawScaled(canvas, 420);
  const thumb = await canvasToBlob(thumbC, 'image/jpeg', 0.72);
  if (src.close) try { src.close(); } catch { /* ignore */ }
  return { blob, thumb, width: canvas.width, height: canvas.height, size: blob.size, takenAt: takenAt.toISOString() };
}

/** Re-encode for exports (smaller files to share on WhatsApp). Returns {data:Uint8Array, dataURL, width, height} */
export async function prepareForExport(blob, maxEdge = 1280, q = 0.75) {
  const src = await decode(blob);
  const c = drawScaled(src, maxEdge);
  const out = await canvasToBlob(c, 'image/jpeg', q);
  if (src.close) try { src.close(); } catch { /* ignore */ }
  const buf = new Uint8Array(await out.arrayBuffer());
  return { data: buf, blob: out, width: c.width, height: c.height };
}

/** Logos: keep transparency, max 600px, PNG data URL */
export async function processLogo(file) {
  const src = await decode(file);
  const scale = Math.min(1, 600 / Math.max(src.width, src.height));
  const c = document.createElement('canvas'); c.width = Math.round(src.width * scale); c.height = Math.round(src.height * scale);
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height);
  return { dataURL: c.toDataURL('image/png'), width: c.width, height: c.height };
}
