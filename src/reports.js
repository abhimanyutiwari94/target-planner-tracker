// Report creation, carry-forward from the previous day, and autocomplete suggestions.
import { listReports, put, uid, findReport } from './db.js';
import { num, todayYMD } from './utils.js';
import { normalizeTemplate } from './defaults.js';

export function emptySections() {
  return { work: [], tomorrow: [], manpower: [], materialIn: [], materialReq: [], hindrances: [] };
}
export function newRow(groupId = null, extra = {}) { return { id: uid('r'), groupId, ...extra }; }

export async function previousReport(projectId, date) {
  const list = await listReports(projectId);
  return list.find((r) => r.date < date) || null;
}

/**
 * opts: { fromTomorrow, carryUnfinished, manpowerRows, copyTomorrow, carryHindrances }
 */
export async function createReport(project, date, opts = {}) {
  const existing = await findReport(project.id, date);
  if (existing) return existing;
  const all = await listReports(project.id);
  const prev = all.find((r) => r.date < date) || null;
  const maxNo = all.reduce((m, r) => Math.max(m, num(r.reportNo) || 0), 0);
  const s = emptySections();
  const o = { fromTomorrow: true, carryUnfinished: true, manpowerRows: true, copyTomorrow: false, carryHindrances: true, ...opts };
  if (prev) {
    const seen = new Set();
    const key = (r) => `${(r.particular || '').trim().toLowerCase()}|${(r.location || '').trim().toLowerCase()}`;
    if (o.fromTomorrow) {
      for (const t of prev.sections?.tomorrow || []) {
        if (!t.particular) continue;
        const last = (prev.sections?.work || []).find((w) => key(w) === key(t));
        s.work.push(newRow(t.groupId, { particular: t.particular, location: t.location || '', unit: t.unit || '', target: t.target ?? '', achieved: '', totalPct: last?.totalPct ?? '', plannedDate: last?.plannedDate || '', remarks: '' }));
        seen.add(key(t));
      }
    }
    if (o.carryUnfinished) {
      for (const w of prev.sections?.work || []) {
        if (!w.particular || seen.has(key(w))) continue;
        const tp = num(w.totalPct);
        if (tp !== null && tp >= 100) continue;
        s.work.push(newRow(w.groupId, { particular: w.particular, location: w.location || '', unit: w.unit || '', target: w.target ?? '', achieved: '', totalPct: w.totalPct ?? '', plannedDate: w.plannedDate || '', remarks: '' }));
        seen.add(key(w));
      }
    }
    if (o.copyTomorrow) for (const t of prev.sections?.tomorrow || []) if (t.particular) s.tomorrow.push(newRow(t.groupId, { ...t, id: undefined, target: t.target ?? '' , manpower: t.manpower ?? '' }));
    s.tomorrow.forEach((r) => { r.id = uid('r'); });
    if (o.carryHindrances) for (const h of prev.sections?.hindrances || []) if (h.issue && (h.status || 'Open') !== 'Closed') s.hindrances.push(newRow(h.groupId, { ...h, id: uid('r') }));
  }
  if (o.manpowerRows) {
    const prevMp = prev?.sections?.manpower || [];
    if (prevMp.length) prevMp.forEach((m) => s.manpower.push(newRow(m.groupId, { contractor: m.contractor || '', skilled: '', semi: '', unskilled: '', supervisors: '', remarks: '' })));
    else (project.groups || []).forEach((g) => s.manpower.push(newRow(g.id, { contractor: g.name, skilled: '', semi: '', unskilled: '', supervisors: '' })));
  }
  const report = {
    id: uid('rp'), projectId: project.id, date, reportNo: maxNo + 1, weather: '', updatedBy: project.info?.updatedBy || '', info: {},
    sections: s, notes: '', status: 'draft',
  };
  return await put('reports', report);
}

export async function duplicateReport(report, date) {
  const copy = JSON.parse(JSON.stringify(report));
  copy.id = uid('rp'); copy.date = date; delete copy.createdAt; delete copy.deleted; copy.status = 'draft';
  for (const k of Object.keys(copy.sections || {})) copy.sections[k] = (copy.sections[k] || []).map((r) => ({ ...r, id: uid('r') }));
  return await put('reports', copy);
}

/** Collect autocomplete suggestions from a project's history */
export async function collectSuggestions(projectId) {
  const list = await listReports(projectId);
  const sets = { particular: new Map(), location: new Map(), unit: new Map(), responsible: new Map(), contractor: new Map(), material: new Map() };
  const memory = {}; // particular -> last {unit, location, plannedDate, totalPct}
  for (const r of list.slice(0, 120)) { // newest first
    for (const [sec, rows] of Object.entries(r.sections || {})) {
      for (const row of rows || []) {
        for (const k of Object.keys(sets)) {
          const v = (row[k] || '').toString().trim();
          if (v) sets[k].set(v.toLowerCase(), v);
        }
        if ((sec === 'work' || sec === 'tomorrow') && row.particular) {
          const pk = row.particular.trim().toLowerCase();
          if (!memory[pk]) memory[pk] = { unit: row.unit, location: row.location, groupId: row.groupId, responsible: row.responsible };
        }
      }
    }
  }
  const out = {};
  for (const [k, m] of Object.entries(sets)) out[k] = [...m.values()].slice(0, 300);
  out.memory = memory;
  return out;
}

export function templateOf(project) { return normalizeTemplate(project?.template); }
export { todayYMD };
