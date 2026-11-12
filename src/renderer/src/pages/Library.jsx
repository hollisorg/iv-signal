import PageStage, { PageMetrics } from '../components/PageStage'
import { useState } from 'react'
import { call, useData, askAgent, mediaUrl } from '../api'
import emptyArt from '../assets/signal-library.webp'

const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export default function Library({ brand, notify, openChat }) {
  const [kind, setKind] = useState('')
  const [media, reload] = useData('listMedia', { brand_id: brand.id, kind: kind || undefined }, [brand.id, kind])
  const [over, setOver] = useState(false)
  const add = async () => {
    try {
      const added = await call('importMedia', { brand_id: brand.id })
      if (added?.length) notify(`Added ${added.length} file${added.length === 1 ? '' : 's'}.`, 'ok')
      reload()
    } catch (e) {
      notify(e.message)
    }
  }
  const drop = async (e) => {
    e.preventDefault()
    setOver(false)
    const paths = [...e.dataTransfer.files].map((f) => window.ivsignal.pathFor(f)).filter(Boolean)
    let n = 0
    for (const path of paths.slice(0, 30)) {
      try {
        await call('importMediaPath', { brand_id: brand.id, path })
        n += 1
      } catch (err) {
        notify(err.message)
      }
    }
    if (n) notify(`Added ${n} file${n === 1 ? '' : 's'}.`, 'ok')
    reload()
  }
  const missingAlt = (media || []).filter((m) => m.kind === 'image' && !m.alt_text).length
  return (
    <div className={`page library ${over ? 'drop-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <PageStage kind="library" title="Library" kicker="Infinite Variance / Your pictures" subtitle="Everything your posts show, kept safe on this PC." />
      <div className="page-context"><p className="eyebrow">{brand.name}</p><PageMetrics items={[[media?.length ?? '—', 'Files'], [missingAlt, 'Need a description'], [(media || []).filter((m) => m.used_in).length, 'In use']]} /></div>
      <div className="page-toolbar">
        <div className="segmented" role="tablist">{[['', 'All'], ['image', 'Pictures'], ['video', 'Videos']].map(([id, label]) => <button key={id} role="tab" aria-selected={kind === id} className={kind === id ? 'on' : ''} onClick={() => setKind(id)}>{label}</button>)}</div>
        <div className="head-actions">
          {missingAlt > 0 && <button className="btn" onClick={() => (openChat(), askAgent({ text: 'Suggest picture descriptions (alt text) for the pictures in my library that don’t have one. Show me before saving.' }))}>Describe pictures with the chat</button>}
          <button className="btn btn-primary" onClick={add}>Add pictures or videos</button>
        </div>
      </div>
      <p className="small dim">Drop files anywhere on this page. IV Signal keeps its own copy, so a post shows exactly what you approved.</p>
      {!media ? <p className="dim">Loading…</p> : !media.length ? (
        <div className="empty art"><img src={emptyArt} alt="" width="200" height="200" /><div><p className="empty-title">Nothing here yet.</p><p className="dim">Add the photos and videos your posts will use. Instagram and Pinterest need a picture; TikTok and YouTube need a video.</p><button className="btn" onClick={add}>Add files</button></div></div>
      ) : (
        <div className="media-grid" data-guide="library">{media.map((m) => <MediaCard key={m.id + (m.alt_text || '')} m={m} notify={notify} reload={reload} />)}</div>
      )}
    </div>
  )
}

function MediaCard({ m, notify, reload }) {
  const [alt, setAlt] = useState(m.alt_text || '')
  const run = (fn) => async () => {
    try {
      await fn()
      reload()
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <figure className="media-card">
      {m.kind === 'image' ? <img src={mediaUrl(m)} alt={m.alt_text || ''} loading="lazy" /> : <video src={mediaUrl(m)} preload="metadata" muted controls />}
      <figcaption>
        <strong title={m.name}>{m.name}</strong>
        <span className="mono small dim">{m.kind === 'image' ? 'Picture' : 'Video'}{m.width ? ` · ${m.width}×${m.height}` : ''} · {mb(m.bytes)} · {m.used_in ? `in ${m.used_in} post${m.used_in === 1 ? '' : 's'}` : 'not used yet'}</span>
        {m.kind === 'image' && <input value={alt} onChange={(e) => setAlt(e.target.value)} onBlur={() => alt !== (m.alt_text || '') && run(() => call('updateMedia', { id: m.id, alt_text: alt }))()} placeholder="Describe the picture (alt text)" maxLength={1000} aria-label={`Description of ${m.name}`} />}
        <div className="media-actions"><button className="link-btn" onClick={run(() => call('revealMedia', { id: m.id }))}>Show file</button>{!m.used_in && <button className="link-btn" onClick={run(() => call('removeMedia', { id: m.id }))}>Remove</button>}</div>
      </figcaption>
    </figure>
  )
}
