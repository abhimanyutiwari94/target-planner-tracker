import { useEffect, useRef, useState } from 'preact/hooks';
import { listPhotos, put, softDelete, onDBChange, uid } from '../db.js';
import { processPhoto, getPosition } from '../image.js';
import { getState, pushOverlay } from '../store.js';
import { bytesLabel, fmtDateTime } from '../utils.js';
import { shareFiles } from '../platform.js';
import { Icon } from './icons.jsx';
import { toast, confirmDialog, useBlobURL, Spinner } from './kit.jsx';

/** Process & store photos for a report. Returns saved photo records. */
export async function addPhotos(files, report, project, onProgress = () => {}) {
  const settings = getState().settings;
  const existing = await listPhotos(report.id);
  let order = existing.reduce((m, p) => Math.max(m, p.order ?? 0), 0);
  const needGps = settings.stamp?.gps || settings.saveGps;
  const position = needGps ? await getPosition() : null;
  if (needGps && !position) toast('Location not available – photo saved without coordinates');
  const saved = [];
  let i = 0;
  for (const f of files) {
    try {
      const res = await processPhoto(f, { preset: settings.photoPreset, stamp: settings.stamp, projectName: project.name, position });
      const rec = await put('photos', {
        id: uid('ph'), reportId: report.id, projectId: project.id, blob: res.blob, thumb: res.thumb, width: res.width, height: res.height, size: res.size,
        caption: '', takenAt: res.takenAt, order: ++order, ...(settings.saveGps && position ? { lat: position.lat, lng: position.lng } : {}),
      });
      saved.push(rec);
    } catch (e) { console.error(e); toast(`Could not add a photo: ${e.message}`, { type: 'bad' }); }
    onProgress(++i / files.length);
  }
  return saved;
}

