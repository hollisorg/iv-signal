import { useEffect, useRef, useState } from 'react'
import { call, when } from '../api'

const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

// Pick finished shots, pictures and exported edits from IV Studio and copy them into this brand's library.
export default function IvStudioDialog({ brand, notify, onClose, onAdded }) {
  const dialog = useRef(null)
  const [list, setList] = useState(null)
  const [previews, setPreviews] = useState(false)
  const [picked, setPicked] = useState([])
  const [group, setGroup] = useState('All')
  const [busy, setBusy] = useState(false)
  useEffect(() => { dialog.current.showModal() }, [])
  useEffect(() => {
    setList(null)
    call('ivStudioRenders', { previews, limit: 150 }).then(setList, (e) => { notify(e.message); setList({ items: [], installed: false }) })
  }, [previews])
  const groups = ['All', ...new Set((list?.items || []).map((i) => i.group))]
  const shown = (list?.items || []).filter((i) => group === 'All' || i.group === group)
  const toggle = (p) => setPicked(picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p].slice(-20))
  const add = async () => {
    setBusy(true)
    try {
      const added = await call('importFromIvStudio', { brand_id: brand.id, paths: picked })
      notify(`Added ${added.length} from IV Studio.`, 'ok')
      onAdded()
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog ref={dialog} className="workspace-dialog iv-studio-dialog" onCancel={(e) => { e.preventDefault(); onClose() }}>
      <span className="eyebrow">Infinite Variance / From IV Studio</span>
      <h2>Bring in IV Studio work</h2>
      {!list ? <p className="dim">Asking IV Studio…</p> : !list.installed && !list.items.length ? (
        <p className="dim">IV Studio isn’t installed on this PC. It’s free at infinitevariance.ai/downloads.</p>
      ) : (
        <>
          <div className="picture-row">
            <div className="segmented small-seg" role="tablist">{groups.map((g) => <button key={g} role="tab" aria-selected={group === g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{g}</button>)}</div>
            <label className="small dim"><input type="checkbox" checked={previews} onChange={(e) => setPreviews(e.target.checked)} /> Include preview takes</label>
          </div>
          {!list.reachable && list.installed && <p className="small dim">IV Studio didn’t answer, so only its exported edits, sizzles and trailers are listed.</p>}
          <ul className="studio-list">
            {shown.map((i) => (
              <li key={i.path}>
                <label>
                  <input type="checkbox" checked={picked.includes(i.path)} onChange={() => toggle(i.path)} />
                  <span className={`chip ${i.kind === 'video' ? 'st-interested' : ''}`}>{i.kind === 'video' ? 'Video' : 'Picture'}</span>
                  <span className="studio-label">{i.label}</span>
                  <span className="mono small dim">{i.group} · {mb(i.bytes)} · {when(i.at)}</span>
                </label>
              </li>
            ))}
            {!shown.length && <li className="dim small">Nothing here.</li>}
          </ul>
        </>
      )}
      <footer>
        <button className="btn" onClick={onClose} disabled={busy}>Close</button>
        <button className="btn btn-primary" disabled={busy || !picked.length} onClick={add}>{busy ? 'Copying…' : `Add ${picked.length || ''} to the library`}</button>
      </footer>
    </dialog>
  )
}
