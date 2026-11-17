// Calculations shared by the editor, exports and insights.
import { num, mix, addDays, startOfWeek, startOfMonth, parseYMD, MONTHS, pad2 } from './utils.js';
import { SECTION_DEFS } from './defaults.js';

/** Computed value of a column for a row (ratio → 0..n, sum → number, pct → 0..1). */
export function cellValue(col, row) {
  if (col.type === 'ratio') {
    const n = num(row[col.num]); const d = num(row[col.den]);
    if (n === null || d === null) return null;
    if (d === 0) return n > 0 ? 1 : 0;
    return n / d;
  }
  if (col.type === 'sum') {
    let any = false; let s = 0;
    for (const k of col.of) { const v = num(row[k]); if (v !== null) { any = true; s += v; } }
    return any ? s : null;
  }
  if (col.type === 'pct') { const v = num(row[col.key]); return v === null ? null : v / 100; }
  if (col.type === 'num') return num(row[col.key]);
  return row[col.key] ?? '';
}

/** Excel-like conditional fills */
export function statusColors(ratio) {
  if (ratio === null || ratio === undefined) return null;
  if (ratio >= 1) return { fill: '#C6EFCE', text: '#006100' };
  if (ratio >= 0.7) return { fill: '#FFEB9C', text: '#9C5700' };
  return { fill: '#FFC7CE', text: '#9C0006' };
}
export function gradientColors(ratio) {
  if (ratio === null || ratio === undefined) return null;
  const r = Math.max(0, Math.min(1, ratio));
  const fill = r <= 0.5 ? mix('#F8696B', '#FFEB84', r / 0.5) : mix('#FFEB84', '#63BE7B', (r - 0.5) / 0.5);
  return { fill, text: '#1A1A1A' };
}
export function colorFor(col, value) {
  if (col.colorScale === 'status') return statusColors(value);
  if (col.colorScale === 'gradient') return gradientColors(value);
  return null;
}

export function rowHasData(sectionKey, row) {
  const def = SECTION_DEFS[sectionKey];
  return Object.keys(row).some((k) => !['id', 'groupId'].includes(k) && row[k] !== '' && row[k] !== null && row[k] !== undefined)
    && def != null;
}

/** Target status for a "today's work" row: Achieved / Partial / Failed / null */
export function targetStatus(row) {
  const t = num(row.target); const a = num(row.achieved);
  if (t === null || a === null || t <= 0) return null;
  if (a >= t) return 'Achieved';
  if (a > 0) return 'Partial';
  return 'Failed';
}

export function manpowerTotals(report) {
  const rows = report?.sections?.manpower || [];
  const t = { skilled: 0, semi: 0, unskilled: 0, supervisors: 0, total: 0 };
  for (const r of rows) {
    for (const k of ['skilled', 'semi', 'unskilled', 'supervisors']) { const v = num(r[k]); if (v !== null) { t[k] += v; t.total += v; } }
  }
  return t;
}
export function manpowerByContractor(report) {
  const out = {};
  for (const r of report?.sections?.manpower || []) {
    const name = (r.contractor || 'Unnamed').trim() || 'Unnamed';
    let s = 0; for (const k of ['skilled', 'semi', 'unskilled', 'supervisors']) s += num(r[k]) || 0;
    out[name] = (out[name] || 0) + s;
  }
  return out;
}

export function reportSummary(report) {
  const work = report?.sections?.work || [];
  let ach = 0, par = 0, fail = 0;
  for (const r of work) { const s = targetStatus(r); if (s === 'Achieved') ach++; else if (s === 'Partial') par++; else if (s === 'Failed') fail++; }
  const mp = manpowerTotals(report);
  return { workCount: work.filter((r) => r.particular).length, tomorrowCount: (report?.sections?.tomorrow || []).filter((r) => r.particular).length, achieved: ach, partial: par, failed: fail, manpower: mp.total };
}

/** Data-quality checks shown before sharing a report. */
export function qualityChecks(report, photoCount, template) {
  const issues = [];
  const en = (k) => template.sections.find((s) => s.key === k)?.enabled;
  const work = report.sections.work || [];
  if (en('work')) {
    if (!work.some((r) => r.particular)) issues.push({ level: 'warn', msg: "No work items in Today's Work" });
    work.forEach((r, i) => {
      if (!r.particular && (r.target || r.achieved)) issues.push({ level: 'warn', msg: `Today's work row ${i + 1}: work particular is empty` });
      if (r.particular && num(r.target) !== null && num(r.achieved) === null) issues.push({ level: 'info', msg: `"${r.particular}": achieved quantity not filled` });
      if (num(r.totalPct) !== null && (num(r.totalPct) < 0 || num(r.totalPct) > 100)) issues.push({ level: 'warn', msg: `"${r.particular}": total completion must be 0–100%` });
      for (const k of ['target', 'achieved']) if (num(r[k]) !== null && num(r[k]) < 0) issues.push({ level: 'warn', msg: `"${r.particular || 'Row ' + (i + 1)}": negative ${k}` });
    });
  }
  if (en('tomorrow') && !(report.sections.tomorrow || []).some((r) => r.particular)) issues.push({ level: 'info', msg: "Tomorrow's targets are empty" });
  if (en('manpower') && manpowerTotals(report).total === 0) issues.push({ level: 'info', msg: 'Manpower not filled' });
  if (template.photos.enabled && !photoCount) issues.push({ level: 'info', msg: 'No site photos added' });
  if (!report.weather) issues.push({ level: 'info', msg: 'Weather not filled' });
  return issues;
}

