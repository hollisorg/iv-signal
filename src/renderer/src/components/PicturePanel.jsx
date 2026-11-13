import { useEffect, useState } from 'react'
import { call, useData } from '../api'

const SHAPES = [['square', 'Square'], ['portrait', 'Portrait 4:5'], ['story', 'Story 9:16'], ['landscape', 'Wide 16:9']]
const secs = (iso) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))

// Make a picture with the person's own Codex. Used in the Library, and on a post version (post_id + channel) where the
// finished picture is attached to that version.
export default function PicturePanel({ brand, notify, initial = '', post_id = null, channel = null, onClose }) {
  const [description, setDescription] = useState(initial)
  const [shape, setShape] = useState(channel === 'instagram' ? 'portrait' : channel === 'tiktok' || channel === 'youtube' ? 'story' : 'square')
  const [jobs, reload] = useData('pictureJobs', { brand_id: brand.id }, [brand.id])
  const [, tick] = useState(0)
  const mine = (jobs || []).filter((j) => (post_id ? j.post_id === post_id && j.channel === channel : !j.post_id))
  const running = (jobs || []).some((j) => j.status === 'running')
  useEffect(() => { if (!running) return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t) }, [running])
  const make = async (e) => {
    e.preventDefault()
    try {
      await call('makePicture', { brand_id: brand.id, description, shape, post_id, channel })
      reload()
    } catch (err) {
      notify(err.message)
    }
  }
  return (
    <div className="picture-panel">
      <form onSubmit={make}>
        <label className="field"><span>Describe the picture</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1500} placeholder="Six stoneware mugs cooling on a wooden shelf by a window, morning light" /></label>
        <div className="picture-row">
          <div className="segmented" role="group" aria-label="Shape">{SHAPES.map(([id, label]) => <button type="button" key={id} className={shape === id ? 'on' : ''} aria-pressed={shape === id} onClick={() => setShape(id)}>{label}</button>)}</div>
          <button className="btn btn-primary" disabled={!description.trim() || running}>{running ? 'Making one…' : 'Make it with Codex'}</button>
          {onClose && <button type="button" className="btn btn-quiet" onClick={onClose}>Close</button>}
        </div>
        <p className="small dim">Your own Codex makes it on your ChatGPT plan, in {brand.name}’s visual standards, with no words in it (put the words in the post). It takes a minute or a few.</p>
      </form>
      {mine.length > 0 && (
        <ul className="picture-jobs">
          {mine.slice(0, 4).map((j) => (
            <li key={j.id} className={`st-${j.status}`}>
              <span className="mono small">{j.status === 'running' ? `Making… ${secs(j.startedAt)} s` : j.status === 'done' ? (post_id ? 'Added to this version' : 'In the library') : 'Didn’t work'}</span>
              <span className="small">{j.description.slice(0, 90)}</span>
              {j.error && <span className="small bad">{j.error}</span>}
              {j.status !== 'running' && <button className="link-btn" onClick={async () => { await call('clearPictureJob', { id: j.id }); reload() }}>Clear</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
