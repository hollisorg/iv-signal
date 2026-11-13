import { useEffect, useRef, useState } from 'react'
import { call, useData, CHANNELS } from '../api'

// Choose posts and save them as one page a client can open anywhere; they reply with what they approve.
export default function ApprovalPackDialog({ brand, notify, onClose }) {
  const dialog = useRef(null)
  const [drafts] = useData('listPosts', { brand_id: brand.id, status: 'draft' }, [brand.id])
  const [approved] = useData('listPosts', { brand_id: brand.id, status: 'approved' }, [brand.id])
  const all = [...(drafts || []), ...(approved || [])]
  const [picked, setPicked] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { dialog.current.showModal() }, [])
  const chosen = picked ?? (drafts || []).filter((p) => !p.blocking).map((p) => p.id)
  const toggle = (id) => setPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])
  const save = async () => {
    setBusy(true)
    try {
      const r = await call('approvalPack', { brand_id: brand.id, post_ids: chosen, note })
      if (r) { notify(`Saved ${r.posts} post${r.posts === 1 ? '' : 's'} for approval. Send the file to your client.`, 'ok'); onClose() }
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog ref={dialog} className="workspace-dialog pack-dialog" onCancel={(e) => { e.preventDefault(); onClose() }}>
      <span className="eyebrow">Infinite Variance / Share for approval</span>
      <h2>Send posts for approval</h2>
      <p className="small dim">IV Signal saves one web page with the posts, their pictures and planned times. Email it or send it in a chat; your client replies with what they approve, and you approve it here.</p>
      <ul className="studio-list">
        {all.map((p) => (
          <li key={p.id}>
            <label>
              <input type="checkbox" checked={chosen.includes(p.id)} onChange={() => toggle(p.id)} />
              <span className="studio-label">{p.title}</span>
              <span className="mono small dim">{p.variants.map((v) => CHANNELS[v.channel]).join(' · ')} · {p.status === 'approved' ? 'Approved' : p.blocking ? 'Needs fixes' : 'Draft'}</span>
            </label>
          </li>
        ))}
        {!all.length && <li className="dim small">No drafts or approved posts yet.</li>}
      </ul>
      <label className="field"><span>A note for them (optional)</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Here’s next week. Reply with the numbers you’re happy with." /></label>
      <footer>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !chosen.length} onClick={save}>{busy ? 'Saving…' : `Save ${chosen.length} for approval`}</button>
      </footer>
    </dialog>
  )
}