// ------------------------- Insights / analytics -------------------------
export function bucketKey(ymd, by) {
  if (by === 'day') return ymd;
  if (by === 'week') return startOfWeek(ymd);
  if (by === 'month') return startOfMonth(ymd);
  return ymd.slice(0, 4) + '-01-01';
}
export function bucketLabel(key, by) {
  const d = parseYMD(key);
  if (by === 'day') return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]}`;
  if (by === 'week') { const e = parseYMD(addDays(key, 6)); return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]}–${pad2(e.getDate())} ${MONTHS[e.getMonth()]}`; }
  if (by === 'month') return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  return String(d.getFullYear());
}

/**
 * Aggregate reports in [from,to].
 * Returns kpis, per-bucket series and per-work performance (like the Excel "Work list & target summary").
 */
export function analyze(reports, { from, to, by = 'day', photoCounts = {} }) {
  const inRange = reports.filter((r) => !r.deleted && r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  // one report per date (latest edited wins) to avoid double counting
  const byDate = new Map();
  for (const r of inRange) { const prev = byDate.get(r.date); if (!prev || (r.updatedAt || '') > (prev.updatedAt || '')) byDate.set(r.date, r); }
  const list = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const buckets = new Map();
  const contractors = new Set();
  const works = new Map();
  const targetLog = [];
  const manpowerLog = [];
  let totalManDays = 0, peak = { value: 0, date: null }, photos = 0;
  let ach = 0, par = 0, fail = 0;
  const cat = { skilled: 0, semi: 0, unskilled: 0, supervisors: 0 };

  for (const r of list) {
    const key = bucketKey(r.date, by);
    if (!buckets.has(key)) buckets.set(key, { key, label: bucketLabel(key, by), days: 0, manpower: 0, byContractor: {}, achieved: 0, partial: 0, failed: 0, photos: 0 });
    const b = buckets.get(key);
    b.days++;
    const mp = manpowerTotals(r);
    b.manpower += mp.total; totalManDays += mp.total;
    for (const k of Object.keys(cat)) cat[k] += mp[k];
    if (mp.total > peak.value) peak = { value: mp.total, date: r.date };
    const byC = manpowerByContractor(r);
    for (const [c, v] of Object.entries(byC)) { contractors.add(c); b.byContractor[c] = (b.byContractor[c] || 0) + v; }
    for (const row of r.sections?.manpower || []) {
      const t = ['skilled', 'semi', 'unskilled', 'supervisors'].reduce((s, k) => s + (num(row[k]) || 0), 0);
      if (row.contractor || t) manpowerLog.push({ date: r.date, contractor: row.contractor || '', skilled: num(row.skilled) || 0, semi: num(row.semi) || 0, unskilled: num(row.unskilled) || 0, supervisors: num(row.supervisors) || 0, total: t });
    }
    const pc = photoCounts[r.id] || 0; b.photos += pc; photos += pc;
    for (const row of r.sections?.work || []) {
      if (!row.particular) continue;
      const st = targetStatus(row);
      const name = row.particular.trim();
      const wkey = name.toLowerCase();
      if (!works.has(wkey)) works.set(wkey, { name, unit: row.unit || '', group: row.groupId, targets: 0, achieved: 0, partial: 0, failed: 0, lastAchieved: null, lastMissed: null, latestPct: null, latestDate: null, locations: new Set() });
      const w = works.get(wkey);
      if (row.location) w.locations.add(row.location.trim());
      if (num(row.totalPct) !== null && (!w.latestDate || r.date >= w.latestDate)) { w.latestPct = num(row.totalPct); w.latestDate = r.date; }
      if (st) {
        w.targets++;
        if (st === 'Achieved') { w.achieved++; ach++; b.achieved++; w.lastAchieved = r.date; }
        if (st === 'Partial') { w.partial++; par++; b.partial++; w.lastMissed = r.date; }
        if (st === 'Failed') { w.failed++; fail++; b.failed++; w.lastMissed = r.date; }
        targetLog.push({ date: r.date, work: name, location: row.location || '', unit: row.unit || '', target: num(row.target), achievedQty: num(row.achieved), ratio: num(row.achieved) / num(row.target), status: st, group: row.groupId, remarks: row.remarks || '' });
      }
    }
  }
  const series = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map((b) => ({ ...b, avgManpower: b.days ? b.manpower / b.days : 0 }));
  const workList = [...works.values()].map((w) => ({ ...w, locations: [...w.locations].join(', '), success: w.targets ? w.achieved / w.targets : null }))
    .sort((a, b) => (b.targets - a.targets) || a.name.localeCompare(b.name));
  const totalTargets = ach + par + fail;
  return {
    reports: list,
    reportDays: list.length,
    totalManDays,
    avgManpower: list.length ? totalManDays / list.length : 0,
    peak,
    photos,
    categories: cat,
    targets: { total: totalTargets, achieved: ach, partial: par, failed: fail, success: totalTargets ? ach / totalTargets : null },
    series,
    contractors: [...contractors].sort(),
    works: workList,
    targetLog,
    manpowerLog,
  };
}
