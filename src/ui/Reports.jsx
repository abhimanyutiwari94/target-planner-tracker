import { useEffect, useMemo, useState } from 'preact/hooks';
import { useApp, navigate, activeProject } from '../store.js';
import { listReports, countPhotosByReport, onDBChange, findReport } from '../db.js';
import { reportSummary } from '../calc.js';
import { todayYMD, fmtDate, parseYMD, toYMD, MONTHS, startOfMonth, addDays } from '../utils.js';
import { Icon } from './icons.jsx';
import { Sheet, Field, ToggleRow, Empty, toast } from './kit.jsx';
import { openReportFor } from './actions.js';
import { previousReport } from '../reports.js';

let lastView = 'list';
let lastMonth = null;

export function Reports() {
  const st = useApp();
  const project = activeProject();
  const [reports, setReports] = useState([]);
  const [photos, setPhotos] = useState({});
  const [month, setMonthRaw] = useState(lastMonth || startOfMonth(todayYMD()));
  const setMonth = (m) => { lastMonth = m; setMonthRaw(m); };
  const [q, setQ] = useState('');
  const [view, setViewRaw] = useState(lastView);
  const setView = (v) => { lastView = v; setViewRaw(v); };
  const [newOpen, setNewOpen] = useState(null);

  const load = async () => { if (!project) return; setReports(await listReports(project.id)); setPhotos(await countPhotosByReport(project.id)); };
  useEffect(() => { load(); return onDBChange((s) => { if (s.has('reports') || s.has('photos')) load(); }); }, [project?.id]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return reports;
    return reports.filter((r) => fmtDate(r.date).toLowerCase().includes(t) || String(r.reportNo).includes(t) || JSON.stringify(r.sections).toLowerCase().includes(t) || (r.notes || '').toLowerCase().includes(t));
  }, [reports, q]);

  const startNew = async (date) => {
    const ex = await findReport(project.id, date);
    if (ex) { navigate('report', { id: ex.id }); return; }
    if (!st.license.active) { toast('Access expired – view-only mode'); navigate('settings', { page: 'license' }); return; }
    setNewOpen(date);
  };

  return (
    <div>
      <div class="row" style={{ marginBottom: 10 }}>
        <div class="searchbox grow"><Icon name="search" size={18} /><input placeholder="Search work, location, date…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />{q && <button class="icon-btn sm" onClick={() => setQ('')}><Icon name="close" size={16} /></button>}</div>
        <button class={`icon-btn ${view === 'cal' ? '' : ''}`} style={{ background: 'var(--card)', border: '1px solid var(--line)' }} onClick={() => setView(view === 'cal' ? 'list' : 'cal')} aria-label="Toggle calendar"><Icon name={view === 'cal' ? 'file' : 'calendar'} /></button>
      </div>
      {view === 'cal' && <Calendar month={month} setMonth={setMonth} reports={reports} onPick={startNew} />}
      <button class="btn block" style={{ marginBottom: 12 }} onClick={() => startNew(todayYMD())} disabled={!st.license.active}><Icon name="plus" /> New / today's report</button>
      {!filtered.length ? (
        <Empty icon="file" title={q ? 'No matching reports' : 'No reports yet'} text={q ? 'Try another search word.' : 'Create your first daily progress report.'} />
      ) : (
        <div class="card flat" style={{ padding: '2px 12px' }}>
          {filtered.map((r) => {
            const s = reportSummary(r);
            const d = parseYMD(r.date);
            return (
              <button key={r.id} class="li" onClick={() => navigate('report', { id: r.id })}>
                <div class="ico" style={{ flexDirection: 'column', lineHeight: 1, width: 44, height: 44 }}>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{d.getDate()}</span><span class="tiny">{MONTHS[d.getMonth()]}</span>
                </div>
                <div class="grow" style={{ minWidth: 0 }}>
                  <div class="row"><span class="bold">{fmtDate(r.date)}</span>{r.status === 'final' && <span class="chip ok">Final</span>}</div>
                  <div class="small muted ellipsis">No. {r.reportNo} · {s.workCount} work · {s.manpower} manpower · {photos[r.id] || 0} photos</div>
                  {s.achieved + s.partial + s.failed > 0 && (
                    <div class="row gap4" style={{ marginTop: 4 }}>
                      <span class="chip ok">{s.achieved} ✓</span>{s.partial > 0 && <span class="chip warn">{s.partial} partial</span>}{s.failed > 0 && <span class="chip bad">{s.failed} missed</span>}
                    </div>
                  )}
                </div>
                <Icon name="right" size={18} />
              </button>
            );
          })}
        </div>
      )}
      {newOpen && <NewReportSheet date={newOpen} onClose={() => setNewOpen(null)} />}
    </div>
  );
}

