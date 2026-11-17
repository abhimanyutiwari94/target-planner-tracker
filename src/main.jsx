import { render } from 'preact';
import './styles.css';
import { App } from './ui/App.jsx';
import { loadState } from './store.js';
import { requestPersistence } from './db.js';
import { syncReminders } from './reminders.js';
import { isNative } from './platform.js';

function showFatal(err) {
  console.error(err);
  const el = document.getElementById('app');
  el.innerHTML = `<div style="padding:24px;font-family:system-ui;max-width:520px;margin:40px auto">
    <h2 style="color:#0B3C6E">Something went wrong</h2>
    <p>Your data is safe on this phone. Please close and reopen the app.</p>
    <pre style="white-space:pre-wrap;background:#f4f4f4;padding:10px;border-radius:8px;font-size:12px">${String(err && (err.stack || err.message || err)).replace(/</g, '&lt;').slice(0, 800)}</pre>
    <button onclick="location.reload()" style="padding:12px 18px;border:0;border-radius:10px;background:#0B3C6E;color:#fff;font-weight:700">Reload</button></div>`;
}

async function boot() {
  try {
    await loadState();
    render(<App />, document.getElementById('app'));
    requestPersistence();
    syncReminders();
    if (!isNative && 'serviceWorker' in navigator && import.meta.env.PROD) {
      const { registerSW } = await import('virtual:pwa-register');
      const update = registerSW({
        onNeedRefresh() {
          const bar = document.createElement('div');
          bar.className = 'toast';
          bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom));z-index:999';
          bar.innerHTML = '<span>New version available</span><button>UPDATE</button>';
          bar.querySelector('button').onclick = () => update(true);
          document.body.appendChild(bar);
        },
      });
    }
  } catch (e) { showFatal(e); }
}
window.addEventListener('unhandledrejection', (e) => console.warn('Unhandled', e.reason));
boot();
