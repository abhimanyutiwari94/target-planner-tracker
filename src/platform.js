// Platform layer: the same code runs as an installable web app (PWA) and as an Android APK (Capacitor).
import { Capacitor } from '@capacitor/core';
import { blobToBase64 } from './utils.js';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'web' | 'android' | 'ios'

export const MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip',
  jpg: 'image/jpeg',
  ics: 'text/calendar',
  json: 'application/json',
};

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

async function writeNative(blob, filename, directory = 'CACHE') {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const data = await blobToBase64(blob);
  const res = await Filesystem.writeFile({ path: `TargetPlanner/${filename}`, data, directory: Directory[directory === 'DOCUMENTS' ? 'Documents' : 'Cache'], recursive: true });
  return res.uri;
}

/**
 * Share one or more files (WhatsApp, Gmail, Drive…). Falls back to download on desktop browsers.
 * @returns {'shared'|'downloaded'|'cancelled'}
 */
export async function shareFiles(files, { title = 'Share', text = '' } = {}) {
  // files: [{blob, filename}]
  if (isNative) {
    const { Share } = await import('@capacitor/share');
    const uris = [];
    for (const f of files) uris.push(await writeNative(f.blob, f.filename));
    try {
      await Share.share({ title, text: text || undefined, files: uris, dialogTitle: title });
      return 'shared';
    } catch (e) {
      if (/cancel/i.test(String(e?.message || e))) return 'cancelled';
      throw e;
    }
  }
  const fileObjs = files.map((f) => new File([f.blob], f.filename, { type: f.blob.type || 'application/octet-stream' }));
  if (navigator.canShare && navigator.share) {
    let can = false; try { can = navigator.canShare({ files: fileObjs }); } catch { can = false; }
    if (can) {
      try { await navigator.share({ files: fileObjs, title, text: text || undefined }); return 'shared'; } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        // NotAllowedError etc. → fall through to download
      }
    }
  }
  for (const f of files) downloadBlob(f.blob, f.filename);
  return 'downloaded';
}

/** Save a file to the phone (Documents/TargetPlanner on Android; Downloads on web). */
export async function saveFile(blob, filename) {
  if (isNative) {
    try { const uri = await writeNative(blob, filename, 'DOCUMENTS'); return { ok: true, where: 'Documents/TargetPlanner', uri }; } catch (e) {
      // Some Android versions block public folders – share instead so the user can pick "Save to Files/Drive".
      const r = await shareFiles([{ blob, filename }], { title: 'Save file' });
      return { ok: r !== 'cancelled', where: 'share sheet' };
    }
  }
  downloadBlob(blob, filename);
  return { ok: true, where: 'Downloads' };
}

export async function shareText(text, { title = 'Share' } = {}) {
  if (isNative) {
    const { Share } = await import('@capacitor/share');
    try { await Share.share({ title, text, dialogTitle: title }); return 'shared'; } catch { return 'cancelled'; }
  }
  if (navigator.share) { try { await navigator.share({ title, text }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; } }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'shared';
}

export function openWhatsAppText(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

// ---------- Android hardware back button ----------
export async function onBackButton(handler) {
  if (!isNative) return () => {};
  const { App } = await import('@capacitor/app');
  const sub = await App.addListener('backButton', handler);
  return () => sub.remove();
}
export async function exitApp() {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  App.exitApp();
}
