import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp, navigate, goBack } from '../store.js';
import { get, put, softDelete, listPhotos, onDBChange, findReport } from '../db.js';
import { SECTION_DEFS, sectionColumns, WEATHER_OPTIONS, UNIT_SUGGESTIONS } from '../defaults.js';
import { cellValue, colorFor, qualityChecks, manpowerTotals } from '../calc.js';
import { fmtDate, fmtPct, fmtNum, num, debounce, addDays } from '../utils.js';
import { collectSuggestions, newRow, templateOf, duplicateReport } from '../reports.js';
import { Icon, FileBadge } from './icons.jsx';
import { Field, toast, confirmDialog, useBusy } from './kit.jsx';
import { PhotosPanel } from './Photos.jsx';
import { ReportPreview } from './Preview.jsx';
import { exportReport, whatsappSummary, EXPORT_SIZES } from '../export/index.js';
import { shareFiles, shareText, saveFile, isNative } from '../platform.js';

export function ReportEditor({ id, tab: initialTab }) {
  const st = useApp();
  const [rep, setRep] = useState(null);
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState(initialTab || 'work');
  const [saveState, setSaveState] = useState('saved');
  const [sugg, setSugg] = useState({ memory: {} });
  const [photoCount, setPhotoCount] = useState(0);
  const repRef = useRef(null);
  const pendingRef = useRef(false);

  const saver = useMemo(() => {
    const d = debounce(async (r) => {
      if (!pendingRef.current) return;
      pendingRef.current = false;
      try { await put('reports', r); setSaveState('saved'); } catch (e) { pendingRef.current = true; setSaveState('error'); toast('Could not save! ' + e.message, { type: 'bad', ms: 6000 }); }
    }, 350);
    return d;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await get('reports', id);
      if (!alive) return;
      if (!r) { toast('Report not found'); goBack(); return; }
      const p = await get('projects', r.projectId);
      repRef.current = r; setRep(r); setProject(p);
      setSugg(await collectSuggestions(r.projectId));
      setPhotoCount((await listPhotos(r.id)).length);
    })();
    const off = onDBChange(async (s) => {
      if (s.has('projects') && repRef.current) setProject(await get('projects', repRef.current.projectId));
      if (s.has('photos') && repRef.current) setPhotoCount((await listPhotos(repRef.current.id)).length);
    });
    const flush = () => { if (repRef.current && saver) saver.flush(repRef.current); };
    const vis = () => { if (document.hidden) flush(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', flush);
    return () => { alive = false; off(); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', flush); flush(); };
  }, [id]);

  if (!rep || !project) return <div class="center" style={{ padding: 40 }}><div class="spinner" style={{ margin: 'auto' }} /></div>;
  const tpl = templateOf(project);
  const licensed = st.license.active;
  const locked = !licensed || rep.status === 'final';

  const update = (fn) => {
    if (locked) return;
    const next = structuredClone(repRef.current);
    fn(next);
    repRef.current = next; setRep(next);
    setSaveState('saving'); pendingRef.current = true;
    saver(next);
  };

  const sections = tpl.sections.filter((s) => s.enabled);
  const tabs = [
    { key: 'info', label: 'Info' },
    ...sections.map((s) => ({ key: s.key, label: shortTitle(s), count: (rep.sections[s.key] || []).length })),
    ...(tpl.photos.enabled ? [{ key: 'photos', label: 'Photos', count: photoCount }] : []),
    ...(tpl.notes.enabled ? [{ key: 'notes', label: 'Notes' }] : []),
    { key: 'preview', label: 'Preview' },
    { key: 'share', label: 'Share / Export' },
  ];
  const curTab = tabs.find((t) => t.key === tab) ? tab : 'info';
  const curSec = sections.find((s) => s.key === curTab);

  return (
    <div>
      <div class="editor-top">
        <div class="row between" style={{ marginBottom: 6 }}>
          <div>
            <div class="bold">{fmtDate(rep.date)}</div>
            <div class="tiny muted">Report No. {rep.reportNo}{rep.status === 'final' ? ' · Final (locked)' : ''}</div>
          </div>
          <span class={`saved ${saveState === 'saving' ? 'saving' : ''}`}>{saveState === 'saving' ? <><span class="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Saving</> : saveState === 'error' ? <span style={{ color: 'var(--bad)' }}>Not saved!</span> : <><Icon name="check" size={14} /> Saved</>}</span>
        </div>
        <div class="tabs">
          {tabs.map((t) => <button key={t.key} class={`tab ${curTab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>{t.label}{t.count != null && <span class="cnt">{t.count}</span>}</button>)}
        </div>
      </div>

      {rep.status === 'final' && licensed && (
        <div class="banner info"><Icon name="lock" size={18} /><span class="grow">Marked as final. Editing is locked to protect data.</span><button class="btn sm secondary" onClick={() => { const n = { ...repRef.current, status: 'draft' }; repRef.current = n; setRep(n); put('reports', n); }}>Unlock</button></div>
      )}

      {curTab === 'info' && <InfoTab rep={rep} project={project} tpl={tpl} update={update} locked={locked} licensed={licensed} setRep={(n) => { repRef.current = n; setRep(n); }} />}
      {curSec && <SectionEditor key={curSec.key} tplSec={curSec} project={project} rep={rep} update={update} locked={locked} sugg={sugg} tpl={tpl} />}
      {curTab === 'photos' && <PhotosPanel report={rep} project={project} locked={locked} suggestions={(rep.sections.work || []).map((r) => r.particular).filter(Boolean)} />}
      {curTab === 'notes' && (
        <div class="card">
          <Field label={tpl.notes.title}><textarea rows={8} readOnly={locked} value={rep.notes || ''} placeholder="Any additional notes, instructions, visitors, safety observations…" onInput={(e) => { const v = e.currentTarget.value; update((r) => { r.notes = v; }); }} /></Field>
        </div>
      )}
      {curTab === 'preview' && <PreviewTab project={project} rep={rep} />}
      {curTab === 'share' && <SharePanel project={project} rep={rep} tpl={tpl} photoCount={photoCount} flush={() => saver.flush(repRef.current)} />}

      {!['preview', 'share'].includes(curTab) && (
        <div class="savebar">
          <button class="btn outline sm" onClick={() => setTab('preview')}><Icon name="eye" size={18} /> Preview</button>
          <div class="grow" />
          <button class="btn saffron sm" onClick={() => { saver.flush(repRef.current); setTab('share'); }}><Icon name="share" size={18} /> Share report</button>
        </div>
      )}
    </div>
  );
}

function shortTitle(s) {
  const map = { work: "Today's Work", tomorrow: "Tomorrow", manpower: 'Manpower', materialIn: 'Material In', materialReq: 'Material Req.', hindrances: 'Hindrances' };
  const t = s.title || '';
  return t.length <= 14 ? titleCase(t) : map[s.key];
}
function titleCase(t) { return t.toLowerCase().replace(/(^|\s|\/)\S/g, (m) => m.toUpperCase()); }

// ------------------------------------------------------------------ Info tab
function InfoTab({ rep, project, tpl, update, locked, licensed, setRep }) {
  const [busy, setBusy] = useState(false);
  const header = tpl.header.filter((h) => h.enabled);
  const changeDate = async (d) => {
    if (!d || d === rep.date) return;
    const ex = await findReport(project.id, d);
    if (ex && ex.id !== rep.id) { toast('A report already exists for ' + fmtDate(d), { type: 'bad' }); return; }
    update((r) => { r.date = d; });
  };
  return (
    <div>
      <div class="card">
        <div class="grid2">
          <Field label="Report date"><input type="date" value={rep.date} disabled={locked} onChange={(e) => changeDate(e.currentTarget.value)} /></Field>
          <Field label={header.find((h) => h.key === 'reportNo')?.label || 'Report No.'}><input inputMode="numeric" value={rep.reportNo ?? ''} readOnly={locked} onInput={(e) => { const v = e.currentTarget.value; update((r) => { r.reportNo = v; }); }} /></Field>
          <Field label={header.find((h) => h.key === 'weather')?.label || 'Weather'} class="span2">
            <input list="weather-list" value={rep.weather || ''} readOnly={locked} placeholder="e.g. Sunny Day" onInput={(e) => { const v = e.currentTarget.value; update((r) => { r.weather = v; }); }} />
          </Field>
          <Field label={header.find((h) => h.key === 'updatedBy')?.label || 'Updated By'} class="span2"><input value={rep.updatedBy || ''} readOnly={locked} onInput={(e) => { const v = e.currentTarget.value; update((r) => { r.updatedBy = v; }); }} /></Field>
        </div>
        <datalist id="weather-list">{WEATHER_OPTIONS.map((w) => <option key={w} value={w} />)}</datalist>
        <div class="chips" style={{ marginTop: 10 }}>{WEATHER_OPTIONS.slice(0, 6).map((w) => <button key={w} class={`chip ${rep.weather === w ? 'active' : 'outline'}`} disabled={locked} onClick={() => update((r) => { r.weather = w; })}>{w}</button>)}</div>
      </div>
      <div class="card">
        <div class="card-h"><h3>Project details (from project settings)</h3><button class="chip" onClick={() => navigate('settings', { page: 'project', id: project.id })}>Edit</button></div>
        {header.filter((h) => h.scope === 'project').map((h) => (
          <div key={h.key} class="row between" style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}><span class="small muted bold">{h.label}</span><span class="small right ellipsis" style={{ maxWidth: '62%' }}>{h.key === 'project' ? (project.info?.project || project.name) : (project.info?.[h.key] || '—')}</span></div>
        ))}
      </div>
      <div class="card">
        <div class="card-h"><h3>Report status</h3></div>
        <div class="row">
          <div class="grow small muted">Mark as <b>Final</b> after sharing with the client. Final reports are locked against accidental edits.</div>
          <button class={`btn sm ${rep.status === 'final' ? 'secondary' : 'ok'}`} disabled={!licensed} onClick={() => { const n = { ...rep, status: rep.status === 'final' ? 'draft' : 'final' }; setRep(n); put('reports', n); toast(n.status === 'final' ? 'Report marked final' : 'Report unlocked'); }}>{rep.status === 'final' ? 'Unlock' : 'Mark final'}</button>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h3>More</h3></div>
        <div class="row wrap">
          <button class="btn sm outline" disabled={!licensed || busy} onClick={async () => {
            setBusy(true);
            let d = addDays(rep.date, 1); let guard = 0;
            while (await findReport(project.id, d) && guard++ < 60) d = addDays(d, 1);
            const copy = await duplicateReport(rep, d); setBusy(false);
            toast('Copied to ' + fmtDate(d), { type: 'ok' }); navigate('report', { id: copy.id });
          }}><Icon name="copy" size={18} /> Duplicate to next free date</button>
          <button class="btn sm danger-soft" disabled={!licensed} onClick={async () => {
            if (!(await confirmDialog({ title: 'Move report to Trash?', message: 'You can restore it any time from Settings → Trash.', okText: 'Move to Trash', danger: true }))) return;
            await softDelete('reports', rep.id); toast('Moved to Trash'); goBack();
          }}><Icon name="trash" size={18} /> Move to Trash</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Sections
function SectionEditor({ tplSec, project, rep, update, locked, sugg, tpl }) {
  const def = SECTION_DEFS[tplSec.key];
  const cols = sectionColumns(tplSec);
  const rows = rep.sections[tplSec.key] || [];
  const [openId, setOpenId] = useState(null);
  const groups = project.groups || [];
  const accent = def.accent ? tpl.colors.accent : tpl.colors.primary;

  const addRow = (groupId) => {
    const r = newRow(groupId);
    if (tplSec.key === 'manpower' && groupId) r.contractor = groups.find((g) => g.id === groupId)?.name || '';
    if (tplSec.key === 'hindrances') r.status = 'Open';
    update((x) => { x.sections[tplSec.key] = [...(x.sections[tplSec.key] || []), r]; });
    setOpenId(r.id);
  };
  const setField = (rowId, key, value) => update((x) => {
    const row = x.sections[tplSec.key].find((r) => r.id === rowId); if (!row) return;
    row[key] = value;
  });
  const autofill = (rowId) => update((x) => {
    const row = x.sections[tplSec.key].find((r) => r.id === rowId); if (!row || !row.particular) return;
    const m = sugg.memory?.[row.particular.trim().toLowerCase()];
    if (!m) return;
    if (!row.unit && m.unit) row.unit = m.unit;
    if (!row.location && m.location) row.location = m.location;
    if (tplSec.key === 'tomorrow' && !row.responsible && m.responsible) row.responsible = m.responsible;
  });
  const move = (rowId, dir) => update((x) => {
    const list = x.sections[tplSec.key]; const i = list.findIndex((r) => r.id === rowId);
    const row = list[i];
    // move within same group
    let j = i + dir;
    while (j >= 0 && j < list.length && def.grouped && list[j].groupId !== row.groupId) j += dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
  });
  const dup = (rowId) => update((x) => {
    const list = x.sections[tplSec.key]; const i = list.findIndex((r) => r.id === rowId);
    list.splice(i + 1, 0, { ...list[i], id: newRow().id });
  });
  const del = (rowId) => {
    const list = rep.sections[tplSec.key]; const i = list.findIndex((r) => r.id === rowId); const removed = list[i];
    update((x) => { x.sections[tplSec.key] = x.sections[tplSec.key].filter((r) => r.id !== rowId); });
    toast('Row deleted', { action: { label: 'UNDO', fn: () => update((x) => { x.sections[tplSec.key].splice(i, 0, removed); }) } });
  };

  const renderRows = (list) => list.map((r) => {
    const idx = list.indexOf(r) + 1;
    return <RowCard key={r.id} sr={idx} row={r} cols={cols} def={def} sec={tplSec.key} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} setField={setField} locked={locked} sugg={sugg} groups={groups} onMove={move} onDup={dup} onDel={del} onAutofill={autofill} />;
  });

  let body;
  if (def.grouped) {
    const known = new Set(groups.map((g) => g.id));
    const others = rows.filter((r) => !known.has(r.groupId));
    body = (
      <>
        {groups.map((g) => {
          const gr = rows.filter((r) => r.groupId === g.id);
          const totals = def.totals ? def.totals.map((k) => ({ k, label: cols.find((c) => c.key === k)?.label || k, v: gr.reduce((s, r) => s + (num(r[k]) || 0), 0) })) : [];
          return (
            <div key={g.id}>
              <div class="group-h" style={{ background: g.fill, color: g.text }}><span class="grow">{g.name}</span><span class="tiny">{gr.length} item{gr.length === 1 ? '' : 's'}</span></div>
              {renderRows(gr)}
              <div class="row wrap between" style={{ marginBottom: 8 }}>
                {!locked ? <button class="btn sm ghost" style={{ textAlign: 'left' }} onClick={() => addRow(g.id)}><Icon name="plus" size={18} /> Add to {g.name}</button> : <span />}
                {totals.map((t) => <span key={t.k} class="chip outline">Total {t.label}: <b>{fmtNum(t.v)}</b></span>)}
              </div>
            </div>
          );
        })}
        {others.length > 0 && (
          <div>
            <div class="group-h" style={{ background: '#E7E6E6', color: '#3A3838' }}>OTHERS (no group)</div>
            {renderRows(others)}
          </div>
        )}
        {!groups.length && !locked && <button class="btn sm ghost" onClick={() => addRow(null)}><Icon name="plus" size={18} /> Add row</button>}
      </>
    );
  } else {
    body = (
      <>
        {renderRows(rows)}
        {!rows.length && <div class="small muted" style={{ padding: '6px 2px 10px' }}>No entries yet.</div>}
        {!locked && (
          <div class="row wrap">
            {tplSec.key === 'manpower' && groups.length ? groups.map((g) => <button key={g.id} class="btn sm ghost" onClick={() => addRow(g.id)}><Icon name="plus" size={18} /> {g.name}</button>)
              : <button class="btn sm ghost" onClick={() => addRow(null)}><Icon name="plus" size={18} /> Add row</button>}
            {tplSec.key === 'manpower' && <button class="btn sm ghost" onClick={() => addRow(null)}><Icon name="plus" size={18} /> Other</button>}
          </div>
        )}
        {tplSec.key === 'manpower' && <ManpowerTotal rep={rep} />}
      </>
    );
  }
  return (
    <div>
      <div class="sec-band" style={{ background: accent }}><Icon name={tplSec.key === 'manpower' ? 'users' : tplSec.key === 'hindrances' ? 'warn' : 'target'} size={18} /><span class="grow">{tplSec.title}</span><span class="tiny" style={{ opacity: .85 }}>{rows.length} rows</span></div>
      <div class="sec-body">{body}</div>
      {tplSec.key === 'tomorrow' && !locked && rows.length === 0 && (rep.sections.work || []).length > 0 && (
        <button class="btn block outline" style={{ marginBottom: 12 }} onClick={() => update((x) => {
          x.sections.tomorrow = (x.sections.work || []).filter((w) => w.particular && (num(w.totalPct) === null || num(w.totalPct) < 100)).map((w) => newRow(w.groupId, { particular: w.particular, location: w.location || '', unit: w.unit || '', target: '', manpower: '', responsible: '' }));
        })}><Icon name="copy" size={18} /> Start from today's unfinished work items</button>
      )}
    </div>
  );
}

function ManpowerTotal({ rep }) {
  const t = manpowerTotals(rep);
  return (
    <div class="row wrap" style={{ marginTop: 10, gap: 6 }}>
      <span class="chip active">TOTAL {t.total}</span>
      <span class="chip outline">Skilled {t.skilled}</span><span class="chip outline">Semi {t.semi}</span><span class="chip outline">Unskilled {t.unskilled}</span><span class="chip outline">Supervisors {t.supervisors}</span>
    </div>
  );
}

function RowCard({ sr, row, cols, def, sec, open, onToggle, setField, locked, sugg, groups, onMove, onDup, onDel, onAutofill }) {
  const primary = cols.find((c) => c.primary) || cols.find((c) => c.type === 'text');
  const pctCol = cols.find((c) => c.type === 'ratio');
  const totalCol = cols.find((c) => c.key === 'totalPct');
  const sumCol = cols.find((c) => c.type === 'sum');
  const ratio = pctCol ? cellValue(pctCol, row) : null;
  const colors = pctCol ? colorFor(pctCol, ratio) : null;
  const secondary = [row.location, row.unit && (num(row.target) !== null ? `${fmtNum(row.achieved) || (sec === 'work' ? '0' : '')}${sec === 'work' ? '/' : ''}${fmtNum(row.target)} ${row.unit}` : row.unit), row.qty && `${row.qty} ${row.unit || ''}`, row.actionBy && `Action: ${row.actionBy}`].filter(Boolean).join(' · ');
  return (
    <div class={`rowcard ${open ? 'open' : ''}`}>
      <button class="rowsum" onClick={onToggle}>
        <span class="sr">{sr}</span>
        <div class="grow" style={{ minWidth: 0 }}>
          <div class="bold ellipsis" style={!row[primary?.key] ? { color: 'var(--muted)', fontStyle: 'italic', fontWeight: 600 } : null}>{row[primary?.key] || 'Tap to fill…'}</div>
          {secondary && <div class="small muted ellipsis">{secondary}</div>}
          {totalCol && num(row.totalPct) !== null && <div class="bar" style={{ marginTop: 5 }}><i style={{ width: `${Math.max(0, Math.min(100, num(row.totalPct)))}%` }} /></div>}
        </div>
        {pctCol && ratio !== null && <span class="pct" style={{ background: colors?.fill, color: colors?.text }}>{fmtPct(ratio)}</span>}
        {sumCol && <span class="pct" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>{fmtNum(cellValue(sumCol, row)) || 0}</span>}
        {sec === 'hindrances' && row.status && <span class={`chip ${row.status === 'Closed' ? 'ok' : 'bad'}`}>{row.status}</span>}
        <Icon name={open ? 'up' : 'down'} size={18} />
      </button>
      {open && (
        <div class="rowedit">
          {cols.filter((c) => c.type !== 'sr').map((c) => <CellInput key={c.key} c={c} row={row} sec={sec} setField={setField} locked={locked} sugg={sugg} onAutofill={onAutofill} />)}
          {(def.grouped || sec === 'manpower') && groups.length > 0 && (
            <Field label="Group / Contractor" class="full">
              <select value={row.groupId || ''} disabled={locked} onChange={(e) => setField(row.id, 'groupId', e.currentTarget.value || null)}>
                <option value="">— None —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
          )}
          {!locked && (
            <div class="rowtools">
              <button class="icon-btn sm" title="Move up" onClick={() => onMove(row.id, -1)}><Icon name="up" size={18} /></button>
              <button class="icon-btn sm" title="Move down" onClick={() => onMove(row.id, 1)}><Icon name="down" size={18} /></button>
              <button class="icon-btn sm" title="Duplicate" onClick={() => onDup(row.id)}><Icon name="copy" size={18} /></button>
              <button class="icon-btn sm" title="Delete" style={{ color: 'var(--bad)' }} onClick={() => onDel(row.id)}><Icon name="trash" size={18} /></button>
              <div class="grow" />
              <button class="btn sm secondary" onClick={onToggle}><Icon name="check" size={16} /> Done</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CellInput({ c, row, sec, setField, locked, sugg, onAutofill }) {
  const full = c.primary || ['remarks', 'issue', 'location'].includes(c.key) || c.custom;
  const listId = c.suggest ? `dl-${c.suggest}` : undefined;
  const val = row[c.key] ?? '';
  if (c.type === 'ratio' || c.type === 'sum') {
    const v = cellValue(c, row);
    const col = colorFor(c, v);
    return <Field label={c.label}><div class="input" style={{ display: 'flex', alignItems: 'center', background: col?.fill || 'var(--card-2)', color: col?.text, fontWeight: 800 }}>{v === null ? '—' : c.type === 'ratio' ? fmtPct(v) : fmtNum(v)}</div></Field>;
  }
  if (c.type === 'num' || c.type === 'pct') {
    const bad = val !== '' && num(val) === null;
    return (
      <Field label={c.type === 'pct' ? `${c.label}` : c.label}>
        <div style={{ position: 'relative' }}>
          <input inputMode="decimal" value={val} readOnly={locked} placeholder={c.type === 'pct' ? '0–100' : '0'} style={bad ? { borderColor: 'var(--bad)' } : null}
            onInput={(e) => setField(row.id, c.key, e.currentTarget.value.replace(/[^0-9.\-]/g, ''))} />
          {c.type === 'pct' && <span class="muted bold" style={{ position: 'absolute', right: 12, top: 11 }}>%</span>}
        </div>
      </Field>
    );
  }
  if (c.type === 'date') return <Field label={c.label}><input type="date" value={val} disabled={locked} onInput={(e) => setField(row.id, c.key, e.currentTarget.value)} /></Field>;
  if (c.options) {
    return (
      <Field label={c.label}>
        <select value={val} disabled={locked} onChange={(e) => setField(row.id, c.key, e.currentTarget.value)}>
          <option value="">—</option>{c.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Field>
    );
  }
  const list = c.suggest === 'unit' ? [...new Set([...UNIT_SUGGESTIONS, ...(sugg.unit || [])])] : (sugg[c.suggest] || []);
  return (
    <Field label={c.label} class={full ? 'full' : ''}>
      {c.key === 'remarks' || c.key === 'issue'
        ? <textarea rows={2} style={{ minHeight: 44 }} value={val} readOnly={locked} onInput={(e) => setField(row.id, c.key, e.currentTarget.value)} />
        : <input value={val} readOnly={locked} list={listId} autoComplete="off" autoCapitalize="sentences" onInput={(e) => setField(row.id, c.key, e.currentTarget.value)} onBlur={() => c.key === 'particular' && onAutofill(row.id)} />}
      {listId && <datalist id={listId}>{list.slice(0, 200).map((v) => <option key={v} value={v} />)}</datalist>}
    </Field>
  );
}

// ------------------------------------------------------------------ Preview
function PreviewTab({ project, rep }) {
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <div class="row" style={{ marginBottom: 10 }}>
        <div class="small muted grow">This is how your report will look. Change titles, columns & colours in Settings → Report format.</div>
        <button class="btn sm outline" disabled={busy} onClick={async () => {
          if (isNative) { setBusy(true); try { const { blob, filename } = await exportReport('pdf', project, rep); await shareFiles([{ blob, filename }], { title: 'Print / share PDF' }); } finally { setBusy(false); } return; }
          window.print();
        }}><Icon name="print" size={18} /> Print</button>
      </div>
      <ReportPreview project={project} report={rep} />
    </div>
  );
}

// ------------------------------------------------------------------ Share
function SharePanel({ project, rep, tpl, photoCount, flush }) {
  const st = useApp();
  const [size, setSize] = useState(st.settings.exportSize || 'compact');
  const [run, busyView] = useBusy();
  const issues = qualityChecks(rep, photoCount, tpl);
  const title = `${project.name} – DPR ${fmtDate(rep.date)}`;

  const doExport = async (kind, mode) => {
    flush();
    await run(`Creating ${kind.toUpperCase()}…`, async () => {
      try {
        const latest = (await get('reports', rep.id)) || rep;
        const { blob, filename } = await exportReport(kind, project, latest, { size });
        if (mode === 'save') { const r = await saveFile(blob, filename); toast(`Saved to ${r.where}`, { type: 'ok' }); }
        else { const r = await shareFiles([{ blob, filename }], { title, text: title }); if (r === 'downloaded') toast('File downloaded', { type: 'ok' }); }
      } catch (e) { console.error(e); toast('Export failed: ' + (e.message || e), { type: 'bad', ms: 6000 }); }
    });
  };
  const sharePhotos = async () => {
    await run('Preparing photos…', async () => {
      const photos = (await listPhotos(rep.id)).filter((p) => !p.excluded);
      if (!photos.length) { toast('No photos in this report'); return; }
      await shareFiles(photos.map((p, i) => ({ blob: p.blob, filename: `${rep.date}_${String(i + 1).padStart(2, '0')}${p.caption ? '_' + p.caption.replace(/[^\w\- ]+/g, '').slice(0, 30).trim().replace(/\s+/g, '_') : ''}.jpg` })), { title });
    });
  };
  const Item = ({ kind, label, desc, onShare, onSave }) => (
    <div class="li" style={{ cursor: 'default' }}>
      <FileBadge kind={kind} />
      <div class="grow"><div class="bold">{label}</div><div class="small muted">{desc}</div></div>
      {onSave && <button class="icon-btn" title="Save to phone" onClick={onSave}><Icon name="download" /></button>}
      <button class="btn sm" onClick={onShare}><Icon name="share" size={16} /> Share</button>
    </div>
  );
  return (
    <div>
      {issues.length > 0 && (
        <div class="card" style={{ borderColor: 'var(--warn)' }}>
          <div class="card-h"><h3>Quality check</h3><span class="chip warn">{issues.length}</span></div>
          {issues.slice(0, 8).map((i, k) => <div key={k} class="row small" style={{ padding: '3px 0' }}><Icon name={i.level === 'warn' ? 'warn' : 'info'} size={16} style={{ color: i.level === 'warn' ? 'var(--bad)' : 'var(--warn)' }} /><span>{i.msg}</span></div>)}
          <div class="tiny muted" style={{ marginTop: 6 }}>You can still share – these are reminders for better data quality.</div>
        </div>
      )}
      <div class="card">
        <div class="card-h"><h3>Share or save</h3></div>
        <Field label="Photo size inside files">
          <select value={size} onChange={(e) => setSize(e.currentTarget.value)}>{Object.entries(EXPORT_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </Field>
        <div class="list" style={{ marginTop: 6 }}>
          <Item kind="pdf" label="PDF report" desc="Best for WhatsApp & email · same format as Excel" onShare={() => doExport('pdf')} onSave={() => doExport('pdf', 'save')} />
          <Item kind="xlsx" label="Excel (.xlsx)" desc="Editable · formulas, colours & photos" onShare={() => doExport('xlsx')} onSave={() => doExport('xlsx', 'save')} />
          <Item kind="docx" label="Word (.docx)" desc="Editable document with photo grid" onShare={() => doExport('docx')} onSave={() => doExport('docx', 'save')} />
          <Item kind="img" label={`Site photos (${photoCount})`} desc="Share all photos in full quality" onShare={sharePhotos} />
          <Item kind="txt" label="WhatsApp text summary" desc="Quick text update – no attachment" onShare={async () => { flush(); const latest = (await get('reports', rep.id)) || rep; await shareText(whatsappSummary(project, latest), { title }); }} />
        </div>
      </div>
      <div class="small muted center" style={{ padding: '0 10px 20px' }}>Tip: choose <b>WhatsApp</b> in the share menu. To print, open the PDF and use your phone's Print option{!isNative ? ' or use Preview → Print' : ''}.</div>
      {busyView}
    </div>
  );
}
