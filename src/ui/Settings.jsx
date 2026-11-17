import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp, navigate, activeProject, updateSettings, refreshLicense, setActiveProject, goBack } from '../store.js';
import { get, put, uid, all, softDelete, restoreDeleted, hardDelete, kvGet, kvSet, storageEstimate, requestPersistence, getDB, notifyChange, listReports } from '../db.js';
import { normalizeTemplate, defaultTemplate, SECTION_DEFS, COLOR_PRESETS, GROUP_PALETTE, APP_NAME, APP_VERSION, defaultGroups } from '../defaults.js';
import { applyCode, getDeviceId } from '../license.js';
import { createBackup, restoreBackup } from '../backup.js';
import { QUALITY_PRESETS, processLogo } from '../image.js';
import { EXPORT_SIZES } from '../export/index.js';
import { requestNotificationPermission, notificationPermission, syncReminders, exactAlarmStatus, openExactAlarmSetting } from '../reminders.js';
import { fmtDate, bytesLabel, fmtDateTime, debounce } from '../utils.js';
import { shareFiles, saveFile, isNative } from '../platform.js';
import { Icon } from './icons.jsx';
import { Field, Sheet, Seg, ToggleRow, Switch, toast, confirmDialog, promptDialog, useBusy, Empty } from './kit.jsx';
import { ReportPreview } from './Preview.jsx';

export function Settings({ page }) {
  const r = useApp().route.params;
  switch (page) {
    case 'project': return <ProjectEditor id={r.id} />;
    case 'format': return <FormatEditor />;
    case 'license': return <LicensePage />;
    case 'backup': return <BackupPage />;
    case 'trash': return <TrashPage />;
    case 'photos': return <PhotoSettings />;
    case 'reminders': return <ReminderSettings />;
    case 'about': return <About />;
    default: return <SettingsHome />;
  }
}

function Item({ icon, title, desc, onClick, right, color }) {
  return (
    <button class="li" onClick={onClick}>
      <div class="ico" style={color ? { background: color + '22', color } : null}><Icon name={icon} /></div>
      <div class="grow" style={{ minWidth: 0 }}><div class="bold">{title}</div>{desc && <div class="small muted ellipsis">{desc}</div>}</div>
      {right}<Icon name="right" size={18} />
    </button>
  );
}

