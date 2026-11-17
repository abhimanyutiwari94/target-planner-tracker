// Builds a format-independent "report model" that the PDF, Excel, Word, print & preview renderers all use,
// so every output looks the same and follows the user's custom format.
import { normalizeTemplate, sectionColumns, SECTION_DEFS } from '../defaults.js';
import { cellValue, colorFor } from '../calc.js';
import { fmtDate, fmtQty, fmtPct, num, fmtNum } from '../utils.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function displayValue(col, row) {
  const v = cellValue(col, row);
  switch (col.type) {
    case 'ratio': return v === null ? '' : fmtPct(v);
    case 'pct': return v === null ? '' : fmtPct(v);
    case 'num': return v === null ? '' : (['target', 'achieved'].includes(col.key) ? fmtQty(v) : fmtNum(v));
    case 'sum': return v === null ? '' : fmtNum(v);
    case 'date': return row[col.key] ? fmtDate(row[col.key], { weekday: false }) : '';
    default: return row[col.key] == null ? '' : String(row[col.key]);
  }
}

function sectionRows(project, report, tplSec, cols) {
  const def = SECTION_DEFS[tplSec.key];
  const rows = (report.sections?.[tplSec.key] || []).filter((r) => cols.some((c) => !['sr', 'ratio', 'sum'].includes(c.type) && r[c.key] !== '' && r[c.key] != null));
  const out = [];
  const makeRow = (r, sr) => ({
    type: 'data',
    raw: r,
    cells: cols.map((c) => {
      if (c.type === 'sr') return { v: sr, text: String(sr), col: c };
      const value = cellValue(c, r);
      const colors = colorFor(c, value);
      return { v: value, text: displayValue(c, r), col: c, fill: colors?.fill, color: colors?.text };
    }),
  });
  if (def.grouped) {
    const groups = project.groups || [];
    const known = new Set(groups.map((g) => g.id));
    const buckets = [...groups.map((g) => ({ g, rows: rows.filter((r) => r.groupId === g.id) })),
      { g: { id: '_other', name: 'OTHERS', fill: '#E7E6E6', text: '#3A3838' }, rows: rows.filter((r) => !known.has(r.groupId)) }];
    for (const { g, rows: grows } of buckets) {
      if (!grows.length) continue;
      out.push({ type: 'group', label: g.name, fill: g.fill, color: g.text });
      grows.forEach((r, i) => out.push(makeRow(r, i + 1)));
      if (def.totals) out.push(totalsRow(cols, grows, def.totals));
    }
  } else {
    rows.forEach((r, i) => {
      const row = makeRow(r, i + 1);
      if (def.groupLabelColumn) { // colour the contractor cell with its group colour
        const g = (project.groups || []).find((x) => x.id === r.groupId);
        const cell = row.cells.find((c) => c.col.key === def.groupLabelColumn);
        if (g && cell) { cell.fill = g.fill; cell.color = g.text; cell.bold = true; }
      }
      out.push(row);
    });
    if (def.totals && rows.length) out.push(totalsRow(cols, rows, def.totals, 'TOTAL'));
  }
  return out;
}

function totalsRow(cols, rows, totalKeys, label = 'Total') {
  const cells = cols.map((c) => ({ text: '', col: c }));
  const firstTotalIdx = cols.findIndex((c) => totalKeys.includes(c.key));
  const labelIdx = Math.max(0, firstTotalIdx - 1);
  cols.forEach((c, i) => {
    if (totalKeys.includes(c.key)) {
      let s = 0, any = false;
      for (const r of rows) { const v = c.type === 'sum' ? cellValue(c, r) : num(r[c.key]); if (v !== null) { s += v; any = true; } }
      cells[i] = { v: any ? s : null, text: any ? fmtNum(s) : '', col: c, bold: true };
    }
  });
  if (firstTotalIdx > 0) cells[labelIdx] = { text: label, col: cols[labelIdx], bold: true };
  return { type: 'total', cells };
}

/**
 * @param {{project, report, photos?:Array<{dataURL?,data?,width,height,caption}>, logos?:Array}} input
 */
export function buildReportModel({ project, report, photos = [] }) {
  const tpl = normalizeTemplate(project.template);
  const info = project.info || {};
  const headerValues = {
    project: info.project || project.name || '',
    date: fmtDate(report.date),
    client: info.client || '',
    consultant: info.consultant || '',
    contractors: info.contractors || '',
    reportNo: report.reportNo != null ? String(report.reportNo) : '',
    weather: report.weather || '',
    updatedBy: report.updatedBy || info.updatedBy || '',
  };
  const header = tpl.header.filter((h) => h.enabled).map((h) => ({ label: h.label, value: h.scope === 'report' ? (headerValues[h.key] ?? report.info?.[h.key] ?? '') : (headerValues[h.key] ?? info[h.key] ?? '') }));

  const sections = [];
  let li = 0;
  for (const s of tpl.sections) {
    if (!s.enabled) continue;
    const cols = sectionColumns(s);
    if (!cols.length) continue;
    const rows = sectionRows(project, report, s, cols);
    if (!rows.length && tpl.hideEmptySections) continue;
    const letter = tpl.autoLetters ? LETTERS[li++] : '';
    sections.push({ key: s.key, title: (letter ? `${letter}.  ` : '') + s.title, accent: !!SECTION_DEFS[s.key].accent, columns: cols, rows });
  }
  const notes = (report.notes || '').trim();
  return {
    title: tpl.title || project.name || 'Project',
    subtitle: tpl.subtitle,
    colors: tpl.colors,
    orientation: tpl.orientation,
    header,
    logos: (project.logos || []).filter((l) => l.dataURL),
    sections,
    notes: tpl.notes.enabled && notes ? { title: (tpl.autoLetters ? `${LETTERS[li++]}.  ` : '') + tpl.notes.title, text: notes } : null,
    photos: tpl.photos.enabled ? photos : [],
    photoTitle: (tpl.autoLetters && tpl.photos.enabled && photos.length ? `${LETTERS[li++]}.  ` : '') + tpl.photos.title,
    photosPerRow: Math.max(1, Math.min(6, Number(tpl.photos.perRow) || 3)),
    photoCaptions: tpl.photos.captions,
    signatures: tpl.signatures.enabled ? tpl.signatures.labels.filter(Boolean) : [],
    showGeneratedBy: tpl.showGeneratedBy,
    fileBase: `${(project.name || 'Report').replace(/[\\/:*?"<>|]+/g, '').trim()}_DPR_${report.date}`,
    date: report.date,
    reportNo: report.reportNo,
  };
}
