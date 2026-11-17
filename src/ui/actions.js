// Common user actions used from several screens.
import { getState, navigate, activeProject } from '../store.js';
import { findReport } from '../db.js';
import { createReport } from '../reports.js';
import { todayYMD } from '../utils.js';
import { toast } from './kit.jsx';

export async function openToday() {
  const p = activeProject(); if (!p) return;
  let r = await findReport(p.id, todayYMD());
  if (!r) {
    if (!getState().license.active) { toast('Access expired – cannot create new reports'); navigate('settings', { page: 'license' }); return; }
    r = await createReport(p, todayYMD());
    toast("Today's report created – yesterday's targets carried forward", { type: 'ok' });
  }
  navigate('report', { id: r.id });
}

export async function openReportFor(date, opts) {
  const p = activeProject(); if (!p) return null;
  let r = await findReport(p.id, date);
  if (!r) {
    if (!getState().license.active) { toast('Access expired – cannot create new reports'); return null; }
    r = await createReport(p, date, opts);
  }
  navigate('report', { id: r.id });
  return r;
}

/** Get (or create) today's report for the active project – used by the camera button. */
export async function todaysReport() {
  const p = activeProject(); if (!p) return null;
  let r = await findReport(p.id, todayYMD());
  if (!r && getState().license.active) r = await createReport(p, todayYMD());
  return r;
}
