import { useEffect, useState } from 'preact/hooks';
import { useApp, navigate, activeProject, setActiveProject, goBack, canGoBack, getState } from '../store.js';
import { Icon } from './icons.jsx';
import { DialogHost, Sheet, toast } from './kit.jsx';
import { Home } from './Home.jsx';
import { Reports } from './Reports.jsx';
import { ReportEditor } from './ReportEditor.jsx';
import { Tasks } from './Tasks.jsx';
import { Insights } from './Insights.jsx';
import { Settings } from './Settings.jsx';
import { Onboarding } from './Onboarding.jsx';
import { CaptureFlow } from './Capture.jsx';
import { onBackButton, exitApp, isNative } from '../platform.js';
import { onReminderFired, onNotificationTap } from '../reminders.js';
import { openToday } from './actions.js';

const TITLES = { home: 'Home', reports: 'Reports', tasks: 'To-Do', insights: 'Insights', settings: 'Settings', report: 'Daily Report' };

export function App() {
  const st = useApp();
  const [projOpen, setProjOpen] = useState(false);
  const [capture, setCapture] = useState(false);

  useEffect(() => {
    let lastBack = 0;
    let off = () => {};
    onBackButton(() => {
      if (canGoBack()) { goBack(); return; }
      if (Date.now() - lastBack < 2000) exitApp();
      else { lastBack = Date.now(); toast('Press back again to exit'); }
    }).then((f) => { off = f; });
    const offRem = onReminderFired((ev) => {
      if (ev.type === 'task') toast(`⏰ Reminder: ${ev.task.title}`, { action: { label: 'Open', fn: () => navigate('tasks', { focus: ev.task.id }) }, ms: 8000 });
      else toast("📝 Time to update today's report", { action: { label: 'Open', fn: () => openToday() }, ms: 8000 });
      try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch { /* ignore */ }
    });
    onNotificationTap((extra) => {
      if (extra.taskId) navigate('tasks', { focus: extra.taskId });
      else if (extra.route === 'today') openToday();
    });
    return () => { off(); offRem(); };
  }, []);

  if (!st.ready) return null;
  if (!st.onboarded || !st.projects.length) return <><Onboarding /><DialogHost /></>;

  const project = activeProject();
  const r = st.route;
  const isTab = ['home', 'reports', 'tasks', 'insights'].includes(r.name);
  let screen;
  switch (r.name) {
    case 'reports': screen = <Reports />; break;
    case 'report': screen = <ReportEditor key={r.params.id} id={r.params.id} tab={r.params.tab} />; break;
    case 'tasks': screen = <Tasks focus={r.params.focus} />; break;
    case 'insights': screen = <Insights />; break;
    case 'settings': screen = <Settings page={r.params.page} />; break;
    default: screen = <Home onCapture={() => setCapture(true)} />;
  }

  return (
    <div class="shell">
      <header class="topbar">
        {isTab ? <img class="logo" src="./icons/icon-192.png" alt="" /> : <button class="icon-btn" onClick={goBack} aria-label="Back"><Icon name="left" /></button>}
        <div class="grow" style={{ minWidth: 0 }}>
          {isTab || r.name === 'report' ? (
            <button class="proj-switch" onClick={() => setProjOpen(true)}>
              <div style={{ minWidth: 0 }}>
                <div class="title ellipsis">{project?.name || 'Select project'}</div>
                <div class="sub">{TITLES[r.name]}{st.projects.length > 1 ? ' · tap to switch project' : ''}</div>
              </div>
              <Icon name="down" size={18} />
            </button>
          ) : <div class="title">{TITLES[r.name] || ''}</div>}
        </div>
        {!st.license.active && <button class="icon-btn" onClick={() => navigate('settings', { page: 'license' })} aria-label="Locked"><Icon name="lock" /></button>}
        <button class="icon-btn" onClick={() => navigate('settings')} aria-label="Settings"><Icon name="settings" /></button>
      </header>
      <main class={`content ${isTab ? '' : 'no-nav'}`}>
        {!st.license.active && r.name !== 'settings' && (
          <button class="banner lock" style={{ width: '100%', border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => navigate('settings', { page: 'license' })}>
            <Icon name="lock" size={20} />
            <span class="grow">{st.license.everActivated ? 'Access expired – view-only mode. Old work is safe. Tap to enter a coupon code.' : 'Not activated – view-only. Tap to enter your coupon code.'}</span>
          </button>
        )}
        {st.license.active && st.license.daysLeft <= 5 && r.name === 'home' && (
          <button class="banner warn" style={{ width: '100%', border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => navigate('settings', { page: 'license' })}>
            <Icon name="key" size={20} /><span class="grow">Access ends in {st.license.daysLeft} day{st.license.daysLeft === 1 ? '' : 's'}. Add your next coupon code now – remaining days are kept.</span>
          </button>
        )}
        {screen}
      </main>
      {isTab && (
        <nav class="bottomnav">
          <NavBtn name="home" icon="home" label="Home" cur={r.name} />
          <NavBtn name="reports" icon="file" label="Reports" cur={r.name} />
          <button class="navfab" aria-label="Capture photo" onClick={() => { if (!getState().license.active) { navigate('settings', { page: 'license' }); return; } setCapture(true); }}><Icon name="camera" size={26} /></button>
          <NavBtn name="tasks" icon="tasks" label="To-Do" cur={r.name} />
          <NavBtn name="insights" icon="chart" label="Insights" cur={r.name} />
        </nav>
      )}
      {projOpen && <ProjectPicker onClose={() => setProjOpen(false)} />}
      {capture && <CaptureFlow onClose={() => setCapture(false)} />}
      <DialogHost />
    </div>
  );
}

function NavBtn({ name, icon, label, cur }) {
  return <button class={`navbtn ${cur === name ? 'active' : ''}`} onClick={() => navigate(name)}><Icon name={icon} /><span>{label}</span></button>;
}

function ProjectPicker({ onClose }) {
  const st = useApp();
  return (
    <Sheet title="Projects" onClose={onClose} footer={<button class="btn block secondary" onClick={() => { onClose(); setTimeout(() => navigate('settings', { page: 'project', id: 'new' }), 50); }}><Icon name="plus" /> New project</button>}>
      <div class="list">
        {st.projects.map((p) => (
          <button key={p.id} class="li" onClick={async () => { await setActiveProject(p.id); onClose(); }}>
            <div class="ico" style={p.id === st.activeProjectId ? { background: 'var(--brand)', color: '#fff' } : null}><Icon name="folder" /></div>
            <div class="grow">
              <div class="bold ellipsis">{p.name}</div>
              <div class="small muted ellipsis">{[p.info?.client, p.info?.location].filter(Boolean).join(' · ') || 'Tap to open'}</div>
            </div>
            {p.id === st.activeProjectId && <span class="chip ok">Active</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
export { isNative };
