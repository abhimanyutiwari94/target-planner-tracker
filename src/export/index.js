// Export orchestration: loads photos, builds the model and runs the chosen renderer (lazy-loaded to keep the app fast).
import { listPhotos, kvGet } from '../db.js';
import { prepareForExport } from '../image.js';
import { buildReportModel } from './model.js';
import { fmtDate, fmtShort, fmtPct, fmtNum, num } from '../utils.js';
import { manpowerTotals, manpowerByContractor, cellValue } from '../calc.js';
import { MIME } from '../platform.js';

export const EXPORT_SIZES = {
  compact: { label: 'Compact (best for WhatsApp)', maxEdge: 1280, q: 0.72 },
  standard: { label: 'Standard', maxEdge: 1600, q: 0.8 },
  original: { label: 'Original quality', maxEdge: 2400, q: 0.88 },
};

async function loadPhotos(report, sizeKey) {
  const size = EXPORT_SIZES[sizeKey] || EXPORT_SIZES.compact;
  const photos = await listPhotos(report.id);
  const out = [];
  for (const p of photos) {
    if (p.excluded) continue;
    try {
      const prep = await prepareForExport(p.blob, size.maxEdge, size.q);
      out.push({ data: prep.data, width: prep.width, height: prep.height, caption: p.caption || '' });
    } catch (e) { console.warn('photo skipped', e); }
  }
  return out;
}

export async function buildModelWithPhotos(project, report, sizeKey) {
  const photos = await loadPhotos(report, sizeKey);
  return buildReportModel({ project, report, photos });
}

export async function exportReport(kind, project, report, { size } = {}) {
  const sizeKey = size || (await kvGet('settings', {}))?.exportSize || 'compact';
  const model = await buildModelWithPhotos(project, report, sizeKey);
  let blob;
  if (kind === 'pdf') blob = await (await import('./pdf.js')).renderPDF(model);
  else if (kind === 'xlsx') blob = await (await import('./xlsx.js')).renderXLSX([{ model, sheetName: sheetNameFor(report) }]);
  else if (kind === 'docx') blob = await (await import('./docx.js')).renderDOCX(model);
  else throw new Error('Unknown export type');
  const typed = blob.type ? blob : new Blob([blob], { type: MIME[kind] });
  return { blob: typed, filename: `${model.fileBase}.${kind}`, model };
}

export function sheetNameFor(report) {
  const d = fmtShort(report.date).replace(' ', '-');
  return report.reportNo != null && report.reportNo !== '' ? `R${report.reportNo} ${d}` : d;
}

/** Period workbook: summary + target log + manpower log + one sheet per daily report. */
export async function exportPeriodWorkbook(project, reports, summary, { includePhotos = false, size = 'compact' } = {}) {
  const { renderXLSX } = await import('./xlsx.js');
  const sheets = [];
  for (const r of [...reports].sort((a, b) => a.date.localeCompare(b.date))) {
    const photos = includePhotos ? await loadPhotos(r, size) : [];
    sheets.push({ model: buildReportModel({ project, report: r, photos }), sheetName: sheetNameFor(r) });
  }
  const blob = await renderXLSX(sheets, { summary: { ...summary, colors: sheets[0]?.model.colors || { primary: '#0B3C6E', accent: '#F28C28', head: '#DCE6F2', headText: '#0B3C6E' } } });
  return { blob, filename: `${(project.name || 'Project').replace(/[\\/:*?"<>|]+/g, '').trim()}_Tracker_${summary.fileRange}.xlsx` };
}

/** All daily report PDFs of a period, packed in one ZIP file. */
export async function exportPeriodPDF(project, reports, { includePhotos = true, size = 'compact' } = {}) {
  const { renderPDF } = await import('./pdf.js');
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const r of [...reports].sort((a, b) => a.date.localeCompare(b.date))) {
    const photos = includePhotos ? await loadPhotos(r, size) : [];
    const model = buildReportModel({ project, report: r, photos });
    zip.file(`${model.fileBase}.pdf`, await renderPDF(model));
  }
  return { blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' }), filename: `${(project.name || 'Project').replace(/[\\/:*?"<>|]+/g, '').trim()}_DPR_PDFs.zip` };
}

/** Plain-text WhatsApp summary */
export function whatsappSummary(project, report) {
  const lines = [];
  lines.push(`*${project.name}*`);
  lines.push(`*Daily Progress Report* – ${fmtDate(report.date)}${report.reportNo ? `  |  Report No. ${report.reportNo}` : ''}`);
  if (report.weather) lines.push(`Weather: ${report.weather}`);
  const gname = (id) => (project.groups || []).find((g) => g.id === id)?.name || '';
  const work = (report.sections.work || []).filter((r) => r.particular);
  if (work.length) {
    lines.push('', "*Today's Work*");
    let lastG = null;
    work.forEach((r, i) => {
      if (r.groupId !== lastG) { lastG = r.groupId; const g = gname(r.groupId); if (g) lines.push(`_${g}_`); }
      const pct = cellValue({ type: 'ratio', num: 'achieved', den: 'target' }, r);
      const qty = num(r.target) !== null ? ` – ${fmtNum(r.achieved) || 0}/${fmtNum(r.target)} ${r.unit || ''}`.trimEnd() : '';
      lines.push(`${i + 1}. ${r.particular}${r.location ? ` (${r.location})` : ''}${qty}${pct !== null ? ` = ${fmtPct(pct)}` : ''}${num(r.totalPct) !== null ? ` | Total ${fmtNum(r.totalPct)}%` : ''}`);
    });
  }
  const tm = (report.sections.tomorrow || []).filter((r) => r.particular);
  if (tm.length) {
    lines.push('', "*Tomorrow's Targets*");
    tm.forEach((r, i) => lines.push(`${i + 1}. ${r.particular}${r.location ? ` (${r.location})` : ''}${num(r.target) !== null ? ` – ${fmtNum(r.target)} ${r.unit || ''}`.trimEnd() : ''}${num(r.manpower) !== null ? ` | ${fmtNum(r.manpower)} manpower` : ''}`));
  }
  const mp = manpowerTotals(report);
  if (mp.total) {
    lines.push('', `*Manpower: ${mp.total}*`);
    for (const [c, v] of Object.entries(manpowerByContractor(report))) lines.push(`• ${c}: ${v}`);
  }
  const hin = (report.sections.hindrances || []).filter((r) => r.issue);
  if (hin.length) { lines.push('', '*Hindrances*'); hin.forEach((r, i) => lines.push(`${i + 1}. ${r.issue}${r.actionBy ? ` – Action: ${r.actionBy}` : ''}`)); }
  const req = (report.sections.materialReq || []).filter((r) => r.material);
  if (req.length) { lines.push('', '*Material Required*'); req.forEach((r, i) => lines.push(`${i + 1}. ${r.material}${r.qty ? ` – ${r.qty} ${r.unit || ''}` : ''}${r.requiredBy ? ` by ${fmtDate(r.requiredBy, { weekday: false })}` : ''}`)); }
  if (report.notes) lines.push('', report.notes);
  return lines.join('\n');
}
