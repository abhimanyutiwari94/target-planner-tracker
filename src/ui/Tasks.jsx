import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp, activeProject } from '../store.js';
import { listTasks, put, softDelete, onDBChange, uid } from '../db.js';
import { syncReminders, requestNotificationPermission, notificationPermission, taskToICS } from '../reminders.js';
import { fmtDateTime, toLocalInput, fromLocalInput, todayYMD } from '../utils.js';
import { shareFiles, isNative } from '../platform.js';
import { Icon } from './icons.jsx';
import { Sheet, Field, Seg, Empty, toast, confirmDialog } from './kit.jsx';

const STATUSES = [{ value: 'todo', label: 'To Do' }, { value: 'doing', label: 'Doing' }, { value: 'done', label: 'Done' }];

export function Tasks({ focus }) {
  const st = useApp();
  const [tasks, setTasks] = useState([]);
  const [tab, setTab] = useState('todo');
  const [scope, setScope] = useState('all');
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const load = async () => setTasks(await listTasks());
  useEffect(() => { load(); return onDBChange((s) => { if (s.has('tasks')) load(); }); }, []);
  useEffect(() => { if (focus && tasks.length) { const t = tasks.find((x) => x.id === focus); if (t) { setTab(t.status); setEdit(t); } } }, [focus, tasks.length]);

  const project = activeProject();
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tasks.filter((t) => t.status === tab)
      .filter((t) => scope === 'all' || t.projectId === project?.id)
      .filter((t) => !term || (t.title + ' ' + (t.notes || '')).toLowerCase().includes(term))
      .sort((a, b) => {
        if (tab === 'done') return (b.completedAt || '').localeCompare(a.completedAt || '');
        const pa = { high: 0, medium: 1, low: 2 }[a.priority || 'medium'], pb = { high: 0, medium: 1, low: 2 }[b.priority || 'medium'];
        return (a.due || '9999').localeCompare(b.due || '9999') || pa - pb;
      });
  }, [tasks, tab, scope, q, project?.id]);
  const counts = { todo: tasks.filter((t) => t.status === 'todo').length, doing: tasks.filter((t) => t.status === 'doing').length, done: tasks.filter((t) => t.status === 'done').length };
  const locked = !st.license.active;

  const setStatus = async (t, status) => {
    if (locked) return;
    await put('tasks', { ...t, status, completedAt: status === 'done' ? new Date().toISOString() : null });
    syncReminders();
    if (status === 'done') toast('Task done ✔', { type: 'ok', action: { label: 'UNDO', fn: async () => { await put('tasks', { ...t }); syncReminders(); } } });
  };

  return (
    <div>
      <Seg value={tab} onChange={setTab} options={STATUSES.map((s) => ({ value: s.value, label: `${s.label} (${counts[s.value]})` }))} />
      <div class="row" style={{ margin: '10px 0' }}>
        <div class="searchbox grow"><Icon name="search" size={18} /><input placeholder="Search tasks" value={q} onInput={(e) => setQ(e.currentTarget.value)} /></div>
        <select class="input" style={{ width: 'auto' }} value={scope} onChange={(e) => setScope(e.currentTarget.value)}><option value="all">All projects</option><option value="project">This project</option></select>
      </div>
      {!locked && <button class="btn block" style={{ marginBottom: 12 }} onClick={() => setEdit({})}><Icon name="plus" /> New task</button>}
      {!filtered.length ? <Empty icon="tasks" title={tab === 'done' ? 'Nothing completed yet' : 'No tasks here'} text={tab === 'done' ? 'Finished tasks appear here.' : 'Plan your day: add tasks with due time and multiple reminders.'} /> : filtered.map((t) => {
        const overdue = t.status !== 'done' && t.due && new Date(t.due) < new Date();
        const nextRem = (t.reminders || []).filter((r) => new Date(r.at) > new Date()).sort((a, b) => a.at.localeCompare(b.at))[0];
        const proj = st.projects.find((p) => p.id === t.projectId);
        return (
          <div key={t.id} class={`task ${t.status === 'done' ? 'done' : ''}`}>
            <div class={`prio ${t.priority || 'medium'}`} />
            <button class={`chk ${t.status === 'done' ? 'on' : ''}`} aria-label="Mark done" disabled={locked} onClick={() => setStatus(t, t.status === 'done' ? 'todo' : 'done')}>{t.status === 'done' && <Icon name="check" size={16} stroke={3} />}</button>
            <div class="grow" style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => setEdit(t)}>
              <div class="bold t-title">{t.title}</div>
              {t.notes && <div class="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.notes}</div>}
              <div class="row wrap gap4" style={{ marginTop: 5 }}>
                {t.due && <span class={`chip ${overdue ? 'bad' : 'outline'}`}><Icon name="clock" size={13} /> {fmtDateTime(t.due)}</span>}
                {nextRem && <span class="chip saffron"><Icon name="bell" size={13} /> {fmtDateTime(nextRem.at)}{(t.reminders || []).length > 1 ? ` +${t.reminders.length - 1}` : ''}</span>}
                {proj && <span class="chip outline">{proj.name}</span>}
              </div>
            </div>
            {t.status === 'todo' && !locked && <button class="icon-btn sm" title="Start" onClick={() => setStatus(t, 'doing')}><Icon name="right" size={18} /></button>}
          </div>
        );
      })}
      {edit && <TaskEditor task={edit.id ? edit : null} onClose={() => setEdit(null)} />}
    </div>
  );
}