export function PhotoInputs({ onFiles, cameraRef, galleryRef }) {
  const pick = (e) => { const files = [...(e.currentTarget.files || [])]; e.currentTarget.value = ''; if (files.length) onFiles(files); };
  return (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={pick} />
      <input ref={galleryRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={pick} />
    </>
  );
}

export function PhotosPanel({ report, project, locked, suggestions = [] }) {
  const [photos, setPhotos] = useState(null);
  const [viewIdx, setViewIdx] = useState(null);
  const [progress, setProgress] = useState(null);
  const cam = useRef(null); const gal = useRef(null);
  const load = async () => setPhotos(await listPhotos(report.id));
  useEffect(() => { load(); return onDBChange((s) => { if (s.has('photos')) load(); }); }, [report.id]);

  const onFiles = async (files) => {
    setProgress(0);
    const saved = await addPhotos(files, report, project, setProgress);
    setProgress(null);
    if (saved.length) toast(`${saved.length} photo${saved.length > 1 ? 's' : ''} added · ${bytesLabel(saved.reduce((s, p) => s + p.size, 0))}`, { type: 'ok' });
  };
  if (!photos) return <Spinner />;
  const total = photos.reduce((s, p) => s + (p.size || 0), 0);
  return (
    <div>
      <div class="card">
        <div class="card-h">
          <h3>Site photographs</h3>
          <span class="small muted">{photos.length} · {bytesLabel(total)}</span>
        </div>
        {!locked && (
          <div class="row" style={{ marginBottom: 12 }}>
            <button class="btn saffron grow" onClick={() => cam.current?.click()}><Icon name="camera" /> Take photo</button>
            <button class="btn secondary grow" onClick={() => gal.current?.click()}><Icon name="image" /> Gallery</button>
          </div>
        )}
        {progress !== null && <div class="progress" style={{ marginBottom: 10 }}><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        <div class="pgrid">
          {photos.map((p, i) => <Thumb key={p.id} p={p} n={i + 1} onClick={() => setViewIdx(i)} />)}
          {!locked && <button class="ph add" onClick={() => cam.current?.click()}><div class="center"><Icon name="plus" /><div>Add</div></div></button>}
        </div>
        {!photos.length && <div class="small muted" style={{ marginTop: 10 }}>Photos are compressed automatically (sharp quality, small size) and saved inside the app – not in your gallery clutter.</div>}
        <div class="tiny muted" style={{ marginTop: 10 }}>Tap a photo to add a caption, reorder, share or delete. Photos marked “hidden” are not put in exports.</div>
      </div>
      <PhotoInputs onFiles={onFiles} cameraRef={cam} galleryRef={gal} />
      {viewIdx !== null && photos[viewIdx] && <Viewer photos={photos} idx={viewIdx} setIdx={setViewIdx} locked={locked} suggestions={suggestions} onClose={() => setViewIdx(null)} />}
    </div>
  );
}

function Thumb({ p, n, onClick }) {
  const url = useBlobURL(p.thumb || p.blob);
  return (
    <button class="ph" onClick={onClick} style={p.excluded ? { opacity: 0.45 } : null}>
      {url && <img src={url} alt={p.caption || `Photo ${n}`} loading="lazy" />}
      <span class="badge">{n}</span>
      {(p.caption || p.excluded) && <span class="cap">{p.excluded ? '(hidden) ' : ''}{p.caption}</span>}
    </button>
  );
}

function Viewer({ photos, idx, setIdx, locked, suggestions, onClose }) {
  const p = photos[idx];
  const url = useBlobURL(p.blob);
  const [cap, setCap] = useState(p.caption || '');
  const timer = useRef(null);
  const closedByBack = useRef(false);
  useEffect(() => setCap(p.caption || ''), [p.id]);
  useEffect(() => {
    // the Android/browser back button closes the viewer
    const done = pushOverlay(() => { closedByBack.current = true; onClose(); });
    return () => { if (!closedByBack.current) done(); };
  }, []);
  const saveCap = (v) => { setCap(v); clearTimeout(timer.current); timer.current = setTimeout(() => put('photos', { ...p, caption: v }), 300); };
  const move = async (dir) => {
    const j = idx + dir; if (j < 0 || j >= photos.length) return;
    const a = photos[idx], b = photos[j];
    await put('photos', { ...a, order: b.order ?? j }); await put('photos', { ...b, order: a.order ?? idx });
    setIdx(j);
  };
  return (
    <div class="viewer">
      <div class="vbar">
        <button class="icon-btn" onClick={onClose}><Icon name="close" /></button>
        <div class="grow small">Photo {idx + 1} of {photos.length}<div class="tiny" style={{ opacity: 0.7 }}>{fmtDateTime(p.takenAt)} · {bytesLabel(p.size)} · {p.width}×{p.height}{p.lat ? ` · ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : ''}</div></div>
        <button class="icon-btn" onClick={() => shareFiles([{ blob: p.blob, filename: `photo_${idx + 1}.jpg` }], { title: p.caption || 'Site photo' })}><Icon name="share" /></button>
        {!locked && <button class="icon-btn" onClick={async () => {
          if (!(await confirmDialog({ title: 'Delete this photo?', message: 'It will move to Trash (Settings → Trash) and can be restored.', okText: 'Delete', danger: true }))) return;
          await softDelete('photos', p.id); if (photos.length <= 1) onClose(); else setIdx(Math.max(0, idx - 1));
        }}><Icon name="trash" /></button>}
      </div>
      {url ? <img src={url} alt="" /> : <div class="grow" />}
      <div class="vfoot">
        <div class="row">
          <button class="icon-btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><Icon name="left" /></button>
          <input class="input grow" placeholder="Caption (e.g. Plaster work – 2nd floor)" value={cap} readOnly={locked} onInput={(e) => saveCap(e.currentTarget.value)} />
          <button class="icon-btn" disabled={idx === photos.length - 1} onClick={() => setIdx(idx + 1)}><Icon name="right" /></button>
        </div>
        {!locked && suggestions.length > 0 && <div class="chips">{[...new Set(suggestions)].slice(0, 12).map((s) => <button key={s} class="chip outline" style={{ color: '#fff', borderColor: '#555' }} onClick={() => saveCap(s)}>{s}</button>)}</div>}
        {!locked && (
          <div class="row" style={{ color: '#fff' }}>
            <button class="btn sm outline" style={{ color: '#fff', borderColor: '#555' }} disabled={idx === 0} onClick={() => move(-1)}>◀ Move</button>
            <button class="btn sm outline" style={{ color: '#fff', borderColor: '#555' }} disabled={idx === photos.length - 1} onClick={() => move(1)}>Move ▶</button>
            <div class="grow" />
            <label class="row small" style={{ gap: 6 }}><input type="checkbox" checked={!p.excluded} onChange={(e) => put('photos', { ...p, excluded: !e.currentTarget.checked })} /> Include in report</label>
          </div>
        )}
      </div>
    </div>
  );
}