function SettingsHome() {
  const st = useApp();
  const p = activeProject();
  const lic = st.license;
  return (
    <div>
      <div class="section-title">Access</div>
      <div class="card flat" style={{ padding: '2px 12px' }}>
        <Item icon="key" title="Coupon / Access" desc={lic.active ? `Active · ${lic.daysLeft} days left (till ${new Date(lic.expiresAt).toLocaleDateString('en-GB')})` : 'Not active – view-only'} color={lic.active ? '#1B9A57' : '#D33F3F'} onClick={() => navigate('settings', { page: 'license' })} />
      </div>
      <div class="section-title">Projects & format</div>
      <div class="card flat" style={{ padding: '2px 12px' }}>
        {st.projects.map((x) => <Item key={x.id} icon="folder" title={x.name} desc={[x.info?.client, x.id === p?.id ? 'Active project' : ''].filter(Boolean).join(' · ') || 'Project details, logos, contractor groups'} onClick={() => navigate('settings', { page: 'project', id: x.id })} />)}
        <Item icon="plus" title="New project" desc="Each project keeps its own reports and format" onClick={() => navigate('settings', { page: 'project', id: 'new' })} />
        {p && <Item icon="layout" title="Report format" desc={`Titles, headings, columns, colours – ${p.name}`} onClick={() => navigate('settings', { page: 'format' })} color="#F28C28" />}
      </div>
      <div class="section-title">App</div>
      <div class="card flat" style={{ padding: '2px 12px' }}>
        <Item icon="camera" title="Photos & camera" desc="Quality, date/time/location stamp" onClick={() => navigate('settings', { page: 'photos' })} />
        <Item icon="bell" title="Reminders" desc="Notifications & daily report reminder" onClick={() => navigate('settings', { page: 'reminders' })} />
        <div class="li" style={{ cursor: 'default' }}>
          <div class="ico"><Icon name="sun" /></div><div class="grow bold">Theme</div>
          <div style={{ width: 190 }}><Seg value={st.settings.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>
        </div>
      </div>
      <div class="section-title">Data safety</div>
      <div class="card flat" style={{ padding: '2px 12px' }}>
        <Item icon="cloud" title="Backup & restore" desc="Save everything to one file – keep it in Drive / WhatsApp" onClick={() => navigate('settings', { page: 'backup' })} color="#1B9A57" />
        <Item icon="trash" title="Trash" desc="Restore deleted reports, photos, tasks" onClick={() => navigate('settings', { page: 'trash' })} />
      </div>
      <div class="card flat" style={{ padding: '2px 12px', marginTop: 12 }}>
        <Item icon="info" title="About" desc={`${APP_NAME} v${APP_VERSION}`} onClick={() => navigate('settings', { page: 'about' })} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Project editor
function ProjectEditor({ id }) {
  const st = useApp();
  const isNew = id === 'new';
  const [p, setP] = useState(null);
  const logoInput = useRef(null);
  useEffect(() => {
    (async () => {
      if (isNew) setP({ name: '', info: { project: '', client: '', consultant: '', contractors: '', updatedBy: '', location: '' }, logos: [], groups: defaultGroups(), template: defaultTemplate() });
      else setP(await get('projects', id));
    })();
  }, [id]);
  if (!p) return null;
  const locked = !st.license.active && isNew;
  const set = (patch) => setP({ ...p, ...patch });
  const setInfo = (k, v) => setP({ ...p, info: { ...p.info, [k]: v } });
  const tpl = normalizeTemplate(p.template);
  const customHeader = tpl.header.filter((h) => h.scope === 'project' && !['project', 'client', 'consultant', 'contractors'].includes(h.key));
  const labelOf = (k, d) => tpl.header.find((h) => h.key === k)?.label || d;

  const save = async () => {
    if (!p.name.trim()) { toast('Please enter the project name', { type: 'bad' }); return; }
    const latest = p.id ? await get('projects', p.id) : null; // never overwrite format edits made elsewhere
    const rec = await put('projects', { ...p, template: latest?.template ?? p.template, id: p.id || uid('p'), name: p.name.trim() });
    if (isNew) { await setActiveProject(rec.id); toast('Project created', { type: 'ok' }); goBack(); }
    else toast('Project saved', { type: 'ok' });
    setP(rec);
  };
  const addLogo = async (e) => {
    const f = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (!f) return;
    try {
      const l = await processLogo(f);
      const label = await promptDialog({ title: 'Logo name', message: 'Whose logo is this? (shown only inside the app)', value: ['Client', 'Contractor', 'PMC', 'Consultant'][p.logos.length] || 'Logo' });
      set({ logos: [...p.logos, { id: uid('l'), label: label || 'Logo', ...l }] });
    } catch (err) { toast(err.message, { type: 'bad' }); }
  };
  const moveLogo = (i, d) => { const l = [...p.logos]; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; set({ logos: l }); };
  const setGroup = (i, patch) => { const g = [...p.groups]; g[i] = { ...g[i], ...patch }; set({ groups: g }); };
  return (
    <div>
      <div class="card">
        <div class="card-h"><h3>{isNew ? 'New project' : 'Project details'}</h3></div>
        <div class="col gap12">
          <Field label="Project name (title of reports)"><input value={p.name} placeholder="e.g. Ahar Gruh, Varanasi" onInput={(e) => set({ name: e.currentTarget.value })} /></Field>
          <Field label={labelOf('project', 'Project') + ' (detail line)'}><input value={p.info.project || ''} placeholder="e.g. Ahar Gruh, Varanasi, Ph-1st" onInput={(e) => setInfo('project', e.currentTarget.value)} /></Field>
          <div class="grid2">
            <Field label={labelOf('client', 'Client')}><input value={p.info.client || ''} onInput={(e) => setInfo('client', e.currentTarget.value)} /></Field>
            <Field label={labelOf('consultant', 'Consultant')}><input value={p.info.consultant || ''} onInput={(e) => setInfo('consultant', e.currentTarget.value)} /></Field>
          </div>
          <Field label={labelOf('contractors', 'Contractors')}><input value={p.info.contractors || ''} placeholder="Civil: RSP | MEPF: Adishwaram" onInput={(e) => setInfo('contractors', e.currentTarget.value)} /></Field>
          <Field label="Default “Updated By”"><input value={p.info.updatedBy || ''} onInput={(e) => setInfo('updatedBy', e.currentTarget.value)} /></Field>
          {customHeader.map((h) => <Field key={h.key} label={h.label}><input value={p.info[h.key] || ''} onInput={(e) => setInfo(h.key, e.currentTarget.value)} /></Field>)}
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h3>Logos (Client, Contractor, PMC…)</h3><span class="chip outline">{p.logos.length}/6</span></div>
        {p.logos.map((l, i) => (
          <div key={l.id} class="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <img class="logo-thumb" src={l.dataURL} alt="" />
            <input class="input grow" value={l.label} onInput={(e) => { const x = [...p.logos]; x[i] = { ...l, label: e.currentTarget.value }; set({ logos: x }); }} />
            <button class="icon-btn sm" onClick={() => moveLogo(i, -1)}><Icon name="up" size={16} /></button>
            <button class="icon-btn sm" onClick={() => moveLogo(i, 1)}><Icon name="down" size={16} /></button>
            <button class="icon-btn sm" style={{ color: 'var(--bad)' }} onClick={() => set({ logos: p.logos.filter((x) => x.id !== l.id) })}><Icon name="trash" size={16} /></button>
          </div>
        ))}
        {p.logos.length < 6 && <button class="btn sm secondary" style={{ marginTop: 10 }} onClick={() => logoInput.current?.click()}><Icon name="plus" size={16} /> Add logo</button>}
        <input ref={logoInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={addLogo} />
        <div class="tiny muted" style={{ marginTop: 8 }}>Logos appear at the top of PDF, Excel and Word reports – first on the left, last on the right. PNG with transparent background looks best.</div>
      </div>

      <div class="card">
        <div class="card-h"><h3>Contractor / work groups</h3></div>
        <div class="small muted" style={{ marginBottom: 8 }}>Rows in reports are grouped under these headings (like “CIVIL (RSP)” and “MEPF (ADISHWARAM)”).</div>
        {p.groups.map((g, i) => (
          <div key={g.id} class="col" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', gap: 6 }}>
            <div class="row">
              <input class="input grow" value={g.name} style={{ background: g.fill, color: g.text, fontWeight: 800 }} onInput={(e) => setGroup(i, { name: e.currentTarget.value })} />
              <button class="icon-btn sm" onClick={() => { if (i === 0) return; const x = [...p.groups]; [x[i - 1], x[i]] = [x[i], x[i - 1]]; set({ groups: x }); }}><Icon name="up" size={16} /></button>
              <button class="icon-btn sm" style={{ color: 'var(--bad)' }} onClick={async () => { if (await confirmDialog({ title: `Remove group “${g.name}”?`, message: 'Existing rows are kept and shown under OTHERS.', okText: 'Remove', danger: true })) set({ groups: p.groups.filter((x) => x.id !== g.id) }); }}><Icon name="trash" size={16} /></button>
            </div>
            <div class="row">{GROUP_PALETTE.map((c) => <button key={c.fill} class="color-dot" style={{ background: c.fill, borderColor: g.fill === c.fill ? c.text : 'var(--line)' }} onClick={() => setGroup(i, c)} aria-label="colour" />)}</div>
          </div>
        ))}
        <button class="btn sm secondary" style={{ marginTop: 10 }} onClick={() => set({ groups: [...p.groups, { id: uid('g'), name: 'NEW GROUP', ...GROUP_PALETTE[p.groups.length % GROUP_PALETTE.length] }] })}><Icon name="plus" size={16} /> Add group</button>
      </div>

      <button class="btn block saffron" disabled={locked} onClick={save}><Icon name="check" /> {isNew ? 'Create project' : 'Save project'}</button>
      {!isNew && (
        <div class="row" style={{ marginTop: 12 }}>
          <button class="btn outline grow" onClick={async () => { await save(); await setActiveProject(p.id); navigate('settings', { page: 'format' }); }}><Icon name="layout" /> Report format</button>
          {st.projects.length > 1 && <button class="btn danger-soft" onClick={async () => {
            if (!(await confirmDialog({ title: `Move “${p.name}” to Trash?`, message: 'Its reports stay safe and the project can be restored from Settings → Trash.', okText: 'Move to Trash', danger: true }))) return;
            await softDelete('projects', p.id); toast('Project moved to Trash'); goBack();
          }}><Icon name="trash" /></button>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Format editor
function FormatEditor() {
  const st = useApp();
  const project = activeProject();
  const [tpl, setTpl] = useState(() => normalizeTemplate(project?.template));
  const [openSec, setOpenSec] = useState(null);
  const [preview, setPreview] = useState(null);
  const tplRef = useRef(tpl);
  const dirty = useRef(false);
  const saver = useRef(debounce(async (t) => { dirty.current = false; const p = await get('projects', project.id); if (p) await put('projects', { ...p, template: t }); }, 400)).current;
  useEffect(() => () => { if (dirty.current) saver.flush(tplRef.current); }, []);
  if (!project) return null;
  const upd = (fn) => { const t = structuredClone(tplRef.current); fn(t); tplRef.current = t; dirty.current = true; setTpl(t); saver(t); };
  const mv = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

  return (
    <div>
      <div class="banner info"><Icon name="info" size={18} /><span class="grow">Changes save automatically and apply to all reports of <b>{project.name}</b> (PDF, Excel, Word & preview).</span></div>
      <div class="card">
        <div class="card-h"><h3>Titles</h3></div>
        <div class="col gap12">
          <Field label="Main title (blank = project name)"><input value={tpl.title} placeholder={project.name} onInput={(e) => { const v = e.currentTarget.value; upd((t) => { t.title = v; }); }} /></Field>
          <Field label="Sub title"><input value={tpl.subtitle} onInput={(e) => { const v = e.currentTarget.value; upd((t) => { t.subtitle = v; }); }} /></Field>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h3>Colours</h3></div>
        <div class="chips" style={{ marginBottom: 10 }}>
          {COLOR_PRESETS.map((c) => <button key={c.name} class="chip outline" onClick={() => upd((t) => { t.colors = { primary: c.primary, accent: c.accent, head: c.head, headText: c.headText }; })}><span style={{ width: 12, height: 12, borderRadius: 3, background: c.primary, display: 'inline-block' }} /><span style={{ width: 12, height: 12, borderRadius: 3, background: c.accent, display: 'inline-block' }} />{c.name}</button>)}
        </div>
        <div class="grid2">
          {[['primary', 'Title & section bands'], ['accent', 'Sub-title band'], ['head', 'Column header fill'], ['headText', 'Column header text']].map(([k, l]) => (
            <label key={k} class="row small bold"><input type="color" class="color-input" value={tpl.colors[k]} onInput={(e) => { const v = e.currentTarget.value; upd((t) => { t.colors[k] = v; }); }} />{l}</label>
          ))}
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h3>Header fields</h3><button class="chip" onClick={async () => { const l = await promptDialog({ title: 'New header field', message: 'e.g. PMC, Architect, Site Engineer, Work Order No.', placeholder: 'Field name' }); if (l) upd((t) => { t.header.push({ key: uid('h_'), label: l, scope: 'project', enabled: true }); }); }}>+ Add</button></div>
        {tpl.header.map((h, i) => (
          <div key={h.key} class="row" style={{ padding: '5px 0' }}>
            <Switch checked={h.enabled} onChange={(v) => upd((t) => { t.header[i].enabled = v; })} />
            <input class="input grow" value={h.label} onInput={(e) => { const v = e.currentTarget.value; upd((t) => { t.header[i].label = v; }); }} />
            <button class="icon-btn sm" onClick={() => upd((t) => mv(t.header, i, -1))}><Icon name="up" size={16} /></button>
            <button class="icon-btn sm" onClick={() => upd((t) => mv(t.header, i, 1))}><Icon name="down" size={16} /></button>
            {h.key.startsWith('h_') && <button class="icon-btn sm" style={{ color: 'var(--bad)' }} onClick={() => upd((t) => { t.header.splice(i, 1); })}><Icon name="trash" size={16} /></button>}
          </div>
        ))}
        <div class="tiny muted">Values of project fields are filled in the project details. Date, Report No., Weather and Updated By are filled in each daily report.</div>
      </div>

      <div class="card">
        <div class="card-h"><h3>Sections & columns</h3></div>
        {tpl.sections.map((s, i) => (
          <div key={s.key} style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
            <div class="row">
              <Switch checked={s.enabled} onChange={(v) => upd((t) => { t.sections[i].enabled = v; })} />
              <input class="input grow" value={s.title} onInput={(e) => { const v = e.currentTarget.value; upd((t) => { t.sections[i].title = v; }); }} />
              <button class="icon-btn sm" onClick={() => upd((t) => mv(t.sections, i, -1))}><Icon name="up" size={16} /></button>
              <button class="icon-btn sm" onClick={() => upd((t) => mv(t.sections, i, 1))}><Icon name="down" size={16} /></button>
              <button class="icon-btn sm" onClick={() => setOpenSec(openSec === s.key ? null : s.key)}><Icon name={openSec === s.key ? 'up' : 'edit'} size={16} /></button>
            </div>
            {openSec === s.key && (
              <div style={{ padding: '8px 0 4px 10px', borderLeft: '3px solid var(--line)', marginTop: 6 }}>
                <div class="small bold muted" style={{ marginBottom: 4 }}>Columns (rename, hide, reorder)</div>
                {s.columns.map((c, j) => {
                  const def = SECTION_DEFS[s.key].columns.find((d) => d.key === c.key);
                  return (
                    <div key={c.key} class="row" style={{ padding: '3px 0' }}>
                      <Switch checked={c.enabled} onChange={(v) => upd((t) => { t.sections[i].columns[j].enabled = v; })} />
                      <input class="input grow" value={c.label} onInput={(e) => { const v = e.currentTarget.value; upd((t) => { t.sections[i].columns[j].label = v; }); }} />
                      <span class="tiny muted" style={{ width: 44 }}>{def ? ({ sr: 'No.', text: 'text', num: 'number', pct: '%', date: 'date', ratio: 'auto %', sum: 'auto Σ' })[def.type] : (c.type === 'num' ? 'number' : 'text')}</span>
                      <button class="icon-btn sm" onClick={() => upd((t) => mv(t.sections[i].columns, j, -1))}><Icon name="up" size={16} /></button>
                      {!def && <button class="icon-btn sm" style={{ color: 'var(--bad)' }} onClick={() => upd((t) => { t.sections[i].columns.splice(j, 1); })}><Icon name="trash" size={16} /></button>}
                    </div>
                  );
                })}
                <div class="row" style={{ marginTop: 6 }}>
                  <button class="btn sm ghost" onClick={async () => { const l = await promptDialog({ title: 'New text column', placeholder: 'Column name' }); if (l) upd((t) => { t.sections[i].columns.splice(t.sections[i].columns.length - 1, 0, { key: uid('c_'), label: l, type: 'text', enabled: true, w: 10 }); }); }}>+ Text column</button>
                  <button class="btn sm ghost" onClick={async () => { const l = await promptDialog({ title: 'New number column', placeholder: 'Column name' }); if (l) upd((t) => { t.sections[i].columns.splice(t.sections[i].columns.length - 1, 0, { key: uid('c_'), label: l, type: 'num', enabled: true, w: 8 }); }); }}>+ Number column</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div class="card">
        <div class="card-h"><h3>Photos, notes & signatures</h3></div>
        <ToggleRow title="Photo section" checked={tpl.photos.enabled} onChange={(v) => upd((t) => { t.photos.enabled = v; })} />
        {tpl.photos.enabled && (
          <div class="grid2" style={{ margin: '8px 0' }}>
            <Field label="Photo section title" class="span2"><input value={tpl.photos.title} onInput={(e) => { const v = e.currentTarget.value; upd((t) => { t.photos.title = v; }); }} /></Field>
            <Field label="Photos per row"><select value={tpl.photos.perRow} onChange={(e) => { const v = Number(e.currentTarget.value); upd((t) => { t.photos.perRow = v; }); }}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
            <label class="row small bold" style={{ marginTop: 20 }}><Switch checked={tpl.photos.captions} onChange={(v) => upd((t) => { t.photos.captions = v; })} /> Captions</label>
          </div>
        )}
        <ToggleRow title="Notes section" checked={tpl.notes.enabled} onChange={(v) => upd((t) => { t.notes.enabled = v; })} />
        {tpl.notes.enabled && <Field label="Notes title"><input value={tpl.notes.title} onInput={(e) => { const v = e.currentTarget.value; upd((t) => { t.notes.title = v; }); }} /></Field>}
        <ToggleRow title="Signature lines at the end" checked={tpl.signatures.enabled} onChange={(v) => upd((t) => { t.signatures.enabled = v; })} />
        {tpl.signatures.enabled && (
          <div class="col" style={{ marginTop: 6 }}>
            {tpl.signatures.labels.map((l, i) => (
              <div key={i} class="row"><input class="input grow" value={l} onInput={(e) => { const v = e.currentTarget.value; upd((t) => { t.signatures.labels[i] = v; }); }} /><button class="icon-btn sm" style={{ color: 'var(--bad)' }} onClick={() => upd((t) => { t.signatures.labels.splice(i, 1); })}><Icon name="trash" size={16} /></button></div>
            ))}
            {tpl.signatures.labels.length < 5 && <button class="btn sm ghost" onClick={() => upd((t) => { t.signatures.labels.push('Signature'); })}>+ Add signature</button>}
          </div>
        )}
      </div>

      <div class="card">
        <div class="card-h"><h3>Options</h3></div>
        <ToggleRow title="Auto section letters (A, B, C…)" checked={tpl.autoLetters} onChange={(v) => upd((t) => { t.autoLetters = v; })} />
        <ToggleRow title="Hide empty sections in output" desc="e.g. no material received today → section not printed" checked={tpl.hideEmptySections} onChange={(v) => upd((t) => { t.hideEmptySections = v; })} />
        <ToggleRow title="“Generated by” footer" checked={tpl.showGeneratedBy} onChange={(v) => upd((t) => { t.showGeneratedBy = v; })} />
        <div class="toggle-row"><div class="grow bold">Page orientation</div><div style={{ width: 200 }}><Seg value={tpl.orientation} onChange={(v) => upd((t) => { t.orientation = v; })} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></div></div>
      </div>

      <div class="col" style={{ marginBottom: 20 }}>
        <button class="btn" onClick={async () => { if (dirty.current) saver.flush(tplRef.current); const r = (await listReports(project.id))[0]; if (!r) { toast('Create a report first to preview'); return; } setPreview(r); }}><Icon name="eye" /> Preview with latest report</button>
        {st.projects.length > 1 && (
          <select class="input" value="" onChange={async (e) => { const src = st.projects.find((x) => x.id === e.currentTarget.value); e.currentTarget.value = ''; if (!src) return; if (await confirmDialog({ title: `Copy format from “${src.name}”?`, message: 'Titles, columns and colours of this project will be replaced.', okText: 'Copy' })) { const t = normalizeTemplate(src.template); tplRef.current = t; dirty.current = true; setTpl(t); saver(t); toast('Format copied', { type: 'ok' }); } }}>
            <option value="">Copy format from another project…</option>
            {st.projects.filter((x) => x.id !== project.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        <button class="btn outline" onClick={async () => { if (await confirmDialog({ title: 'Reset format to default?', message: 'All titles, columns and colours go back to the original Daily Progress & Target Tracker format. Report data is not affected.', okText: 'Reset', danger: true })) { const t = defaultTemplate(); tplRef.current = t; dirty.current = true; setTpl(t); saver(t); } }}><Icon name="refresh" /> Reset to default format</button>
      </div>
      {preview && <Sheet title="Format preview" full onClose={() => setPreview(null)}><ReportPreview project={{ ...project, template: tpl }} report={preview} /></Sheet>}
    </div>
  );
}

// ------------------------------------------------------------ License
function LicensePage() {
  const st = useApp();
  const [code, setCode] = useState('');
  const [dev, setDev] = useState('');
  const [msg, setMsg] = useState(null);
  useEffect(() => { getDeviceId().then(setDev); refreshLicense(); }, []);
  const lic = st.license;
  const apply = async () => {
    setMsg(null);
    const r = await applyCode(code);
    if (!r.ok) { setMsg({ bad: true, text: r.reason }); return; }
    setCode(''); await refreshLicense();
    setMsg({ bad: false, text: `✔ ${r.days} days added. Access valid till ${new Date(r.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}.` });
    toast('Access activated', { type: 'ok' });
  };
  return (
    <div>
      <div class="card hero">
        <div class="row" style={{ position: 'relative', zIndex: 1 }}>
          <Icon name={lic.active ? 'check' : 'lock'} size={30} />
          <div class="grow">
            <div class="bold" style={{ fontSize: 18 }}>{lic.active ? 'Access active' : lic.everActivated ? 'Access expired' : 'Not activated'}</div>
            <div class="small muted">{lic.active ? `${lic.daysLeft} day${lic.daysLeft === 1 ? '' : 's'} left · valid till ${new Date(lic.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : 'View-only: all old reports, photos, insights & exports remain available.'}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h3>Enter coupon code</h3></div>
        <input class="input code-input" placeholder="TPT-XXXX-XXXX-XXXX-XXXX" value={code} onInput={(e) => setCode(e.currentTarget.value.toUpperCase())} />
        <button class="btn block saffron" style={{ marginTop: 10 }} disabled={code.replace(/[^0-9A-Z]/gi, '').length < 16} onClick={apply}><Icon name="key" /> Apply code</button>
        {msg && <div class={`banner ${msg.bad ? 'lock' : 'info'}`} style={{ marginTop: 10, marginBottom: 0 }}>{msg.text}</div>}
        <div class="tiny muted" style={{ marginTop: 10 }}>Each code adds its days on top of the remaining days. A code can be used once on this phone. When access ends, the app becomes view-only until the next code – your data is never deleted.</div>
      </div>
      <div class="card">
        <div class="card-h"><h3>This phone</h3></div>
        <div class="row"><span class="grow small muted">Device ID (needed for phone-locked codes)</span><b style={{ fontFamily: 'monospace', fontSize: 16 }}>{dev}</b>
          <button class="icon-btn sm" onClick={() => { navigator.clipboard?.writeText(dev).then(() => toast('Copied')).catch(() => {}); }}><Icon name="copy" size={16} /></button></div>
      </div>
      {lic.history.length > 0 && (
        <div class="card">
          <div class="card-h"><h3>Codes used</h3></div>
          {[...lic.history].reverse().map((h) => (
            <div key={h.code} class="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div class="grow"><div class="small" style={{ fontFamily: 'monospace' }}>{h.code}</div><div class="tiny muted">Applied {new Date(h.appliedAt).toLocaleDateString('en-GB')} · +{h.days} days</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Backup
function BackupPage() {
  const [run, busyView] = useBusy();
  const [info, setInfo] = useState({});
  const [mode, setMode] = useState('merge');
  const fileRef = useRef(null);
  const load = async () => {
    const est = await storageEstimate();
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    setInfo({ est, persisted, last: await kvGet('lastBackupAt'), counts: { reports: (await all('reports')).length, photos: (await all('photos')).length, tasks: (await all('tasks')).length } });
  };
  useEffect(() => { load(); }, []);
  const backup = (how) => run('Creating backup…', async (prog) => {
    try {
      const { blob, filename, counts } = await createBackup(prog);
      if (how === 'save') { const r = await saveFile(blob, filename); toast(`Backup saved (${bytesLabel(blob.size)}) to ${r.where}`, { type: 'ok', ms: 5000 }); }
      else await shareFiles([{ blob, filename }], { title: 'Target Planner backup' });
      toast(`Backup ready: ${counts.reports} reports, ${counts.photos} photos`, { type: 'ok' });
      load();
    } catch (e) { toast('Backup failed: ' + e.message, { type: 'bad' }); }
  });
  const restore = async (e) => {
    const f = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (!f) return;
    if (mode === 'replace') {
      const t = await promptDialog({ title: 'Replace ALL data?', message: 'Everything currently in the app will be replaced by this backup. Tip: create a backup first.\nType REPLACE to confirm.', placeholder: 'REPLACE', typeToConfirm: 'REPLACE', danger: true, okText: 'Replace' });
      if (t !== 'REPLACE') return;
    }
    await run('Restoring backup…', async (prog) => {
      try { const c = await restoreBackup(f, mode, prog); toast(`Restored: ${c.added} added, ${c.updated} updated`, { type: 'ok', ms: 5000 }); load(); } catch (err) { toast('Restore failed: ' + err.message, { type: 'bad', ms: 6000 }); }
    });
  };
  return (
    <div>
      <div class="card">
        <div class="card-h"><h3>Your data</h3></div>
        <div class="small">All data is stored only on this phone, works fully offline and is never deleted unless you delete it.</div>
        <div class="kpis" style={{ marginTop: 10 }}>
          <div class="kpi"><div class="v">{info.counts?.reports ?? '–'}</div><div class="l">Reports</div></div>
          <div class="kpi"><div class="v">{info.counts?.photos ?? '–'}</div><div class="l">Photos</div></div>
          <div class="kpi"><div class="v">{info.counts?.tasks ?? '–'}</div><div class="l">Tasks</div></div>
          <div class="kpi"><div class="v" style={{ fontSize: 16 }}>{info.est ? bytesLabel(info.est.usage) : '–'}</div><div class="l">Space used</div></div>
        </div>
        {info.persisted === false && !isNative && <button class="btn sm outline" style={{ marginTop: 10 }} onClick={async () => { const ok = await requestPersistence(); toast(ok ? 'Storage protected ✔' : 'Browser did not allow – install the app to home screen', { type: ok ? 'ok' : undefined }); load(); }}><Icon name="lock" size={16} /> Protect storage from auto-cleanup</button>}
        {info.persisted && <div class="small" style={{ color: 'var(--ok)', marginTop: 8 }}>✔ Storage is protected from automatic cleanup.</div>}
      </div>
      <div class="card">
        <div class="card-h"><h3>Backup</h3><span class="small muted">{info.last ? 'Last: ' + fmtDateTime(info.last) : 'Never'}</span></div>
        <div class="small muted" style={{ marginBottom: 10 }}>One .zip file with all projects, reports, photos, tasks and settings. Send it to yourself on WhatsApp / Google Drive / email once a week.</div>
        <div class="row">
          <button class="btn grow ok" onClick={() => backup('share')}><Icon name="share" /> Backup & share</button>
          <button class="btn outline" onClick={() => backup('save')}><Icon name="download" /> Save</button>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h3>Restore</h3></div>
        <Seg value={mode} onChange={setMode} options={[{ value: 'merge', label: 'Merge (safe)' }, { value: 'replace', label: 'Replace all' }]} />
        <div class="small muted" style={{ margin: '8px 0' }}>{mode === 'merge' ? 'Adds missing items and keeps the newest version of each item. Nothing is deleted.' : 'Deletes current data and restores exactly the backup.'}</div>
        <button class="btn block secondary" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Choose backup file (.zip)</button>
        <input ref={fileRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }} onChange={restore} />
      </div>
      {busyView}
    </div>
  );
}

// ------------------------------------------------------------ Trash
function TrashPage() {
  const [items, setItems] = useState(null);
  const load = async () => {
    const out = [];
    const projects = await all('projects');
    for (const p of projects) if (p.deleted) out.push({ store: 'projects', id: p.id, title: p.name, sub: 'Project', at: p.deletedAt });
    for (const r of await all('reports')) if (r.deleted) out.push({ store: 'reports', id: r.id, title: `Report ${fmtDate(r.date)}`, sub: projects.find((p) => p.id === r.projectId)?.name || '', at: r.deletedAt });
    for (const t of await all('tasks')) if (t.deleted) out.push({ store: 'tasks', id: t.id, title: t.title, sub: 'Task', at: t.deletedAt });
    const db = await getDB();
    let cur = await db.transaction('photos').store.openCursor();
    while (cur) { const p = cur.value; if (p.deleted) out.push({ store: 'photos', id: p.id, title: p.caption || 'Photo', sub: 'Photo', at: p.deletedAt, thumb: p.thumb }); cur = await cur.continue(); }
    out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    setItems(out);
  };
  useEffect(() => { load(); }, []);
  if (!items) return null;
  const purge = async (it) => {
    if (it.store === 'reports') { const db = await getDB(); const ph = await db.getAllFromIndex('photos', 'byReport', it.id); for (const p of ph) await hardDelete('photos', p.id); }
    await hardDelete(it.store, it.id);
  };
  return (
    <div>
      <div class="banner info"><Icon name="info" size={18} /><span class="grow">Deleted items stay here until you remove them permanently.</span></div>
      {!items.length ? <Empty icon="trash" title="Trash is empty" /> : (
        <div class="card flat" style={{ padding: '2px 12px' }}>
          {items.map((it) => (
            <div key={it.store + it.id} class="li" style={{ cursor: 'default' }}>
              <div class="ico"><Icon name={{ projects: 'folder', reports: 'file', tasks: 'tasks', photos: 'image' }[it.store]} /></div>
              <div class="grow" style={{ minWidth: 0 }}><div class="bold ellipsis">{it.title}</div><div class="tiny muted">{it.sub} · deleted {fmtDateTime(it.at)}</div></div>
              <button class="btn sm secondary" onClick={async () => { await restoreDeleted(it.store, it.id); if (it.store === 'tasks') syncReminders(); toast('Restored', { type: 'ok' }); load(); }}>Restore</button>
              <button class="icon-btn sm" style={{ color: 'var(--bad)' }} onClick={async () => {
                if (!(await confirmDialog({ title: 'Delete permanently?', message: `“${it.title}” will be erased forever. This cannot be undone.`, okText: 'Delete forever', danger: true }))) return;
                await purge(it); load();
              }}><Icon name="trash" size={18} /></button>
            </div>
          ))}
        </div>
      )}
      {items.length > 0 && <button class="btn block danger-soft" style={{ marginTop: 12 }} onClick={async () => {
        const t = await promptDialog({ title: 'Empty Trash permanently?', message: `${items.length} items will be erased forever. Type DELETE to confirm.`, placeholder: 'DELETE', typeToConfirm: 'DELETE', danger: true, okText: 'Erase all' });
        if (t !== 'DELETE') return;
        for (const it of items) await purge(it);
        toast('Trash emptied'); load();
      }}><Icon name="trash" /> Empty Trash</button>}
    </div>
  );
}

// ------------------------------------------------------------ Photos
function PhotoSettings() {
  const st = useApp();
  const s = st.settings;
  return (
    <div>
      <div class="card">
        <div class="card-h"><h3>Photo quality (saved in app)</h3></div>
        {Object.entries(QUALITY_PRESETS).map(([k, v]) => (
          <label key={k} class="toggle-row" style={{ cursor: 'pointer' }}><input type="radio" name="q" checked={s.photoPreset === k} onChange={() => updateSettings({ photoPreset: k })} /><div class="grow"><div class="bold">{v.label}</div><div class="tiny muted">Longest side {v.maxEdge}px</div></div></label>
        ))}
      </div>
      <div class="card">
        <div class="card-h"><h3>Photo size inside shared files</h3></div>
        <select class="input" value={s.exportSize} onChange={(e) => updateSettings({ exportSize: e.currentTarget.value })}>{Object.entries(EXPORT_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </div>
      <div class="card">
        <div class="card-h"><h3>Stamp on photo</h3><span class="chip outline">default off</span></div>
        <ToggleRow title="Date" checked={s.stamp.date} onChange={(v) => updateSettings({ stamp: { ...s.stamp, date: v } })} />
        <ToggleRow title="Time" checked={s.stamp.time} onChange={(v) => updateSettings({ stamp: { ...s.stamp, time: v } })} />
        <ToggleRow title="Location coordinates" desc="Uses GPS when the photo is taken" checked={s.stamp.gps} onChange={(v) => updateSettings({ stamp: { ...s.stamp, gps: v } })} />
        <ToggleRow title="Project name" checked={s.stamp.project} onChange={(v) => updateSettings({ stamp: { ...s.stamp, project: v } })} />
        <ToggleRow title="Save GPS with photo (not printed)" desc="Shown in the photo viewer" checked={s.saveGps} onChange={(v) => updateSettings({ saveGps: v })} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Reminders
function ReminderSettings() {
  const [perm, setPerm] = useState(null);
  const [exact, setExact] = useState(null);
  const [daily, setDaily] = useState({ enabled: false, time: '18:00', days: [1, 2, 3, 4, 5, 6] });
  useEffect(() => { notificationPermission().then(setPerm); exactAlarmStatus().then(setExact); kvGet('dailyReminder').then((d) => d && setDaily(d)); }, []);
  const saveDaily = async (d) => { setDaily(d); await kvSet('dailyReminder', d); notifyChange('kv'); if (d.enabled && perm !== 'granted') setPerm(await requestNotificationPermission()); await syncReminders(); };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <div>
      <div class="card">
        <div class="card-h"><h3>Notifications</h3><span class={`chip ${perm === 'granted' ? 'ok' : 'warn'}`}>{perm === 'granted' ? 'Allowed' : perm === 'unsupported' ? 'Not supported' : 'Not allowed'}</span></div>
        {perm !== 'granted' && perm !== 'unsupported' && <button class="btn block" onClick={async () => { setPerm(await requestNotificationPermission()); syncReminders(); }}><Icon name="bell" /> Allow notifications</button>}
        {isNative && exact === 'denied' && <button class="btn block outline" style={{ marginTop: 8 }} onClick={async () => { await openExactAlarmSetting(); setExact(await exactAlarmStatus()); }}>Allow exact-time alarms</button>}
        <div class="tiny muted" style={{ marginTop: 8 }}>{isNative ? 'Android app: reminders ring at the exact time even when the app is closed.' : 'Web app: reminders show while the app is open or recently used. Install the Android app for alarm-clock style reminders.'}</div>
      </div>
      <div class="card">
        <div class="card-h"><h3>Daily report reminder</h3><Switch checked={daily.enabled} onChange={(v) => saveDaily({ ...daily, enabled: v })} /></div>
        <div class="grid2">
          <Field label="Time"><input type="time" value={daily.time} onInput={(e) => saveDaily({ ...daily, time: e.currentTarget.value || '18:00' })} /></Field>
        </div>
        <div class="chips" style={{ marginTop: 10 }}>{DOW.map((d, i) => <button key={d} class={`chip ${daily.days.includes(i) ? 'active' : 'outline'}`} onClick={() => saveDaily({ ...daily, days: daily.days.includes(i) ? daily.days.filter((x) => x !== i) : [...daily.days, i].sort() })}>{d}</button>)}</div>
      </div>
      <div class="small muted" style={{ padding: '0 6px' }}>Task reminders are set inside each task (you can add as many as you like).</div>
    </div>
  );
}

// ------------------------------------------------------------ About
function About() {
  const [dev, setDev] = useState('');
  useEffect(() => { getDeviceId().then(setDev); }, []);
  return (
    <div class="center">
      <img src="./icons/icon-512.png" alt="" style={{ width: 120, height: 120, borderRadius: 28, marginTop: 10, boxShadow: 'var(--shadow)' }} />
      <h2 style={{ marginTop: 12 }}>{APP_NAME}</h2>
      <div class="muted">Version {APP_VERSION} · {isNative ? 'Android app' : 'Web app (offline-ready)'}</div>
      <div class="card" style={{ textAlign: 'left', marginTop: 16 }}>
        <div class="small">Plan daily targets, track progress, manpower and site photos, and share professional PDF / Excel / Word reports – fully offline.</div>
        <div class="small muted" style={{ marginTop: 8 }}>Logo: Tir-Dhanush (bow & arrow) on the Surya disc – aim, focus and dharma in every target.</div>
        <div class="small" style={{ marginTop: 8 }}>Device ID: <b style={{ fontFamily: 'monospace' }}>{dev}</b></div>
      </div>
      {!isNative && (
        <div class="card" style={{ textAlign: 'left' }}>
          <div class="card-h"><h3>Install on your phone</h3></div>
          <div class="small">Android (Chrome): menu ⋮ → <b>Install app</b> / <b>Add to Home screen</b>.<br />iPhone (Safari): Share → <b>Add to Home Screen</b>.<br />After installing it works without internet.</div>
        </div>
      )}
    </div>
  );
}
