// Coupon-based access. Each code adds N days (usually 30). When access expires the app becomes
// read-only: all old reports, photos, insights, exports and backups stay available; new work is locked.
import { kvGet, kvSet } from './db.js';
import { verifyCode, ALPHABET } from './license-core.js';

export const TRIAL_DAYS = 0; // set >0 to give new installs a free trial
const DAY = 86400000;

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

function randomDeviceId() {
  const b = new Uint8Array(10); crypto.getRandomValues(b);
  const s = Array.from(b, (x) => ALPHABET[x & 31]).join('');
  return `${s.slice(0, 5)}-${s.slice(5, 10)}`;
}

export async function getDeviceId() {
  let id = await kvGet('deviceId');
  let ls = null; try { ls = localStorage.getItem('tpt.deviceId'); } catch { /* ignore */ }
  if (!id && ls) { id = ls; await kvSet('deviceId', id); }
  if (!id) { id = randomDeviceId(); await kvSet('deviceId', id); }
  try { if (ls !== id) localStorage.setItem('tpt.deviceId', id); } catch { /* ignore */ }
  return id;
}

async function load() {
  const lic = (await kvGet('license')) || { expiresAt: 0, history: [], lastSeen: 0, trialUsed: false };
  // clock-rollback protection: never let "now" go below the latest time we have seen
  const now = Math.max(Date.now(), lic.lastSeen || 0);
  if (Date.now() > (lic.lastSeen || 0)) { lic.lastSeen = Date.now(); await kvSet('license', lic); }
  return { lic, now };
}

export async function getLicenseStatus() {
  const { lic, now } = await load();
  if (!lic.trialUsed && TRIAL_DAYS > 0 && !lic.history.length && !lic.expiresAt) {
    lic.expiresAt = now + TRIAL_DAYS * DAY; lic.trialUsed = true; await kvSet('license', lic);
  }
  const active = lic.expiresAt > now;
  const msLeft = Math.max(0, lic.expiresAt - now);
  return {
    active,
    everActivated: lic.history.length > 0 || lic.trialUsed,
    expiresAt: lic.expiresAt || null,
    daysLeft: active ? Math.ceil(msLeft / DAY) : 0,
    history: lic.history,
    clockWarning: Date.now() + 5 * 60000 < (lic.lastSeen || 0),
  };
}

export async function applyCode(input) {
  const deviceId = await getDeviceId();
  const res = await verifyCode(input, deviceId, hmac);
  if (!res.ok) return res;
  const { lic, now } = await load();
  const used = lic.history.find((h) => h.serial === res.serial && h.deviceBound === res.deviceBound);
  if (used) return { ok: false, reason: `This code was already used on ${new Date(used.appliedAt).toLocaleDateString('en-GB')}` };
  const base = Math.max(lic.expiresAt || 0, now);
  lic.expiresAt = base + res.days * DAY;
  lic.history.push({ code: res.code, serial: res.serial, days: res.days, deviceBound: res.deviceBound, appliedAt: new Date(now).toISOString(), validUntil: new Date(lic.expiresAt).toISOString() });
  await kvSet('license', lic);
  return { ok: true, days: res.days, expiresAt: lic.expiresAt };
}
