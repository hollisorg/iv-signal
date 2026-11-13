import { useState } from 'react'
import { call, at, mediaUrl, useData } from '../api'

const FB_MIN_AHEAD = 11 * 60 * 1000

// Approved versions waiting to go out. By hand: copy the words and open the network, post there, then mark it posted.
// Facebook versions, once a Page is connected, can be handed to Facebook instead (scheduled there, or posted now).
export default function PostingList({ items, notify, brand, compact = false }) {
  const [fb] = useData('metaStatus', { brand_id: brand?.id }, [brand?.id])
  if (!items?.length) return null
  return <ol className="posting-list">{items.map((v) => <PostingRow key={v.id} v={v} notify={notify} compact={compact} fb={fb?.connected ? fb : null} />)}</ol>
}

function PostingRow({ v, notify, compact, fb }) {
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
  const toFacebook = fb && v.channel === 'facebook'
  const canSchedule = toFacebook && v.planned_for && Date.parse(v.planned_for) - Date.now() > FB_MIN_AHEAD
  const hasVideo = media.some((m) => m.kind === 'video')
  const failed = v.delivery?.status === 'failed' ? v.delivery : null
  const sendFacebook = (now) => run(async () => {
    await call('publishFacebook', { variant_id: v.id, now })
    notify(now ? `Posted on ${fb.page_name}.` : `Scheduled on ${fb.page_name} for ${at(v.planned_for)}. Facebook posts it even if IV Signal is closed.`, 'ok')
    setStep('ready')
  })
  return (
    <li className="posting-row">
      <div className="posting-what">
        <span className={`chan ${v.channel}`}>{v.channel_name}</span>
        <strong>{v.post_title || v.title}</strong>
        <span className="mono small dim">{v.planned_for ? at(v.planned_for) : 'Any time'}</span>
      </div>
      {!compact && <p className="posting-text">{(v.text || '').slice(0, 280)}{(v.text || '').length > 280 ? '…' : ''}</p>}
      {!compact && media.length > 0 && <div className="posting-media">{media.map((m) => (m.kind === 'image' ? <img key={m.id} src={mediaUrl(m)} alt={m.alt_text || ''} /> : <span key={m.id} className="chip">▶ {m.name}</span>))}</div>}
      {failed && <p className="small posting-failed" role="status">Facebook didn’t take it last time: {failed.error}</p>}
      {step === 'confirm-now' ? (
        <div className="posting-actions" data-guide="facebook-post">
          <span className="small">Post this on <strong>{fb.page_name}</strong> now? It goes public straight away.</span>
          <button className="btn btn-primary btn-small" disabled={busy} onClick={sendFacebook(true)}>Yes, post it now</button>
          <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => setStep('ready')}>Cancel</button>
        </div>
      ) : step === 'ready' ? (
        <div className="posting-actions">
          {toFacebook && !hasVideo && (canSchedule ? (
            <button className="btn btn-primary btn-small" data-guide="facebook-post" disabled={busy} onClick={sendFacebook(false)}>Schedule on Facebook</button>
          ) : (
            <button className="btn btn-primary btn-small" data-guide="facebook-post" disabled={busy} onClick={() => setStep('confirm-now')}>Post now on Facebook…</button>
          ))}
          <button className={`btn btn-small ${toFacebook && !hasVideo ? '' : 'btn-primary'}`} disabled={busy} onClick={run(async () => { await call('copyAndOpen', { variant_id: v.id }); setStep('opened'); notify(`Copied. Paste it into ${v.channel_name}${media.length ? ' and add the media' : ''}, post it, then mark it posted.`, 'ok') })}>Copy &amp; open {v.channel_name}</button>
          <button className="btn btn-small" disabled={busy} onClick={() => setStep('opened')}>I posted it</button>
          {toFacebook && hasVideo && <span className="small dim">Videos go to Facebook by hand for now.</span>}
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

// Facebook posts IV Signal has scheduled on the Page, with a way to take each back.
export function FacebookScheduled({ brand, notify }) {
  const [list, reload] = useData('facebookScheduled', { brand_id: brand.id }, [brand.id])
  const [busy, setBusy] = useState(null)
  if (!list?.length) return null
  const cancel = async (id) => {
    setBusy(id)
    try {
      await call('cancelFacebook', { variant_id: id })
      notify('Taken off Facebook’s schedule. It’s back in your list.', 'ok')
      reload()
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="panel">
    <div className="panel-head"><h2>Waiting on Facebook</h2><span className="small dim">Scheduled on your Page. IV Signal marks each one posted once Facebook puts it up.</span></div>
    <ol className="posting-list">
      {list.map((d) => (
        <li key={d.delivery_id} className="posting-row">
          <div className="posting-what"><span className="chan facebook">Facebook</span><strong>{d.title}</strong><span className="mono small dim">Goes out {at(d.scheduled_for)}</span></div>
          <div className="posting-actions"><span className="chip st-approved">Scheduled on Facebook</span><button className="btn btn-small btn-quiet" disabled={busy === d.variant_id} onClick={() => cancel(d.variant_id)}>Cancel it</button></div>
        </li>
      ))}
    </ol>
    </section>
  )
}
