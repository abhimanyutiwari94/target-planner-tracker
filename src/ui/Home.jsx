import { useEffect, useState } from 'preact/hooks';
import { useApp, navigate, activeProject } from '../store.js';
import { listReports, listTasks, kvGet, countPhotosByReport, onDBChange } from '../db.js';
import { analyze, reportSummary } from '../calc.js';
import { todayYMD, fmtDate, startOfWeek, addDays, fmtShort, fmtPct, fmtDateTime, diffDays } from '../utils.js';
import { Icon } from './icons.jsx';
import { openToday } from './actions.js';
import { TaskEditor } from './Tasks.jsx';

export function Home({ onCapture }) {
  const st = useApp();
  const project = activeProject();
  const [data, setData] = useState(null);
  const [newTask, setNewTask] = useState(false);

  const load = async () => {
    if (!project) return;
    const reports = await listReports(project.id);
    const tasks = await listTasks();
    const photoCounts = await countPhotosByReport(project.id);
    const today = todayYMD();
    const week = analyze(reports, { from: startOfWeek(today), to: addDays(startOfWeek(today), 6), by: 'day', photoCounts });
    const todayR = reports.find((r) => r.date === today) || null;
    const lastBackup = await kvGet('lastBackupAt');
    const open = tasks.filter((t) => t.status !== 'done');
    const now = Date.now();
    const prio = { high: 0, medium: 1, low: 2 };
    const dueSoon = [...open].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || prio[a.priority || 'medium'] - prio[b.priority || 'medium']).slice(0, 4);
    const overdue = open.filter((t) => t.due && new Date(t.due).getTime() < now).length;
    // streak of consecutive days with a report (ending today or yesterday)
    const dates = new Set(reports.map((r) => r.date));
    let streak = 0; let d = dates.has(today) ? today : addDays(today, -1);
    while (dates.has(d) && streak < 999) { streak++; d = addDays(d, -1); }
    setData({ reports, todayR, todaySum: todayR ? reportSummary(todayR) : null, todayPhotos: todayR ? photoCounts[todayR.id] || 0 : 0, week, lastBackup, open: open.length, dueSoon, overdue, streak });
  };
  useEffect(() => { load(); return onDBChange(() => load()); }, [project?.id]);

  if (!project || !data) return null;
  const today = todayYMD();
  const backupDays = data.lastBackup ? diffDays(data.lastBackup.slice(0, 10), today) : null;
  const locked = !st.license.active;

  return (
    <div>
      <div class="card hero">
        <div class="row between" style={{ position: 'relative', zIndex: 1 }}>
          <div>
            <div class="small muted">{fmtDate(today)}</div>
            <h2 style={{ fontSize: 20, marginTop: 2 }}>{greeting()}</h2>
          </div>
          {data.streak > 0 && <div class="chip saffron" title="Days in a row with a report">🔥 {data.streak} day streak</div>}
        </div>
        <div style={{ marginTop: 14, position: 'relative', zIndex: 1 }}>
          {data.todayR ? (
            <div class="row wrap gap12">
              <Stat v={data.todaySum.workCount} l="Work items" /><Stat v={data.todaySum.manpower} l="Manpower" /><Stat v={data.todayPhotos} l="Photos" /><Stat v={data.todaySum.tomorrowCount} l="Tmrw targets" />
            </div>
          ) : <div class="small muted">Today's report is not started yet. Yesterday's "Tomorrow's targets" will be carried forward automatically.</div>}
        </div>
        <button class="btn saffron block" style={{ marginTop: 14, position: 'relative', zIndex: 1 }} onClick={openToday} disabled={locked && !data.todayR}>
          <Icon name={data.todayR ? 'edit' : 'plus'} /> {data.todayR ? "Continue today's report" : "Start today's report"}
        </button>
      </div>

      <div class="quick" style={{ marginBottom: 12 }}>
        <button class="qbtn" onClick={onCapture} disabled={locked}><span class="qi" style={{ background: 'var(--saffron-soft)', color: '#E2621B' }}><Icon name="camera" /></span>Photo</button>
        <button class="qbtn" onClick={() => setNewTask(true)} disabled={locked}><span class="qi" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}><Icon name="tasks" /></span>Add task</button>
        <button class="qbtn" onClick={() => data.todayR ? navigate('report', { id: data.todayR.id, tab: 'share' }) : openToday()}><span class="qi" style={{ background: '#E7F8EE', color: '#128C7E' }}><Icon name="share" /></span>Share</button>
        <button class="qbtn" onClick={() => navigate('insights')}><span class="qi" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}><Icon name="chart" /></span>Insights</button>
      </div>

      {backupDays === null && data.reports.length >= 3 || backupDays > 7 ? (
        <button class="banner info" style={{ width: '100%', border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => navigate('settings', { page: 'backup' })}>
          <Icon name="cloud" size={20} /><span class="grow">{backupDays === null ? 'Protect your data: create your first backup (save it to Google Drive / WhatsApp yourself).' : `Last backup was ${backupDays} days ago. Tap to back up now.`}</span>
        </button>
      ) : null}

      <div class="section-title">This week</div>
      <div class="kpis">
        <Kpi v={`${data.week.reportDays}/7`} l="Reports filed" />
        <Kpi v={Math.round(data.week.avgManpower)} l="Avg manpower / day" />
        <Kpi v={data.week.targets.success == null ? '–' : fmtPct(data.week.targets.success)} l="Targets achieved" />
        <Kpi v={data.week.photos} l="Site photos" />
      </div>

      <div class="section-title row between"><span>To-Do</span><button class="chip" onClick={() => navigate('tasks')}>{data.open} open{data.overdue ? ` · ${data.overdue} overdue` : ''}</button></div>
      <div class="card flat" style={{ padding: '4px 12px' }}>
        {data.dueSoon.length ? data.dueSoon.map((t) => (
          <button key={t.id} class="li" onClick={() => navigate('tasks', { focus: t.id })}>
            <div class={`prio ${t.priority || 'medium'}`} style={{ height: 30 }} />
            <div class="grow"><div class="bold ellipsis">{t.title}</div>{t.due ? <div class={`small ${new Date(t.due) < new Date() ? '' : 'muted'}`} style={new Date(t.due) < new Date() ? { color: 'var(--bad)' } : null}>{new Date(t.due) < new Date() ? 'Overdue · ' : 'Due '}{fmtDateTime(t.due)}</div> : <div class="small muted">{t.status === 'doing' ? 'In progress' : 'No due date'}</div>}</div>
            {(t.reminders || []).length > 0 && <Icon name="bell" size={18} />}
          </button>
        )) : <div class="small muted" style={{ padding: '12px 0' }}>No open tasks. Tap “Add task” to plan your day.</div>}
      </div>

      <div class="section-title row between"><span>Recent reports</span><button class="chip" onClick={() => navigate('reports')}>All</button></div>
      <div class="card flat" style={{ padding: '4px 12px' }}>
        {data.reports.slice(0, 4).map((r) => {
          const s = reportSummary(r);
          return (
            <button key={r.id} class="li" onClick={() => navigate('report', { id: r.id })}>
              <div class="ico"><span class="bold small">{fmtShort(r.date).split(' ')[0]}</span></div>
              <div class="grow"><div class="bold">{fmtDate(r.date)}</div><div class="small muted">Report No. {r.reportNo} · {s.workCount} items · {s.manpower} manpower</div></div>
              <Icon name="right" size={18} />
            </button>
          );
        })}
        {!data.reports.length && <div class="small muted" style={{ padding: '12px 0' }}>No reports yet.</div>}
      </div>
      {newTask && <TaskEditor onClose={() => setNewTask(false)} />}
    </div>
  );
}
function Stat({ v, l }) { return <div style={{ minWidth: 64 }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div class="tiny muted">{l}</div></div>; }
function Kpi({ v, l }) { return <div class="kpi"><div class="v">{v}</div><div class="l">{l}</div></div>; }
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning 🙏' : h < 17 ? 'Good afternoon 🙏' : 'Good evening 🙏'; }
