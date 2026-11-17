// Default report format, modelled on the "Daily Progress & Target Tracker" Excel format.
// Every label here can be renamed per project from Settings → Report Format.

export const APP_NAME = 'Target Planner and Tracker';
export const APP_SHORT = 'Target Planner';
export const APP_VERSION = '1.0.0';

// Column types:
//  sr      – running serial number per group
//  text    – free text            num   – number
//  pct     – percentage typed by user (0-100)
//  date    – date (YYYY-MM-DD)
//  ratio   – computed  num/den  (shown as %)
//  sum     – computed  sum of listed numeric columns
export const SECTION_DEFS = {
  work: {
    title: "TODAY'S WORK IN PROGRESS",
    grouped: true,
    columns: [
      { key: 'sr', label: 'Sr', type: 'sr', w: 4 },
      { key: 'particular', label: 'Major Work Particulars', type: 'text', w: 22, primary: true, suggest: 'particular' },
      { key: 'location', label: 'Location', type: 'text', w: 13, suggest: 'location' },
      { key: 'unit', label: 'Unit', type: 'text', w: 8, suggest: 'unit' },
      { key: 'target', label: "Today's Target", type: 'num', w: 8 },
      { key: 'achieved', label: 'Upto Todays Achieved', type: 'num', w: 8 },
      { key: 'todayPct', label: "Today's Achieved (%)", type: 'ratio', num: 'achieved', den: 'target', w: 8, colorScale: 'status' },
      { key: 'totalPct', label: 'Total Completion (%)', type: 'pct', w: 8, colorScale: 'gradient' },
      { key: 'plannedDate', label: 'Planned Date of Completion', type: 'date', w: 9 },
      { key: 'remarks', label: 'Remarks', type: 'text', w: 12 },
    ],
  },
  tomorrow: {
    title: "TOMORROW'S TARGETS",
    grouped: true,
    totals: ['manpower'],
    columns: [
      { key: 'sr', label: 'Sr', type: 'sr', w: 4 },
      { key: 'particular', label: 'Work Particulars', type: 'text', w: 22, primary: true, suggest: 'particular' },
      { key: 'location', label: 'Location', type: 'text', w: 13, suggest: 'location' },
      { key: 'unit', label: 'Unit', type: 'text', w: 8, suggest: 'unit' },
      { key: 'target', label: "Tomorrow's Target", type: 'num', w: 8 },
      { key: 'manpower', label: 'Manpower', type: 'num', w: 8 },
      { key: 'responsible', label: 'Responsible', type: 'text', w: 10, suggest: 'responsible' },
      { key: 'remarks', label: 'Remarks', type: 'text', w: 16 },
    ],
  },
  manpower: {
    title: 'MANPOWER AT SITE TODAY',
    grouped: false,
    groupLabelColumn: 'contractor',
    totals: ['skilled', 'semi', 'unskilled', 'supervisors', 'total'],
    columns: [
      { key: 'sr', label: 'Sr', type: 'sr', w: 4 },
      { key: 'contractor', label: 'Contractor', type: 'text', w: 22, primary: true, suggest: 'contractor' },
      { key: 'skilled', label: 'Skilled', type: 'num', w: 9 },
      { key: 'semi', label: 'Semi-Skilled', type: 'num', w: 9 },
      { key: 'unskilled', label: 'Unskilled', type: 'num', w: 9 },
      { key: 'supervisors', label: 'Supervisors', type: 'num', w: 9 },
      { key: 'total', label: 'Total', type: 'sum', of: ['skilled', 'semi', 'unskilled', 'supervisors'], w: 8 },
      { key: 'remarks', label: 'Remarks', type: 'text', w: 16 },
    ],
  },
  materialIn: {
    title: 'MATERIAL RECEIVED AT SITE',
    grouped: true,
    columns: [
      { key: 'sr', label: 'Sr', type: 'sr', w: 4 },
      { key: 'material', label: 'Material', type: 'text', w: 20, primary: true, suggest: 'material' },
      { key: 'spec', label: 'Spec / Make', type: 'text', w: 13 },
      { key: 'unit', label: 'Unit', type: 'text', w: 8, suggest: 'unit' },
      { key: 'qty', label: 'Qty', type: 'num', w: 8 },
      { key: 'supplier', label: 'Supplier', type: 'text', w: 12 },
      { key: 'challan', label: 'Challan No.', type: 'text', w: 10 },
      { key: 'remarks', label: 'Remarks', type: 'text', w: 14 },
    ],
  },
  materialReq: {
    title: 'MATERIAL REQUIRED IMMEDIATELY',
    grouped: true,
    accent: true,
    columns: [
      { key: 'sr', label: 'Sr', type: 'sr', w: 4 },
      { key: 'material', label: 'Material', type: 'text', w: 20, primary: true, suggest: 'material' },
      { key: 'spec', label: 'Spec / Make', type: 'text', w: 13 },
      { key: 'unit', label: 'Unit', type: 'text', w: 8, suggest: 'unit' },
      { key: 'qty', label: 'Qty', type: 'num', w: 8 },
      { key: 'requiredBy', label: 'Required By', type: 'date', w: 10 },
      { key: 'priority', label: 'Priority', type: 'text', w: 9, options: ['High', 'Medium', 'Low'] },
      { key: 'remarks', label: 'Remarks', type: 'text', w: 14 },
    ],
  },
  hindrances: {
    title: 'HINDRANCES / ISSUES',
    grouped: false,
    columns: [
      { key: 'sr', label: 'Sr', type: 'sr', w: 4 },
      { key: 'issue', label: 'Issue / Hindrance', type: 'text', w: 40, primary: true },
      { key: 'contractor', label: 'Contractor', type: 'text', w: 12, suggest: 'contractor' },
      { key: 'actionBy', label: 'Action By', type: 'text', w: 12 },
      { key: 'targetDate', label: 'Target Date', type: 'date', w: 10 },
      { key: 'status', label: 'Status', type: 'text', w: 9, options: ['Open', 'Closed'] },
    ],
  },
};