function Calendar({ month, setMonth, reports, onPick }) {
  const d = parseYMD(month);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const startPad = (first.getDay() + 6) % 7;
  const start = addDays(toYMD(first), -startPad);
  const byDate = new Map(reports.map((r) => [r.date, r]));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = todayYMD();
  return (
    <div class="card">
      <div class="row between" style={{ marginBottom: 8 }}>
        <button class="icon-btn" onClick={() => setMonth(startOfMonth(addDays(month, -1)))}><Icon name="left" /></button>
        <div class="bold">{MONTHS[d.getMonth()]} {d.getFullYear()}</div>
        <button class="icon-btn" onClick={() => setMonth(startOfMonth(addDays(month, 32)))}><Icon name="right" /></button>
      </div>
      <div class="cal">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <div key={i} class="dow">{x}</div>)}
        {days.map((day) => {
          const r = byDate.get(day);
          const out = day.slice(0, 7) !== month.slice(0, 7);
          return <button key={day} class={`${out ? 'out' : ''} ${r ? (r.status === 'final' ? 'has final' : 'has') : ''} ${day === today ? 'today' : ''}`} onClick={() => onPick(day)}>{parseYMD(day).getDate()}</button>;
        })}
      </div>
      <div class="tiny muted" style={{ marginTop: 8 }}>Tap a date to open its report or create a new one. Dot = report exists.</div>
    </div>
  );
}

export function NewReportSheet({ date: initial, onClose }) {
  const project = activeProject();
  const [date, setDate] = useState(initial);
  const [prev, setPrev] = useState(undefined);
  const [o, setO] = useState({ fromTomorrow: true, carryUnfinished: true, manpowerRows: true, copyTomorrow: false, carryHindrances: true });
  useEffect(() => { previousReport(project.id, date).then(setPrev); }, [date]);
  const set = (k) => (v) => setO({ ...o, [k]: v });
  return (
    <Sheet title="New daily report" onClose={onClose} footer={<button class="btn block saffron" onClick={async () => { const r = await openReportFor(date, o); if (r) onClose(); }}><Icon name="check" /> Create report</button>}>
      <Field label="Report date"><input type="date" value={date} onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} /></Field>
      <div class="section-title">Carry forward</div>
      {prev ? <div class="small muted" style={{ marginBottom: 6 }}>From previous report: <b>{fmtDate(prev.date)}</b> (No. {prev.reportNo})</div> : prev === null ? <div class="small muted">No earlier report – you will start with a blank report.</div> : null}
      {prev && (
        <div>
          <ToggleRow title="Yesterday's “Tomorrow's targets” → Today's work" desc="Target quantity is copied; you fill today's achieved." checked={o.fromTomorrow} onChange={set('fromTomorrow')} />
          <ToggleRow title="Unfinished work items (< 100%)" desc="Keeps total completion % so progress continues." checked={o.carryUnfinished} onChange={set('carryUnfinished')} />
          <ToggleRow title="Manpower contractors list" desc="Names only – numbers start blank." checked={o.manpowerRows} onChange={set('manpowerRows')} />
          <ToggleRow title="Open hindrances / issues" checked={o.carryHindrances} onChange={set('carryHindrances')} />
          <ToggleRow title="Copy tomorrow's targets as they were" desc="Useful when the plan repeats." checked={o.copyTomorrow} onChange={set('copyTomorrow')} />
        </div>
      )}
    </Sheet>
  );
}
