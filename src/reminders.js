// Reminders for to-do tasks (multiple per task) + optional daily "fill today's report" reminder.
// Android APK: real system alarms (fire even when the app is closed).
// Web app: fires while the app is open/in background + shows missed reminders on next open.
import { isNative } from './platform.js';
import { listTasks, put, kvGet, kvSet } from './db.js';
import { todayYMD } from './utils.js';

const CHANNEL = 'tpt-reminders';
const DAILY_BASE = 900000;
const listeners = new Set();
export function onReminderFired(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function hashId(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 800000 + 1; // 1..800000 (daily reminders use 900000+)
}

let LN = null;
async function ln() { if (!LN) LN = (await import('@capacitor/local-notifications')).LocalNotifications; return LN; }

export async function notificationPermission() {
  if (isNative) { try { const p = await (await ln()).checkPermissions(); return p.display; } catch { return 'denied'; } }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}
export async function requestNotificationPermission() {
  if (isNative) {
    const L = await ln();
    const p = await L.requestPermissions();
    try { await L.createChannel({ id: CHANNEL, name: 'Reminders', description: 'Task and daily report reminders', importance: 5, visibility: 1, vibration: true }); } catch { /* ignore */ }
    return p.display;
  }
  if (!('Notification' in window)) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}
export async function exactAlarmStatus() {
  if (!isNative) return null;
  try { const L = await ln(); if (L.checkExactNotificationSetting) return (await L.checkExactNotificationSetting()).exact_alarm; } catch { /* ignore */ }
  return null;
}
export async function openExactAlarmSetting() {
  try { const L = await ln(); if (L.changeExactNotificationSetting) await L.changeExactNotificationSetting(); } catch { /* ignore */ }
}

/** Re-schedule every pending reminder. Call after any task change. */
export async function syncReminders() {
  const tasks = await listTasks();
  const nowMs = Date.now();
  const daily = await kvGet('dailyReminder', { enabled: false, time: '18:00', days: [1, 2, 3, 4, 5, 6] });
  if (!isNative) { scheduleWebTimers(tasks, daily); return; }
  try {
    const L = await ln();
    const perm = await L.checkPermissions();
    if (perm.display !== 'granted') return;
    try { await L.createChannel({ id: CHANNEL, name: 'Reminders', description: 'Task and daily report reminders', importance: 5, visibility: 1, vibration: true }); } catch { /* exists */ }
    const pending = await L.getPending();
    if (pending.notifications.length) await L.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    const list = [];
    for (const t of tasks) {
      if (t.status === 'done') continue;
      for (const r of t.reminders || []) {
        const at = new Date(r.at).getTime();
        if (!(at > nowMs)) continue;
        list.push({ id: hashId(t.id + r.id), title: `⏰ ${t.title}`, body: t.notes ? t.notes.slice(0, 120) : (t.due ? 'Due ' + new Date(t.due).toLocaleString() : 'Task reminder'),
          schedule: { at: new Date(at), allowWhileIdle: true }, channelId: CHANNEL, extra: { taskId: t.id } });
      }
    }
    if (daily.enabled) {
      const [hh, mm] = (daily.time || '18:00').split(':').map(Number);
      for (const d of daily.days || []) { // d: 0=Sun..6=Sat ; Capacitor weekday: 1=Sun..7=Sat
        list.push({ id: DAILY_BASE + d, title: '📝 Daily progress report', body: "Time to update today's work, tomorrow's targets, manpower & photos.",
          schedule: { on: { weekday: d + 1, hour: hh, minute: mm }, allowWhileIdle: true }, channelId: CHANNEL, extra: { route: 'today' } });
      }
    }
    if (list.length) await L.schedule({ notifications: list.slice(0, 450) });
  } catch (e) { console.warn('Reminder scheduling failed', e); }
}

// ---------- web timers ----------
let webTimer = null;
function scheduleWebTimers() {
  if (webTimer) return;
  webTimer = setInterval(checkDue, 20000);
  setTimeout(checkDue, 1500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDue(); });
}

async function showWebNotification(title, body, data) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      const opts = { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: data?.tag, data, vibrate: [200, 100, 200], requireInteraction: true };
      if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
    }
  } catch (e) { console.warn(e); }
}

let checking = false;
export async function checkDue() {
  if (isNative || checking) return;
  checking = true;
  try {
    const tasks = await listTasks();
    const nowMs = Date.now();
    for (const t of tasks) {
      if (t.status === 'done') continue;
      let changed = false;
      for (const r of t.reminders || []) {
        const at = new Date(r.at).getTime();
        if (!r.fired && at <= nowMs) {
          r.fired = true; changed = true;
          const late = nowMs - at > 10 * 60000;
          await showWebNotification(`⏰ ${t.title}`, t.notes || 'Task reminder', { taskId: t.id, tag: t.id + r.id });
          listeners.forEach((fn) => fn({ type: 'task', task: t, reminder: r, late }));
        }
      }
      if (changed) await put('tasks', t);
    }
    const daily = await kvGet('dailyReminder', { enabled: false, time: '18:00', days: [1, 2, 3, 4, 5, 6] });
    if (daily.enabled) {
      const now = new Date();
      const [hh, mm] = (daily.time || '18:00').split(':').map(Number);
      const today = todayYMD();
      const last = await kvGet('dailyReminderLast', '');
      if (last !== today && (daily.days || []).includes(now.getDay()) && (now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm))) {
        await kvSet('dailyReminderLast', today);
        await showWebNotification('📝 Daily progress report', "Time to update today's work, tomorrow's targets, manpower & photos.", { route: 'today', tag: 'daily' });
        listeners.forEach((fn) => fn({ type: 'daily' }));
      }
    }
  } finally { checking = false; }
}

/** Native: route user when a notification is tapped */
export async function onNotificationTap(handler) {
  if (!isNative) {
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'notification-click') handler(e.data.data || {}); });
    return;
  }
  const L = await ln();
  L.addListener('localNotificationActionPerformed', (ev) => handler(ev.notification?.extra || {}));
}

// ---------- calendar export (.ics) – works with Google Calendar alarms ----------
export function taskToICS(task) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = task.due || (task.reminders?.[0]?.at) || new Date().toISOString();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Target Planner and Tracker//EN', 'BEGIN:VEVENT',
    `UID:${task.id}@target-planner`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(new Date(new Date(start).getTime() + 30 * 60000))}`,
    `SUMMARY:${esc(task.title)}`, `DESCRIPTION:${esc(task.notes)}`];
  for (const r of task.reminders || []) {
    const mins = Math.round((new Date(start) - new Date(r.at)) / 60000);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(task.title)}`, `TRIGGER:${mins >= 0 ? '-' : ''}PT${Math.abs(mins)}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}