export const SECTION_ORDER = ['work', 'tomorrow', 'manpower', 'materialIn', 'materialReq', 'hindrances'];

export const HEADER_DEFS = [
  { key: 'project', label: 'Project', scope: 'project' },
  { key: 'date', label: 'Date', scope: 'report' },
  { key: 'client', label: 'Client', scope: 'project' },
  { key: 'consultant', label: 'Consultant', scope: 'project' },
  { key: 'contractors', label: 'Contractors', scope: 'project' },
  { key: 'reportNo', label: 'Report No.', scope: 'report' },
  { key: 'weather', label: 'Weather', scope: 'report' },
  { key: 'updatedBy', label: 'Updated By', scope: 'report' },
];

export const DEFAULT_COLORS = {
  primary: '#0B3C6E',  // title band / section bands
  accent: '#F28C28',   // subtitle band / urgent sections
  head: '#DCE6F2',     // column header background
  headText: '#0B3C6E',
};

export const COLOR_PRESETS = [
  { name: 'Navy & Saffron', primary: '#0B3C6E', accent: '#F28C28', head: '#DCE6F2', headText: '#0B3C6E' },
  { name: 'Forest', primary: '#1E5631', accent: '#E0A100', head: '#DDEEDF', headText: '#1E5631' },
  { name: 'Maroon', primary: '#6D1A1A', accent: '#D98E04', head: '#F3E1DC', headText: '#6D1A1A' },
  { name: 'Charcoal', primary: '#2F3B45', accent: '#E8590C', head: '#E3E8ED', headText: '#2F3B45' },
  { name: 'Royal', primary: '#2A2F86', accent: '#E6A100', head: '#E1E3F5', headText: '#2A2F86' },
  { name: 'Teal', primary: '#0B5E66', accent: '#F28C28', head: '#D8ECEE', headText: '#0B5E66' },
];

export const GROUP_PALETTE = [
  { fill: '#FCE4D6', text: '#C55A11' },
  { fill: '#C9D7EE', text: '#1F4E8C' },
  { fill: '#E2EFDA', text: '#375623' },
  { fill: '#FFF2CC', text: '#7F6000' },
  { fill: '#EADCF2', text: '#5B2C83' },
  { fill: '#DDEBF7', text: '#1F4E79' },
  { fill: '#F8D7DA', text: '#842029' },
  { fill: '#E7E6E6', text: '#3A3838' },
];