const PRESETS = [
  { label: 'In 1 hour', fn: () => new Date(Date.now() + 3600e3) },
  { label: 'Today 6 PM', fn: () => at(todayYMD(), 18) },
  { label: 'Tomorrow 9 AM', fn: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  { label: '1 hr before due', due: -60 },
  { label: '1 day before due', due: -1440 },
  { label: 'At due time', due: 0 },
];
function at(ymd, h) { const d = new Date(ymd + 'T00:00:00'); d.setHours(h, 0, 0, 0); return d; }

export function TaskEditor({ task, onClose }) {
  const st = useApp();
  const project = activeProject();
  const [t, setT] = useState(() => task ? structuredClone(task) : { title: '', notes: '', status: 'todo', priority: 'medium', due: null, projectId: project?.id || null, reminders: [] });
  const [custom, setCustom] = useState('');
  const [perm, setPerm] = useState(null);
  useEffect(() => { notificationPermission().then(setPerm); }, []);
  const locked = !st.license.active;
  const set = (patch) => setT({ ...t, ...patch });
  const addReminder = async (date) => {
    if (!date || isNaN(date)) return;
    if (date.getTime() < Date.now() - 60000) { toast('That time is already past', { type: 'bad' }); return; }
    if (t.reminders.some((r) => Math.abs(new Date(r.at) - date) < 60000)) { toast('Reminder already added'); return; }
    if (perm !== 'granted') { const p = await requestNotificationPermission(); setPerm(p); if (p !== 'granted') toast('Notifications are blocked – reminders will show inside the app only', { ms: 5000 }); }
    set({ reminders: [...t.reminders, { id: uid('rm'), at: date.toISOString(), fired: false }].sort((a, b) => a.at.localeCompare(b.at)) });
  };
  const save = async () => {
    if (!t.title.trim()) { toast('Please enter a task title', { type: 'bad' }); return; }
    const rec = { ...t, id: t.id || uid('t'), title: t.title.trim(), completedAt: t.status === 'done' ? (t.completedAt || new Date().toISOString()) : null,
      reminders: t.reminders.map((r) => ({ ...r, fired: new Date(r.at) <= new Date() ? r.fired : false })) };
    await put('tasks', rec);
    await syncReminders();
    toast(task ? 'Task updated' : 'Task added', { type: 'ok' });
    onClose();
  };
  return (
    <Sheet title={task ? 'Edit task' : 'New task'} onClose={onClose} footer={!locked && (
      <>
        {task && <button class="btn danger-soft" onClick={async () => { if (await confirmDialog({ title: 'Delete task?', message: 'It moves to Trash and can be restored.', okText: 'Delete', danger: true })) { await softDelete('tasks', task.id); await syncReminders(); onClose(); } }}><Icon name="trash" /></button>}
        <button class="btn grow" onClick={save}><Icon name="check" /> Save</button>
      </>
    )}>
      <div class="col gap12">
        <Field label="Task"><input autoFocus={!task} value={t.title} readOnly={locked} placeholder="e.g. Call RSP for scaffolding labour" onInput={(e) => set({ title: e.currentTarget.value })} /></Field>
        <Field label="Notes"><textarea rows={3} value={t.notes} readOnly={locked} onInput={(e) => set({ notes: e.currentTarget.value })} /></Field>
        <div><div class="small bold muted" style={{ marginBottom: 4 }}>Status</div><Seg value={t.status} onChange={(v) => !locked && set({ status: v })} options={STATUSES} /></div>
        <div><div class="small bold muted" style={{ marginBottom: 4 }}>Priority</div><Seg value={t.priority} onChange={(v) => !locked && set({ priority: v })} options={[{ value: 'high', label: '🔴 High' }, { value: 'medium', label: '🟡 Medium' }, { value: 'low', label: '🟢 Low' }]} /></div>
        <div class="grid2">
          <Field label="Due date & time"><input type="datetime-local" value={t.due ? toLocalInput(t.due) : ''} readOnly={locked} onInput={(e) => set({ due: fromLocalInput(e.currentTarget.value) })} /></Field>
          <Field label="Project"><select value={t.projectId || ''} disabled={locked} onChange={(e) => set({ projectId: e.currentTarget.value || null })}><option value="">General</option>{st.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
        <div class="card flat" style={{ marginBottom: 0 }}>
          <div class="card-h"><h3><Icon name="bell" size={18} /> Reminders</h3><span class="chip outline">{t.reminders.length}</span></div>
          {t.reminders.map((r) => (
            <div key={r.id} class="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <Icon name="clock" size={18} /><span class="grow">{fmtDateTime(r.at)}</span>
              {new Date(r.at) < new Date() && <span class="chip outline">past</span>}
              {!locked && <button class="icon-btn sm" onClick={() => set({ reminders: t.reminders.filter((x) => x.id !== r.id) })}><Icon name="close" size={16} /></button>}
            </div>
          ))}
          {!locked && (
            <>
              <div class="chips" style={{ margin: '10px 0' }}>
                {PRESETS.filter((p) => !p.due && p.due !== 0 || t.due).map((p) => <button key={p.label} class="chip outline" onClick={() => addReminder(p.fn ? p.fn() : new Date(new Date(t.due).getTime() + p.due * 60000))}>+ {p.label}</button>)}
              </div>
              <div class="row">
                <input class="input grow" type="datetime-local" value={custom} onInput={(e) => setCustom(e.currentTarget.value)} />
                <button class="btn sm secondary" disabled={!custom} onClick={() => { addReminder(new Date(custom)); setCustom(''); }}>Add</button>
              </div>
            </>
          )}
          <div class="tiny muted" style={{ marginTop: 8 }}>
            {perm === 'granted' ? (isNative ? 'Reminders ring even when the app is closed.' : 'Reminders notify while the app is open or running in the background. For guaranteed alarms use the Android app or “Add to calendar”.')
              : perm === 'unsupported' ? 'This browser cannot show notifications – reminders appear inside the app.' : 'Notifications permission will be asked when you add a reminder.'}
          </div>
          {task && t.reminders.length > 0 && !isNative && <button class="btn sm outline" style={{ marginTop: 8 }} onClick={() => shareFiles([{ blob: new Blob([taskToICS(t)], { type: 'text/calendar' }), filename: `${t.title.slice(0, 30).replace(/[^\w ]+/g, '') || 'task'}.ics` }], { title: 'Add to calendar' })}><Icon name="calendar" size={16} /> Add to calendar</button>}
        </div>
      </div>
    </Sheet>
  );
}
