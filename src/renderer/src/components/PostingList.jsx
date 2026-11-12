import { useState } from 'react'
import { call, at, mediaUrl } from '../api'

// Approved versions waiting for the person to post them by hand: copy the words and open the network, post there,
// then mark it posted (with the link, if they have it).
export default function PostingList({ items, notify, compact = false }) {
  if (!items?.length) return null
  return <ol className="posting-list">{items.map((v) => <PostingRow key={v.id} v={v} notify={notify} compact={compact} />)}</ol>
}

function PostingRow({ v, notify, compact }) {
  const [step, setStep] = useState('ready')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const run = (fn) => async () => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(false)
    }
  }
  const media = v.media || []
  return (
    <li className="posting-row">
      <div className="posting-what">
        <span className={`chan ${v.channel}`}>{v.channel_name}</span>
        <strong>{v.post_title || v.title}</strong>
        <span className="mono small dim">{v.planned_for ? at(v.planned_for) : 'Any time'}</span>
      </div>
      {!compact && <p className="posting-text">{(v.text || '').slice(0, 280)}{(v.text || '').length > 280 ? '…' : ''}</p>}
      {!compact && media.length > 0 && <div className="posting-media">{media.map((m) => (m.kind === 'image' ? <img key={m.id} src={mediaUrl(m)} alt={m.alt_text || ''} /> : <span key={m.id} className="chip">▶ {m.name}</span>))}</div>}
      {step === 'ready' ? (
        <div className="posting-actions">
          <button className="btn btn-primary btn-small" disabled={busy} onClick={run(async () => { await call('copyAndOpen', { variant_id: v.id }); setStep('opened'); notify(`Copied. Paste it into ${v.channel_name}${media.length ? ' and add the media' : ''}, post it, then mark it posted.`, 'ok') })}>Copy &amp; open {v.channel_name}</button>
          <button className="btn btn-small" disabled={busy} onClick={() => setStep('opened')}>I posted it</button>
        </div>
      ) : (
        <form className="posting-actions" onSubmit={(e) => { e.preventDefault(); run(async () => { await call('markPosted', { variant_id: v.id, url }); notify('Marked as posted.', 'ok') })() }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste the post's link (optional)" aria-label="Link to the post" maxLength={600} />
          <button className="btn btn-primary btn-small" disabled={busy}>Mark posted</button>
          <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={() => setStep('ready')}>Not yet</button>
        </form>
      )}
    </li>
  )
}
