// Full backup / restore (ZIP: data.json + photos). Restore MERGES by default – it never deletes existing data.
import JSZip from 'jszip';
import { getDB, kvGet, kvSet, notifyChange } from './db.js';
import { APP_VERSION } from './defaults.js';
import { todayYMD } from './utils.js';

const STORES = ['projects', 'reports', 'tasks'];
const KV_KEYS = ['settings', 'dailyReminder', 'activeProjectId'];

export async function createBackup(onProgress = () => {}) {
  const db = await getDB();
  const zip = new JSZip();
  const data = { app: 'target-planner-tracker', version: APP_VERSION, createdAt: new Date().toISOString(), stores: {}, kv: {} };
  for (const s of STORES) data.stores[s] = await db.getAll(s);
  for (const k of KV_KEYS) data.kv[k] = await kvGet(k);
  const photos = await db.getAll('photos');
  data.photos = [];
  let i = 0;
  for (const p of photos) {
    const { blob, thumb, ...meta } = p;
    data.photos.push(meta);
    if (blob) zip.file(`photos/${p.id}.jpg`, blob);
    if (thumb) zip.file(`thumbs/${p.id}.jpg`, thumb);
    onProgress(++i / Math.max(1, photos.length));
  }
  zip.file('data.json', JSON.stringify(data));
  zip.file('README.txt', 'Target Planner and Tracker backup. Restore it from Settings → Backup & Restore. Do not edit data.json by hand.');
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'STORE' });
  await kvSet('lastBackupAt', new Date().toISOString());
  return { blob, filename: `TargetPlanner_Backup_${todayYMD()}.zip`, counts: { projects: data.stores.projects.length, reports: data.stores.reports.length, tasks: data.stores.tasks.length, photos: photos.length } };
}

/** mode: 'merge' (keep newest version of each item) | 'replace' (wipe then restore) */
export async function restoreBackup(file, mode = 'merge', onProgress = () => {}) {
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file('data.json');
  if (!dataFile) throw new Error('This is not a Target Planner backup file (data.json missing).');
  const data = JSON.parse(await dataFile.async('string'));
  if (data.app !== 'target-planner-tracker') throw new Error('This backup belongs to a different app.');
  const db = await getDB();
  if (mode === 'replace') {
    for (const s of [...STORES, 'photos']) await db.clear(s);
  }
  const counts = { added: 0, updated: 0, skipped: 0 };
  for (const s of STORES) {
    for (const rec of data.stores[s] || []) {
      const existing = await db.get(s, rec.id);
      if (!existing) { await db.put(s, rec); counts.added++; }
      else if ((rec.updatedAt || '') > (existing.updatedAt || '')) { await db.put(s, rec); counts.updated++; }
      else counts.skipped++;
    }
  }
  const metas = data.photos || [];
  let i = 0;
  for (const meta of metas) {
    const existing = await db.get('photos', meta.id);
    if (!existing || (meta.updatedAt || '') > (existing.updatedAt || '')) {
      const pf = zip.file(`photos/${meta.id}.jpg`); const tf = zip.file(`thumbs/${meta.id}.jpg`);
      if (pf) {
        const blob = new Blob([await pf.async('uint8array')], { type: 'image/jpeg' });
        const thumb = tf ? new Blob([await tf.async('uint8array')], { type: 'image/jpeg' }) : blob;
        await db.put('photos', { ...meta, blob, thumb });
        existing ? counts.updated++ : counts.added++;
      }
    } else counts.skipped++;
    onProgress(++i / Math.max(1, metas.length));
  }
  for (const k of KV_KEYS) {
    if (data.kv?.[k] !== undefined && (mode === 'replace' || (await kvGet(k)) === undefined)) await kvSet(k, data.kv[k]);
  }
  ['projects', 'reports', 'photos', 'tasks', 'kv'].forEach(notifyChange);
  return counts;
}