export function defaultTemplate() {
  return {
    title: '', // empty => project name is used as main title
    subtitle: 'DAILY PROGRESS & TARGET TRACKER',
    autoLetters: true,
    hideEmptySections: true,
    showGeneratedBy: true,
    orientation: 'portrait',
    colors: { ...DEFAULT_COLORS },
    header: HEADER_DEFS.map((h) => ({ ...h, enabled: true })),
    sections: SECTION_ORDER.map((key) => ({
      key,
      enabled: true,
      title: SECTION_DEFS[key].title,
      columns: SECTION_DEFS[key].columns.map((c) => ({ key: c.key, label: c.label, enabled: true })),
    })),
    photos: { enabled: true, title: 'SITE PHOTOGRAPHS', perRow: 3, captions: true },
    signatures: { enabled: false, labels: ['Contractor Representative', 'Site Engineer', 'Project Manager (PMC)'] },
    notes: { enabled: true, title: 'NOTES / REMARKS' },
  };
}

/** Merge a stored template with defaults so new app versions never break old projects. */
export function normalizeTemplate(t) {
  const d = defaultTemplate();
  if (!t || typeof t !== 'object') return d;
  const out = { ...d, ...t, colors: { ...d.colors, ...(t.colors || {}) }, photos: { ...d.photos, ...(t.photos || {}) },
    signatures: { ...d.signatures, ...(t.signatures || {}) }, notes: { ...d.notes, ...(t.notes || {}) } };
  // header: keep user order, add missing built-ins
  const header = Array.isArray(t.header) ? t.header.filter((h) => h && h.key) : [];
  for (const h of d.header) if (!header.find((x) => x.key === h.key)) header.push(h);
  out.header = header;
  // sections
  const secs = Array.isArray(t.sections) ? t.sections.filter((s) => s && SECTION_DEFS[s.key]) : [];
  for (const s of d.sections) if (!secs.find((x) => x.key === s.key)) secs.push(s);
  out.sections = secs.map((s) => {
    const def = SECTION_DEFS[s.key];
    const cols = Array.isArray(s.columns) ? s.columns.filter((c) => c && c.key) : [];
    for (const c of def.columns) if (!cols.find((x) => x.key === c.key)) cols.push({ key: c.key, label: c.label, enabled: true });
    return { key: s.key, enabled: s.enabled !== false, title: s.title ?? def.title, columns: cols.map((c) => ({ ...c, enabled: c.enabled !== false })) };
  });
  return out;
}

/** Resolve full column definitions (built-in + custom) for a section of a template. */
export function sectionColumns(tplSection, { includeDisabled = false } = {}) {
  const def = SECTION_DEFS[tplSection.key];
  return tplSection.columns
    .map((c) => {
      const base = def.columns.find((d) => d.key === c.key);
      if (base) return { ...base, label: c.label || base.label, enabled: c.enabled !== false };
      // custom column added by the user
      return { key: c.key, label: c.label || 'Custom', type: c.type === 'num' ? 'num' : 'text', w: c.w || 10, enabled: c.enabled !== false, custom: true };
    })
    .filter((c) => includeDisabled || c.enabled);
}

export function defaultGroups() {
  return [
    { id: 'g-civil', name: 'CIVIL', ...GROUP_PALETTE[0] },
    { id: 'g-mepf', name: 'MEPF', ...GROUP_PALETTE[1] },
  ];
}

export const WEATHER_OPTIONS = ['Sunny Day', 'Clear', 'Cloudy', 'Light Rain', 'Heavy Rain', 'Windy', 'Foggy', 'Hot', 'Cold'];
export const UNIT_SUGGESTIONS = ['%', 'No. of Rooms', 'Nos', 'Sqm', 'Sqft', 'Rmt', 'Cum', 'MT', 'Kg', 'Bags', 'Points', 'Floors', 'LS'];
