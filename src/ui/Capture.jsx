import { useEffect, useRef, useState } from 'preact/hooks';
import { activeProject, navigate } from '../store.js';
import { put } from '../db.js';
import { fmtDate, bytesLabel } from '../utils.js';
import { Icon } from './icons.jsx';
import { Sheet, toast, useBlobURL, Spinner } from './kit.jsx';
import { addPhotos, PhotoInputs } from './Photos.jsx';
import { todaysReport } from './actions.js';

/** Quick capture from the camera button: photos go straight into today's report. */
export function CaptureFlow({ onClose }) {
  const project = activeProject();
  const [report, setReport] = useState(null);
  const [added, setAdded] = useState([]);
  const [progress, setProgress] = useState(null);
  const cam = useRef(null); const gal = useRef(null);
  useEffect(() => {
    todaysReport().then((r) => {
      if (!r) { toast('Cannot create a report – access expired'); onClose(); return; }
      setReport(r);
      try { cam.current?.click(); } catch { /* needs a tap */ }
    });
  }, []);
  const onFiles = async (files) => {
    setProgress(0);
    const saved = await addPhotos(files, report, project, setProgress);
    setProgress(null);
    setAdded((a) => [...a, ...saved]);
  };
  const suggestions = [...new Set((report?.sections?.work || []).map((r) => r.particular).filter(Boolean))].slice(0, 10);
  return (
    <Sheet title="Site photos" onClose={onClose} footer={
      <>
        <button class="btn outline grow" onClick={() => { onClose(); if (report) setTimeout(() => navigate('report', { id: report.id, tab: 'photos' }), 60); }}>Open report</button>
        <button class="btn grow" onClick={onClose}><Icon name="check" /> Done</button>
      </>
    }>
      {!report ? <Spinner /> : (
        <div>
          <div class="small muted" style={{ marginBottom: 10 }}>Saving to <b>{project.name}</b> · report of <b>{fmtDate(report.date)}</b></div>
          <div class="row" style={{ marginBottom: 12 }}>
            <button class="btn saffron grow" onClick={() => cam.current?.click()}><Icon name="camera" /> Take photo</button>
            <button class="btn secondary grow" onClick={() => gal.current?.click()}><Icon name="image" /> Gallery</button>
          </div>
          {progress !== null && <div class="progress" style={{ marginBottom: 10 }}><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
          {added.length > 0 && <div class="section-title">Added now – add captions</div>}
          {added.map((p) => <CaptionRow key={p.id} p={p} suggestions={suggestions} />)}
          {!added.length && <div class="empty" style={{ padding: 20 }}><Icon name="camera" size={40} stroke={1.5} /><div class="small">Photos are compressed to save space while keeping them sharp.</div></div>}
          <PhotoInputs onFiles={onFiles} cameraRef={cam} galleryRef={gal} />
        </div>
      )}
    </Sheet>
  );
}

function CaptionRow({ p, suggestions }) {
  const url = useBlobURL(p.thumb);
  const [cap, setCap] = useState(p.caption || '');
  const t = useRef(null);
  const save = (v) => { setCap(v); clearTimeout(t.current); t.current = setTimeout(() => { p.caption = v; put('photos', { ...p, caption: v }); }, 300); };
  return (
    <div class="card flat" style={{ padding: 10 }}>
      <div class="row" style={{ alignItems: 'flex-start' }}>
        {url && <img src={url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, flex: 'none' }} />}
        <div class="grow col" style={{ gap: 6 }}>
          <input class="input" placeholder="Caption (optional)" value={cap} onInput={(e) => save(e.currentTarget.value)} />
          <div class="tiny muted">{bytesLabel(p.size)} · {p.width}×{p.height}</div>
        </div>
      </div>
      {suggestions.length > 0 && <div class="chips" style={{ marginTop: 8 }}>{suggestions.map((s) => <button key={s} class={`chip ${cap === s ? 'active' : 'outline'}`} onClick={() => save(s)}>{s}</button>)}</div>}
    </div>
  );
}
