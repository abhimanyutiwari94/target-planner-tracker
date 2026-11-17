// Word (.docx) renderer – same layout as PDF/Excel, fully editable in MS Word / Google Docs / WPS.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  VerticalAlign, ImageRun, Footer, PageNumber, PageOrientation, BorderStyle, TableLayoutType,
} from 'docx';
import { APP_NAME } from '../defaults.js';

const hex = (h) => String(h || '#FFFFFF').replace('#', '').toUpperCase();
const GRID = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const BORDERS = { top: GRID, bottom: GRID, left: GRID, right: GRID };
const NOB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NOB, bottom: NOB, left: NOB, right: NOB };

function para(text, { bold = false, color, size = 15, align = AlignmentType.LEFT, italics = false } = {}) {
  const lines = String(text ?? '').split('\n');
  return new Paragraph({
    alignment: align, spacing: { before: 0, after: 0 },
    children: lines.flatMap((l, i) => [new TextRun({ text: l, bold, italics, color: color ? hex(color) : undefined, size, font: 'Calibri', break: i > 0 ? 1 : undefined })]),
  });
}
function cell(text, { fill, color, bold, size, align, span = 1, width, vAlign = VerticalAlign.CENTER, borders = BORDERS, children } = {}) {
  return new TableCell({
    children: children || [para(text, { bold, color, size, align })],
    columnSpan: span > 1 ? span : undefined,
    shading: fill ? { fill: hex(fill), type: ShadingType.CLEAR, color: 'auto' } : undefined,
    verticalAlign: vAlign,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
    borders,
  });
}
function band(text, fillHex, W, size = 18) {
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W], layout: TableLayoutType.FIXED,
    rows: [new TableRow({ children: [cell(text, { fill: fillHex, color: '#FFFFFF', bold: true, size, width: W, borders: NO_BORDERS })] })],
  });
}
const spacer = (after = 80) => new Paragraph({ spacing: { before: 0, after }, children: [] });

