// Local, offline database (IndexedDB). Nothing ever leaves the phone unless the user shares/exports it.
import { openDB } from 'idb';

const DB_NAME = 'target-planner-tracker';
const DB_VERSION = 1;
let dbPromise;

export function uid(prefix = '') {
  const r = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  return prefix + r.replace(/-/g, '').slice(0, 20);
}

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('reports')) {
          const s = db.createObjectStore('reports', { keyPath: 'id' });
          s.createIndex('byProject', 'projectId');
          s.createIndex('byProjectDate', ['projectId', 'date']);
        }
        if (!db.objectStoreNames.contains('photos')) {
          const s = db.createObjectStore('photos', { keyPath: 'id' });
          s.createIndex('byReport', 'reportId');
          s.createIndex('byProject', 'projectId');
        }
        if (!db.objectStoreNames.contains('tasks')) {
          const s = db.createObjectStore('tasks', { keyPath: 'id' });
          s.createIndex('byStatus', 'status');
        }
      },
      blocked() { console.warn('DB upgrade blocked by another tab'); },
      blocking() { /* a newer version wants to open: close so it can upgrade */ dbPromise?.then((d) => d.close()); dbPromise = null; },
    });
  }
  return dbPromise;
}

// ---------- key/value ----------
export async function kvGet(key, fallback = undefined) {
  const v = await (await getDB()).get('kv', key);
  return v === undefined ? fallback : v;
}
export async function kvSet(key, value) { return (await getDB()).put('kv', value, key); }

// ---------- generic ----------
const now = () => new Date().toISOString();
export async function put(store, obj) {
  const rec = { ...obj, updatedAt: now() };
  if (!rec.createdAt) rec.createdAt = rec.updatedAt;
  await (await getDB()).put(store, rec);
  notify(store);
  return rec;
}
export async function get(store, id) { return (await getDB()).get(store, id); }
export async function all(store) { return (await getDB()).getAll(store); }
export async function hardDelete(store, id) { await (await getDB()).delete(store, id); notify(store); }

/** Soft delete → item goes to Trash (recoverable). */
export async function softDelete(store, id) {
  const rec = await get(store, id);
  if (!rec) return;
  rec.deleted = true; rec.deletedAt = now();
  await put(store, rec);
}
export async function restoreDeleted(store, id) {
  const rec = await get(store, id);
  if (!rec) return;
  delete rec.deleted; delete rec.deletedAt;
  await put(store, rec);
}

// ---------- projects ----------
export async function listProjects({ includeDeleted = false } = {}) {
  const list = await all('projects');
  return list.filter((p) => includeDeleted || !p.deleted).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

// ---------- reports ----------
export async function listReports(projectId, { includeDeleted = false } = {}) {
  const db = await getDB();
  const list = projectId ? await db.getAllFromIndex('reports', 'byProject', projectId) : await db.getAll('reports');
  return list.filter((r) => includeDeleted || !r.deleted).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}
export async function findReport(projectId, date) {
  const db = await getDB();
  const list = await db.getAllFromIndex('reports', 'byProjectDate', [projectId, date]);
  return list.find((r) => !r.deleted) || null;
}

// ---------- photos ----------
export async function listPhotos(reportId) {
  const db = await getDB();
  const list = await db.getAllFromIndex('photos', 'byReport', reportId);
  return list.filter((p) => !p.deleted).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}
export async function countPhotosByReport(projectId) {
  const db = await getDB();
  const counts = {};
  let cursor = await db.transaction('photos').store.index('byProject').openCursor(IDBKeyRange.only(projectId));
  while (cursor) {
    const p = cursor.value;
    if (!p.deleted) counts[p.reportId] = (counts[p.reportId] || 0) + 1;
    cursor = await cursor.continue();
  }
  return counts;
}

// ---------- tasks ----------
export async function listTasks({ includeDeleted = false } = {}) {
  const list = await all('tasks');
  return list.filter((t) => includeDeleted || !t.deleted);
}

// ---------- change notifications (so all screens refresh) ----------
const listeners = new Set();
export function onDBChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let pending = new Set(); let timer = null;
function notify(store) {
  pending.add(store);
  if (timer) return;
  timer = setTimeout(() => { const s = pending; pending = new Set(); timer = null; listeners.forEach((fn) => { try { fn(s); } catch (e) { console.error(e); } }); }, 30);
}
export function notifyChange(store) { notify(store); }

// ---------- storage persistence & usage ----------
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* ignore */ }
  return false;
}
export async function storageEstimate() {
  try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch { /* ignore */ }
  return null;
}
