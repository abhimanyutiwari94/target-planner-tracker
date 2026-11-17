// Global app state + navigation (with proper Android/browser back-button behaviour).
import { useEffect, useState } from 'preact/hooks';
import { listProjects, kvGet, kvSet, onDBChange } from './db.js';
import { getLicenseStatus } from './license.js';

export const DEFAULT_SETTINGS = {
  theme: 'auto',
  photoPreset: 'balanced',
  stamp: { date: false, time: false, gps: false, project: false },
  saveGps: false,
  exportSize: 'compact',
  defaultExport: 'pdf',
  confirmBeforeDelete: true,
};

const state = {
  ready: false,
  projects: [],
  activeProjectId: null,
  license: { active: false, daysLeft: 0, history: [] },
  settings: { ...DEFAULT_SETTINGS },
  route: { name: 'home', params: {} },
  onboarded: false,
};
const subs = new Set();
function emit() { subs.forEach((f) => f()); }
export function getState() { return state; }

export function useApp() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  return state;
}

export async function loadState() {
  state.projects = await listProjects();
  const savedActive = await kvGet('activeProjectId');
  state.activeProjectId = state.projects.find((p) => p.id === savedActive)?.id || state.projects[0]?.id || null;
  state.settings = { ...DEFAULT_SETTINGS, ...((await kvGet('settings')) || {}), stamp: { ...DEFAULT_SETTINGS.stamp, ...(((await kvGet('settings')) || {}).stamp || {}) } };
  state.license = await getLicenseStatus();
  state.onboarded = !!(await kvGet('onboarded'));
  applyTheme();
  state.ready = true;
  emit();
}

onDBChange(async (stores) => {
  if (stores.has('projects')) {
    state.projects = await listProjects();
    if (!state.projects.find((p) => p.id === state.activeProjectId)) state.activeProjectId = state.projects[0]?.id || null;
  }
  if (stores.has('kv')) {
    state.settings = { ...DEFAULT_SETTINGS, ...((await kvGet('settings')) || {}) };
    applyTheme();
  }
  emit();
});

export async function refreshLicense() { state.license = await getLicenseStatus(); emit(); }
export function activeProject() { return state.projects.find((p) => p.id === state.activeProjectId) || null; }
export async function setActiveProject(id) { state.activeProjectId = id; await kvSet('activeProjectId', id); emit(); }
export async function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await kvSet('settings', state.settings);
  applyTheme(); emit();
}
export async function setOnboarded() { state.onboarded = true; await kvSet('onboarded', true); emit(); }
export const canEdit = () => !!state.license.active;

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
mq?.addEventListener?.('change', () => applyTheme());
export function applyTheme() {
  const t = state.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && mq?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0F1A2C' : '#0B3C6E');
}

// ------------------ navigation ------------------
const stack = [{ name: 'home', params: {} }];
const overlays = [];
let ignorePops = 0;
const TABS = ['home', 'reports', 'tasks', 'insights'];

export function navigate(name, params = {}) {
  if (TABS.includes(name)) {
    // tabs replace the stack (keeps back-button behaviour natural)
    const wasDeep = stack.length > 1;
    stack.length = 0; stack.push({ name, params });
    if (wasDeep) history.replaceState({ d: 1 }, ''); else history.replaceState({ d: 1 }, '');
  } else {
    stack.push({ name, params });
    history.pushState({ d: stack.length }, '');
  }
  state.route = stack[stack.length - 1];
  window.scrollTo(0, 0);
  emit();
}
export function goBack() {
  if (overlays.length || stack.length > 1) history.back();
  else if (state.route.name !== 'home') navigate('home');
}
export function canGoBack() { return overlays.length > 0 || stack.length > 1 || state.route.name !== 'home'; }

/** Register an open sheet/dialog so the back button closes it. Returns a function to call when closed from the UI. */
export function pushOverlay(close) {
  const entry = { close };
  overlays.push(entry);
  history.pushState({ o: overlays.length }, '');
  return () => {
    const i = overlays.indexOf(entry);
    if (i >= 0) { overlays.splice(i, 1); ignorePops++; history.back(); }
  };
}

if (typeof window !== 'undefined') {
  history.replaceState({ d: 1 }, '');
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops--; return; }
    if (overlays.length) { const o = overlays.pop(); o.close(); return; }
    if (stack.length > 1) { stack.pop(); state.route = stack[stack.length - 1]; emit(); return; }
    if (state.route.name !== 'home') { stack.length = 0; stack.push({ name: 'home', params: {} }); state.route = stack[0]; history.pushState({ d: 1 }, ''); emit(); }
  });
}
