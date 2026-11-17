// PDF renderer – A4, same look as the Excel "Daily Progress & Target Tracker" format.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { hexToRgb, fmtDateTime } from '../utils.js';
import { APP_NAME } from '../defaults.js';

const GRID = [191, 191, 191];
const WHITE = [255, 255, 255];
const BLACK = [26, 26, 26];

// Standard PDF fonts only support Latin-1 – replace characters that would print as garbage.
function clean(s) {
  return String(s ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/₹/g, 'Rs.').replace(/…/g, '...').replace(/[ ]/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

export async function renderPDF(model) {
  const landscape = model.orientation === 'landscape';
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 8; const W = PW - M * 2;
  const C = { primary: hexToRgb(model.colors.primary), accent: hexToRgb(model.colors.accent), head: hexToRgb(model.colors.head), headText: hexToRgb(model.colors.headText) };
  let y = M;

  // ---- logos ----
  if (model.logos.length) {
    const h = 14; const gap = 4;
    const items = model.logos.map((l) => ({ ...l, w: Math.min(45, h * (l.width / l.height || 1)) }));
    const positions = [];
    if (items.length === 1) positions.push(M);
    else {
      const total = items.reduce((s, i) => s + i.w, 0);
      const space = (W - total) / (items.length - 1);
      let x = M; for (const it of items) { positions.push(x); x += it.w + Math.max(gap, space); }
    }
    items.forEach((it, i) => { try { doc.addImage(it.dataURL, 'PNG', positions[i], y, it.w, h, undefined, 'FAST'); } catch (e) { console.warn('logo', e); } });
    y += h + 2;
  }

  // ---- title bands ----
  doc.setFillColor(...C.primary); doc.rect(M, y, W, 9, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...WHITE);
  doc.text(clean(model.title), PW / 2, y + 6.2, { align: 'center' });
  y += 9;
  if (model.subtitle) {
    doc.setFillColor(...C.accent); doc.rect(M, y, W, 5.5, 'F');
    doc.setFontSize(8.5); doc.text(clean(model.subtitle), PW / 2, y + 3.9, { align: 'center' });
    y += 5.5;
  }

  const base = {
    theme: 'grid', margin: { left: M, right: M, top: M, bottom: 12 },
    styles: { font: 'helvetica', fontSize: 7.2, cellPadding: { top: 1, bottom: 1, left: 1.2, right: 1.2 }, lineColor: GRID, lineWidth: 0.15, textColor: BLACK, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: C.head, textColor: C.headText, fontStyle: 'bold', halign: 'center', valign: 'middle', lineColor: GRID, lineWidth: 0.15 },
    rowPageBreak: 'avoid',
  };

  // ---- header info grid (label | value | label | value) ----
  if (model.header.length) {
    const body = [];
    for (let i = 0; i < model.header.length; i += 2) {
      const a = model.header[i]; const b = model.header[i + 1];
      body.push([
        { content: clean(a.label), styles: { fillColor: C.head, textColor: C.headText, fontStyle: 'bold' } },
        { content: clean(a.value) },
        { content: clean(b ? b.label : ''), styles: { fillColor: b ? C.head : WHITE, textColor: C.headText, fontStyle: 'bold' } },
        { content: clean(b ? b.value : '') },
      ]);
    }
    autoTable(doc, { ...base, startY: y, body, columnStyles: { 0: { cellWidth: W * 0.15 }, 1: { cellWidth: W * 0.4 }, 2: { cellWidth: W * 0.15 }, 3: { cellWidth: W * 0.3 } } });
    y = doc.lastAutoTable.finalY + 3;
  }

  // ---- sections ----
  for (const sec of model.sections) {
    const n = sec.columns.length;
    const totalW = sec.columns.reduce((s, c) => s + (c.w || 10), 0);
    const columnStyles = {};
    sec.columns.forEach((c, i) => {
      columnStyles[i] = { cellWidth: (W * (c.w || 10)) / totalW, halign: ['num', 'ratio', 'pct', 'sum', 'sr'].includes(c.type) || c.key === 'unit' || c.key === 'responsible' ? 'center' : 'left' };
    });
    const head = [
      [{ content: clean(sec.title), colSpan: n, styles: { fillColor: sec.accent ? C.accent : C.primary, textColor: WHITE, halign: 'left', fontSize: 8.5, cellPadding: { top: 1.4, bottom: 1.4, left: 1.5, right: 1 } } }],
      sec.columns.map((c) => ({ content: clean(c.label) })),
    ];
    const body = sec.rows.map((r) => {
      if (r.type === 'group') return [{ content: clean(r.label), colSpan: n, styles: { fillColor: hexToRgb(r.fill || '#EEEEEE'), textColor: hexToRgb(r.color || '#333333'), fontStyle: 'bold', fontSize: 7.6, halign: 'left' } }];
      return r.cells.map((cell) => {
        const st = {};
        if (cell.fill) st.fillColor = hexToRgb(cell.fill);
        if (cell.color) st.textColor = hexToRgb(cell.color);
        if (cell.bold || r.type === 'total') st.fontStyle = 'bold';
        if (r.type === 'total' && cell.text === 'TOTAL') st.fillColor = [242, 242, 242];
        return { content: clean(cell.text), styles: st };
      });
    });
    if (y > PH - 30) { doc.addPage(); y = M; }
    autoTable(doc, { ...base, startY: y, head, body, columnStyles, showHead: 'everyPage' });
    y = doc.lastAutoTable.finalY + 3;
  }

  // ---- notes ----
  if (model.notes) {
    if (y > PH - 30) { doc.addPage(); y = M; }
    autoTable(doc, { ...base, startY: y, head: [[{ content: clean(model.notes.title), styles: { fillColor: C.primary, textColor: WHITE, halign: 'left', fontSize: 8.5 } }]], body: [[clean(model.notes.text)]] });
    y = doc.lastAutoTable.finalY + 3;
  }

  // ---- photos ----
  if (model.photos.length) {
    const per = model.photosPerRow;
    const gap = 2;
    const cellW = (W - gap * (per - 1)) / per;
    const boxH = cellW * 0.75;
    const capH = model.photoCaptions ? 7 : 0;
    const drawTitle = () => {
      doc.setFillColor(...C.primary); doc.rect(M, y, W, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...WHITE);
      doc.text(clean(model.photoTitle), M + 1.5, y + 4.2);
      y += 7.5;
    };
    if (y + 6 + boxH + capH > PH - 12) { doc.addPage(); y = M; }
    drawTitle();
    for (let i = 0; i < model.photos.length; i += per) {
      if (y + boxH + capH > PH - 12) { doc.addPage(); y = M; }
      const rowItems = model.photos.slice(i, i + per);
      rowItems.forEach((p, j) => {
        const x = M + j * (cellW + gap);
        doc.setFillColor(245, 245, 245); doc.rect(x, y, cellW, boxH, 'F');
        const ratio = p.width / p.height || 1.333;
        let w = cellW, h = cellW / ratio;
        if (h > boxH) { h = boxH; w = boxH * ratio; }
        try { doc.addImage(p.data, 'JPEG', x + (cellW - w) / 2, y + (boxH - h) / 2, w, h, undefined, 'NONE'); } catch (e) { console.warn('photo', e); }
        doc.setDrawColor(...GRID); doc.setLineWidth(0.15); doc.rect(x, y, cellW, boxH, 'S');
        if (capH) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...BLACK);
          const cap = clean(p.caption || `Photo ${i + j + 1}`);
          const lines = doc.splitTextToSize(cap, cellW - 1).slice(0, 2);
          doc.text(lines, x + cellW / 2, y + boxH + 3, { align: 'center' });
        }
      });
      y += boxH + capH + gap;
    }
  }

  // ---- signatures ----
  if (model.signatures.length) {
    if (y > PH - 32) { doc.addPage(); y = M; }
    y += 14;
    const n = model.signatures.length; const sw = W / n;
    doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.25); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BLACK);
    model.signatures.forEach((s, i) => {
      const x = M + i * sw;
      doc.line(x + 6, y, x + sw - 6, y);
      doc.text(clean(s), x + sw / 2, y + 4, { align: 'center' });
    });
  }

  // ---- footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(130, 130, 130);
    if (model.showGeneratedBy) doc.text(clean(`Generated by ${APP_NAME} - ${fmtDateTime(new Date().toISOString())}`), M, PH - 5);
    doc.text(`Page ${p} of ${pages}`, PW - M, PH - 5, { align: 'right' });
  }
  doc.setProperties({ title: clean(`${model.title} - ${model.subtitle}`), creator: APP_NAME, subject: 'Daily Progress Report' });
  return doc.output('blob');
}
