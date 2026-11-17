import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp, activeProject } from '../store.js';
import { listReports, countPhotosByReport, onDBChange } from '../db.js';
import { analyze } from '../calc.js';
import { todayYMD, startOfWeek, addDays, startOfMonth, endOfMonth, startOfYear, endOfYear, fmtDate, fmtPct, fmtNum, monthLabel, fmtShort } from '../utils.js';
import { Icon } from './icons.jsx';
import { Seg, Field, toast, useBusy, Empty } from './kit.jsx';
import { exportPeriodWorkbook, exportPeriodPDF } from '../export/index.js';
import { shareFiles } from '../platform.js';

const PERIODS = [{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'all', label: 'All' }, { value: 'custom', label: 'Custom' }];

function rangeFor(period, anchor, custom) {
  if (period === 'week') { const f = startOfWeek(anchor); return { from: f, to: addDays(f, 6), by: 'day', label: `${fmtShort(f)} – ${fmtShort(addDays(f, 6))} ${anchor.slice(0, 4)}` }; }
  if (period === 'month') return { from: startOfMonth(anchor), to: endOfMonth(anchor), by: 'day', label: monthLabel(anchor) };
  if (period === 'year') return { from: startOfYear(anchor), to: endOfYear(anchor), by: 'month', label: anchor.slice(0, 4) };
  if (period === 'custom') return { from: custom.from, to: custom.to, by: 'auto', label: `${fmtDate(custom.from, { weekday: false })} – ${fmtDate(custom.to, { weekday: false })}` };
  return { from: '1900-01-01', to: '2999-12-31', by: 'auto', label: 'All time' };
}