export async function renderDOCX(model) {
  const landscape = model.orientation === 'landscape';
  // A4 in twips: 11906 x 16838; margins 0.4in = 576
  const M = 500;
  const pageW = landscape ? 16838 : 11906; const pageH = landscape ? 11906 : 16838;
  const W = pageW - M * 2;
  const children = [];
  const center = AlignmentType.CENTER;

  // logos
  if (model.logos.length) {
    const n = model.logos.length; const cw = Math.floor(W / n);
    children.push(new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: Array(n).fill(cw), layout: TableLayoutType.FIXED,
      rows: [new TableRow({ children: model.logos.map((l, i) => {
        const h = 52; const w = Math.min(180, Math.round(h * (l.width / l.height || 1)));
        const bin = Uint8Array.from(atob(l.dataURL.split(',')[1]), (c) => c.charCodeAt(0));
        return cell('', { width: cw, borders: NO_BORDERS, children: [new Paragraph({ alignment: n === 1 ? AlignmentType.LEFT : i === 0 ? AlignmentType.LEFT : i === n - 1 ? AlignmentType.RIGHT : center, children: [new ImageRun({ type: 'png', data: bin, transformation: { width: w, height: h } })] })] });
      }) })],
    }));
    children.push(spacer(60));
  }
  children.push(band(model.title, model.colors.primary, W, 28));
  if (model.subtitle) children.push(band(model.subtitle, model.colors.accent, W, 18));

  // header block
  if (model.header.length) {
    const cw = [0.15, 0.4, 0.15, 0.3].map((f) => Math.floor(W * f));
    const rows = [];
    for (let i = 0; i < model.header.length; i += 2) {
      const a = model.header[i]; const b = model.header[i + 1];
      rows.push(new TableRow({ children: [
        cell(a.label, { fill: model.colors.head, color: model.colors.headText, bold: true, width: cw[0] }),
        cell(a.value, { width: cw[1] }),
        cell(b ? b.label : '', { fill: b ? model.colors.head : undefined, color: model.colors.headText, bold: true, width: cw[2] }),
        cell(b ? b.value : '', { width: cw[3] }),
      ] }));
    }
    children.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cw, layout: TableLayoutType.FIXED, rows }));
  }
  children.push(spacer());

  // sections
  for (const sec of model.sections) {
    const n = sec.columns.length;
    const tw = sec.columns.reduce((s, c) => s + (c.w || 10), 0);
    const cw = sec.columns.map((c) => Math.floor((W * (c.w || 10)) / tw));
    const isNum = (c) => ['num', 'ratio', 'pct', 'sum', 'sr'].includes(c.type) || c.key === 'unit' || c.key === 'responsible';
    const rows = [
      new TableRow({ tableHeader: true, children: [cell(sec.title, { fill: sec.accent ? model.colors.accent : model.colors.primary, color: '#FFFFFF', bold: true, size: 17, span: n, width: W })] }),
      new TableRow({ tableHeader: true, children: sec.columns.map((c, i) => cell(c.label, { fill: model.colors.head, color: model.colors.headText, bold: true, align: center, width: cw[i], size: 14 })) }),
    ];
    for (const r of sec.rows) {
      if (r.type === 'group') { rows.push(new TableRow({ children: [cell(r.label, { fill: r.fill, color: r.color, bold: true, span: n, width: W })] })); continue; }
      rows.push(new TableRow({ cantSplit: true, children: r.cells.map((c, i) => cell(c.text, { fill: c.fill || (r.type === 'total' && c.text === 'TOTAL' ? '#F2F2F2' : undefined), color: c.color, bold: c.bold || r.type === 'total', align: isNum(c.col) ? center : AlignmentType.LEFT, width: cw[i] })) }));
    }
    children.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cw, layout: TableLayoutType.FIXED, rows }));
    children.push(spacer());
  }

  if (model.notes) {
    children.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], layout: TableLayoutType.FIXED, rows: [
      new TableRow({ children: [cell(model.notes.title, { fill: model.colors.primary, color: '#FFFFFF', bold: true, size: 17, width: W })] }),
      new TableRow({ children: [cell(model.notes.text, { width: W })] }),
    ] }));
    children.push(spacer());
  }

  // photos
  if (model.photos.length) {
    const per = model.photosPerRow;
    const cwT = Math.floor(W / per);
    const slotPx = Math.floor((cwT / 1440) * 96) - 10; // twips -> px
    const boxH = Math.round(slotPx * 0.75);
    const rows = [new TableRow({ tableHeader: true, children: [cell(model.photoTitle, { fill: model.colors.primary, color: '#FFFFFF', bold: true, size: 17, span: per, width: W })] })];
    for (let i = 0; i < model.photos.length; i += per) {
      const items = model.photos.slice(i, i + per);
      const cells = [];
      for (let j = 0; j < per; j++) {
        const p = items[j];
        if (!p) { cells.push(cell('', { width: cwT })); continue; }
        const ratio = p.width / p.height || 1.333;
        let w = slotPx, h = slotPx / ratio; if (h > boxH) { h = boxH; w = boxH * ratio; }
        const kids = [new Paragraph({ alignment: center, children: [new ImageRun({ type: 'jpg', data: p.data, transformation: { width: Math.round(w), height: Math.round(h) } })] })];
        if (model.photoCaptions) kids.push(para(p.caption || `Photo ${i + j + 1}`, { italics: true, size: 14, align: center }));
        cells.push(cell('', { width: cwT, children: kids }));
      }
      rows.push(new TableRow({ cantSplit: true, children: cells }));
    }
    children.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: Array(per).fill(cwT), layout: TableLayoutType.FIXED, rows }));
  }

  if (model.signatures.length) {
    children.push(spacer(900));
    const n = model.signatures.length; const cw = Math.floor(W / n);
    children.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: Array(n).fill(cw), layout: TableLayoutType.FIXED, rows: [
      new TableRow({ children: model.signatures.map((s) => cell(s, { bold: true, align: center, width: cw, borders: { top: { style: BorderStyle.SINGLE, size: 6, color: '555555' }, bottom: NOB, left: NOB, right: NOB } })) }),
    ] }));
  }

  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
    new TextRun({ text: model.showGeneratedBy ? `Generated by ${APP_NAME}    ` : '', size: 13, color: '888888' }),
    new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 13, color: '888888' }),
  ] })] });

  const doc = new Document({
    creator: APP_NAME, title: `${model.title} - ${model.subtitle}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 16 } } } },
    sections: [{
      properties: { page: { size: { width: pageW, height: pageH, orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: M, bottom: M, left: M, right: M, footer: 250 } } },
      footers: { default: footer },
      children,
    }],
  });
  return await Packer.toBlob(doc);
}
