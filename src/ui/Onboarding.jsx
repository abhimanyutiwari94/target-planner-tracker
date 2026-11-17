import { useRef, useState } from 'preact/hooks';
import { useApp, refreshLicense, setActiveProject, setOnboarded, loadState } from '../store.js';
import { put, uid, listProjects } from '../db.js';
import { applyCode } from '../license.js';
import { restoreBackup } from '../backup.js';
import { defaultTemplate, defaultGroups, GROUP_PALETTE, APP_NAME } from '../defaults.js';
import { Icon } from './icons.jsx';
import { Field, toast, useBusy } from './kit.jsx';

export function Onboarding() {
  const st = useApp();
  const [step, setStep] = useState(st.license.active ? 'project' : 'code');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [p, setP] = useState({ name: '', project: '', client: '', consultant: '', contractors: '', updatedBy: '' });
  const [groups, setGroups] = useState(defaultGroups().map((g) => g.name));
  const [run, busyView] = useBusy();
  const fileRef = useRef(null);

  const apply = async () => {
    setErr('');
    const r = await applyCode(code);
    if (!r.ok) { setErr(r.reason); return; }
    await refreshLicense();
    toast(`Activated – ${r.days} days`, { type: 'ok' });
    if ((await listProjects()).length) { await setOnboarded(); } else setStep('project');
  };
  const create = async () => {
    if (!p.name.trim()) { toast('Please enter your project name', { type: 'bad' }); return; }
    const rec = await put('projects', {
      id: uid('p'), name: p.name.trim(),
      info: { project: p.project || p.name, client: p.client, consultant: p.consultant, contractors: p.contractors, updatedBy: p.updatedBy },
      logos: [], groups: groups.filter((g) => g.trim()).map((g, i) => ({ id: uid('g'), name: g.trim(), ...GROUP_PALETTE[i % GROUP_PALETTE.length] })),
      template: defaultTemplate(),
    });
    await setActiveProject(rec.id);
    await setOnboarded();
  };
  const restore = async (e) => {
    const f = e.currentTarget.files?.[0]; e.currentTarget.value = '';
    if (!f) return;
    await run('Restoring your data…', async (prog) => {
      try { const c = await restoreBackup(f, 'merge', prog); toast(`Restored ${c.added} items`, { type: 'ok' }); await loadState(); if ((await listProjects()).length) await setOnboarded(); } catch (er) { toast(er.message, { type: 'bad', ms: 6000 }); }
    });
  };

  return (
    <div class="onb">
      <div class="brandbox">
        <img src="./icons/icon-512.png" alt="" />
        <h1 style={{ fontSize: 24, marginTop: 16 }}>{APP_NAME}</h1>
        <div style={{ opacity: 0.8, marginTop: 4 }}>Daily targets · progress · manpower · site photos</div>
      </div>
      <div style={{ padding: '0 16px 24px', maxWidth: 560, margin: '0 auto', width: '100%' }}>
        {step === 'code' && (
          <div class="card">
            <h3 style={{ marginBottom: 6 }}>Activate with coupon code</h3>
            <div class="small muted" style={{ marginBottom: 12 }}>Each code gives 30 days (or more) of full access. Your data always stays on your phone.</div>
            <input class="input code-input" placeholder="TPT-XXXX-XXXX-XXXX-XXXX" value={code} onInput={(e) => setCode(e.currentTarget.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && apply()} />
            {err && <div class="banner lock" style={{ marginTop: 10, marginBottom: 0 }}>{err}</div>}
            <button class="btn block saffron" style={{ marginTop: 12 }} onClick={apply} disabled={code.replace(/[^0-9A-Z]/gi, '').length < 16}><Icon name="key" /> Activate</button>
            <div class="row" style={{ marginTop: 14 }}>
              <button class="btn ghost grow" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Restore backup</button>
            </div>
            <input ref={fileRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }} onChange={restore} />
            <div class="tiny muted center" style={{ marginTop: 6 }}>Restoring a backup lets you view all your old work even without a code.</div>
          </div>
        )}
        {step === 'project' && (
          <div class="card">
            <h3 style={{ marginBottom: 6 }}>Your first project</h3>
            <div class="small muted" style={{ marginBottom: 12 }}>You can change everything later, add logos and more projects in Settings.</div>
            <div class="col gap12">
              <Field label="Project name *"><input value={p.name} placeholder="e.g. Ahar Gruh, Varanasi" onInput={(e) => setP({ ...p, name: e.currentTarget.value })} /></Field>
              <Field label="Project detail line"><input value={p.project} placeholder="e.g. Ahar Gruh, Varanasi, Ph-1st" onInput={(e) => setP({ ...p, project: e.currentTarget.value })} /></Field>
              <div class="grid2">
                <Field label="Client"><input value={p.client} onInput={(e) => setP({ ...p, client: e.currentTarget.value })} /></Field>
                <Field label="Consultant / PMC"><input value={p.consultant} onInput={(e) => setP({ ...p, consultant: e.currentTarget.value })} /></Field>
              </div>
              <Field label="Contractors"><input value={p.contractors} placeholder="Civil: RSP | MEPF: Adishwaram" onInput={(e) => setP({ ...p, contractors: e.currentTarget.value })} /></Field>
              <Field label="Updated by (your name)"><input value={p.updatedBy} onInput={(e) => setP({ ...p, updatedBy: e.currentTarget.value })} /></Field>
              <div>
                <div class="small bold muted" style={{ marginBottom: 4 }}>Work groups (contractor headings in reports)</div>
                {groups.map((g, i) => (
                  <div key={i} class="row" style={{ marginBottom: 6 }}>
                    <input class="input grow" value={g} style={{ background: GROUP_PALETTE[i % GROUP_PALETTE.length].fill, color: GROUP_PALETTE[i % GROUP_PALETTE.length].text, fontWeight: 800 }} onInput={(e) => { const x = [...groups]; x[i] = e.currentTarget.value; setGroups(x); }} />
                    <button class="icon-btn sm" onClick={() => setGroups(groups.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button>
                  </div>
                ))}
                <button class="btn sm ghost" onClick={() => setGroups([...groups, ''])}>+ Add group</button>
              </div>
              <button class="btn block saffron" onClick={create}><Icon name="check" /> Start using the app</button>
            </div>
          </div>
        )}
      </div>
      {busyView}
    </div>
  );
}