export function Insights() {
  const st = useApp();
  const project = activeProject();
  const [reports, setReports] = useState([]);
  const [photoCounts, setPhotoCounts] = useState({});
  const [period, setPeriod] = useState('month');
  const [anchor, setAnchor] = useState(todayYMD());
  const [custom, setCustom] = useState({ from: startOfMonth(todayYMD()), to: todayYMD() });
  const [run, busyView] = useBusy();
  const load = async () => { if (!project) return; setReports(await listReports(project.id)); setPhotoCounts(await countPhotosByReport(project.id)); };
  useEffect(() => { load(); return onDBChange((s) => { if (s.has('reports') || s.has('photos')) load(); }); }, [project?.id]);

  const range = rangeFor(period, anchor, custom);
  const data = useMemo(() => {
    let by = range.by;
    if (by === 'auto') {
      const inR = reports.filter((r) => r.date >= range.from && r.date <= range.to).map((r) => r.date).sort();
      const span = inR.length ? (new Date(inR[inR.length - 1]) - new Date(inR[0])) / 86400000 : 0;
      by = span > 400 ? 'month' : span > 62 ? 'week' : 'day';
    }
    return { ...analyze(reports, { from: range.from, to: range.to, by, photoCounts }), by };
  }, [reports, photoCounts, period, anchor, custom.from, custom.to]);

  const shift = (dir) => {
    if (period === 'week') setAnchor(addDays(anchor, 7 * dir));
    else if (period === 'month') setAnchor(startOfMonth(dir > 0 ? addDays(endOfMonth(anchor), 1) : addDays(startOfMonth(anchor), -1)));
    else if (period === 'year') setAnchor(`${Number(anchor.slice(0, 4)) + dir}-06-15`);
  };
  const summaryMeta = { projectName: project?.name || '', rangeLabel: range.label, fileRange: period === 'all' ? 'All' : `${data.reports[0]?.date || range.from}_to_${data.reports[data.reports.length - 1]?.date || range.to}`, data };

  const exportXlsx = (withPhotos) => run('Building Excel workbook…', async () => {
    try {
      const { blob, filename } = await exportPeriodWorkbook(project, data.reports, summaryMeta, { includePhotos: withPhotos, size: st.settings.exportSize });
      await shareFiles([{ blob, filename }], { title: `${project.name} – ${range.label}` });
    } catch (e) { console.error(e); toast('Export failed: ' + e.message, { type: 'bad' }); }
  });
  const exportPdfs = () => run('Creating PDFs…', async () => {
    try { const { blob, filename } = await exportPeriodPDF(project, data.reports, { size: st.settings.exportSize }); await shareFiles([{ blob, filename }], { title: `${project.name} – ${range.label}` }); } catch (e) { toast('Export failed: ' + e.message, { type: 'bad' }); }
  });

  return (
    <div>
      <Seg value={period} onChange={(v) => { setPeriod(v); setAnchor(todayYMD()); }} options={PERIODS} />
      {period === 'custom' ? (
        <div class="grid2" style={{ margin: '10px 0' }}>
          <Field label="From"><input type="date" value={custom.from} onInput={(e) => e.currentTarget.value && setCustom({ ...custom, from: e.currentTarget.value })} /></Field>
          <Field label="To"><input type="date" value={custom.to} onInput={(e) => e.currentTarget.value && setCustom({ ...custom, to: e.currentTarget.value })} /></Field>
        </div>
      ) : (
        <div class="row between" style={{ margin: '8px 0' }}>
          <button class="icon-btn" disabled={period === 'all'} onClick={() => shift(-1)}><Icon name="left" /></button>
          <div class="bold">{range.label}</div>
          <button class="icon-btn" disabled={period === 'all'} onClick={() => shift(1)}><Icon name="right" /></button>
        </div>
      )}
      {!data.reportDays ? <Empty icon="chart" title="No reports in this period" text="Insights are calculated automatically from your daily reports." /> : (
        <>
          <div class="kpis">
            <Kpi v={data.reportDays} l="Reports filed" />
            <Kpi v={fmtNum(data.totalManDays)} l="Total man-days" />
            <Kpi v={fmtNum(data.avgManpower, { dec: 1 })} l="Avg manpower / day" />
            <Kpi v={`${data.peak.value}`} l={`Peak${data.peak.date ? ' · ' + fmtShort(data.peak.date) : ''}`} />
            <Kpi v={data.targets.success == null ? '–' : fmtPct(data.targets.success)} l={`Targets achieved (${data.targets.achieved}/${data.targets.total})`} />
            <Kpi v={data.targets.partial} l="Partially achieved" />
            <Kpi v={data.targets.failed} l="Not achieved" />
            <Kpi v={data.photos} l="Site photos" />
          </div>

          <div class="card" style={{ marginTop: 12 }}>
            <div class="card-h"><h3>Manpower trend</h3><span class="chip outline">per {data.by}</span></div>
            <Chart kind="manpower" data={data} />
          </div>
          <div class="card">
            <div class="card-h"><h3>Target achievement</h3></div>
            <Chart kind="targets" data={data} />
          </div>

          <div class="card">
            <div class="card-h"><h3>Manpower by category</h3></div>
            <div class="grid2">
              {[['Skilled', 'skilled'], ['Semi-skilled', 'semi'], ['Unskilled', 'unskilled'], ['Supervisors', 'supervisors']].map(([l, k]) => (
                <div key={k} class="kpi"><div class="v" style={{ fontSize: 18 }}>{fmtNum(data.categories[k])}</div><div class="l">{l} (man-days)</div></div>
              ))}
            </div>
          </div>

          <div class="card">
            <div class="card-h"><h3>Work-wise performance</h3><span class="chip outline">{data.works.length}</span></div>
            <div class="scroll-x">
              <table class="table">
                <thead><tr><th>Work</th><th class="num">Targets</th><th class="num">✓</th><th class="num">Part.</th><th class="num">✗</th><th class="num">Success</th><th style={{ minWidth: 90 }}>Completion</th></tr></thead>
                <tbody>
                  {data.works.map((w) => (
                    <tr key={w.name}>
                      <td><div class="bold">{w.name}</div><div class="tiny muted">{[w.unit, w.locations].filter(Boolean).join(' · ')}</div></td>
                      <td class="num">{w.targets}</td><td class="num" style={{ color: 'var(--ok)' }}>{w.achieved}</td><td class="num" style={{ color: 'var(--warn)' }}>{w.partial}</td><td class="num" style={{ color: 'var(--bad)' }}>{w.failed}</td>
                      <td class="num bold">{w.success == null ? '–' : fmtPct(w.success)}</td>
                      <td>{w.latestPct == null ? <span class="muted">–</span> : <><div class="bar"><i style={{ width: `${Math.min(100, w.latestPct)}%` }} /></div><div class="tiny muted">{fmtNum(w.latestPct)}%</div></>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card">
            <div class="card-h"><h3>Manpower by contractor</h3></div>
            <table class="table">
              <thead><tr><th>Contractor</th><th class="num">Man-days</th><th class="num">Avg / day</th></tr></thead>
              <tbody>
                {data.contractors.map((c) => {
                  const total = data.series.reduce((s, b) => s + (b.byContractor[c] || 0), 0);
                  return <tr key={c}><td class="bold">{c}</td><td class="num">{fmtNum(total)}</td><td class="num">{fmtNum(total / Math.max(1, data.reportDays), { dec: 1 })}</td></tr>;
                })}
              </tbody>
            </table>
          </div>

          <div class="card">
            <div class="card-h"><h3>Export this period</h3></div>
            <div class="col">
              <button class="btn" onClick={() => exportXlsx(false)}><Icon name="download" /> Excel tracker (summary + all reports)</button>
              <button class="btn secondary" onClick={() => exportXlsx(true)}><Icon name="image" /> Excel tracker with photos</button>
              <button class="btn outline" onClick={exportPdfs}><Icon name="file" /> All daily PDFs (ZIP)</button>
            </div>
            <div class="tiny muted" style={{ marginTop: 8 }}>The Excel file has a Summary, Target Log, Manpower Log and one sheet per daily report – like your current tracker.</div>
          </div>
        </>
      )}
      {busyView}
    </div>
  );
}
function Kpi({ v, l }) { return <div class="kpi"><div class="v">{v}</div><div class="l">{l}</div></div>; }

function Chart({ kind, data }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      const { default: ChartJS } = await import('chart.js/auto');
      if (dead || !ref.current) return;
      const dark = document.documentElement.dataset.theme === 'dark';
      const grid = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
      const text = dark ? '#93A2B8' : '#63728A';
      const labels = data.series.map((s) => s.label);
      const palette = ['#0B3C6E', '#F28C28', '#1B9A57', '#7A5AF8', '#D33F3F', '#0B5E66', '#C98A06', '#5B2C83'];
      let cfg;
      if (kind === 'manpower') {
        const avg = data.by !== 'day';
        cfg = { type: 'bar', data: { labels, datasets: data.contractors.slice(0, 8).map((c, i) => ({ label: c, data: data.series.map((s) => (avg ? (s.byContractor[c] || 0) / Math.max(1, s.days) : s.byContractor[c] || 0)), backgroundColor: palette[i % palette.length], borderRadius: 4, stack: 'm' })) },
          options: { plugins: { legend: { position: 'bottom', labels: { color: text, boxWidth: 12 } }, title: { display: avg, text: 'Average per report day', color: text } } } };
      } else {
        cfg = { type: 'bar', data: { labels, datasets: [
          { label: 'Achieved', data: data.series.map((s) => s.achieved), backgroundColor: '#1B9A57', stack: 't', borderRadius: 4 },
          { label: 'Partial', data: data.series.map((s) => s.partial), backgroundColor: '#E8B00A', stack: 't', borderRadius: 4 },
          { label: 'Not achieved', data: data.series.map((s) => s.failed), backgroundColor: '#D33F3F', stack: 't', borderRadius: 4 },
        ] }, options: { plugins: { legend: { position: 'bottom', labels: { color: text, boxWidth: 12 } } } } };
      }
      cfg.options = { ...cfg.options, responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { color: text, maxRotation: 0, autoSkip: true } }, y: { stacked: true, beginAtZero: true, grid: { color: grid }, ticks: { color: text, precision: 0 } } } };
      chartRef.current?.destroy();
      chartRef.current = new ChartJS(ref.current, cfg);
    })();
    return () => { dead = true; };
  }, [data, kind]);
  useEffect(() => () => chartRef.current?.destroy(), []);
  return <div class="chart-box"><canvas ref={ref} /></div>;
}
