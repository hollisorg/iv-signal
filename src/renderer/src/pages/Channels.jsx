import PageStage, { PageMetrics } from '../components/PageStage'
import { useEffect, useRef, useState } from 'react'
import { call, useData } from '../api'
import NetworkLogo from '../components/NetworkLogo'
import FacebookConnect from '../components/FacebookConnect'

const NEEDS = { image: 'Needs a picture or video', video: 'Needs a video' }

export default function Channels({ brand, notify }) {
  const [list, reload] = useData('listChannels', { brand_id: brand.id }, [brand.id])
  const [fb] = useData('metaStatus', { brand_id: brand.id }, [brand.id])
  const [open, setOpen] = useState(null)
  const added = (list || []).filter((c) => c.added)
  const current = open && (list || []).find((c) => c.channel === open)
  return (
    <div className="page channels">
      <PageStage kind="channels" title="Networks" kicker="Infinite Variance / Where you post" subtitle="Every account, and how posting works today." />
      <div className="page-context"><p className="eyebrow">{brand.name}</p><PageMetrics items={[[added.length, 'Networks added'], [fb?.connected ? 1 : 0, 'Posting directly'], [(list || []).length - added.length, 'Not added yet']]} /></div>
      <div className="net-grid" data-guide="channels">
        {(list || []).map((c) => {
          const direct = c.channel === 'facebook' && fb?.connected
          return (
            <article key={c.channel} className={`net-tile ${c.added ? 'is-added' : ''}`}>
              <NetworkLogo channel={c.channel} size={40} title={c.name} />
              <div className="net-name">
                <strong>{c.name}</strong>
                <span className="net-sub small dim">
                  {direct ? <span className="net-state is-direct">Direct</span> : c.added ? <span className="net-state">By hand</span> : null}
                  <span>{direct ? fb.page_name : c.added ? c.handle || 'Added' : 'Not added'}</span>
                </span>
              </div>
              <button className="btn btn-small" onClick={() => setOpen(c.channel)} data-guide={c.channel === 'facebook' ? 'facebook-connect' : undefined}>{c.added ? 'Manage' : 'Connect'}</button>
            </article>
          )
        })}
      </div>
      <p className="small dim net-note">Posting is by hand for most networks: Copy &amp; open puts the words on your clipboard and opens the network, then you mark it posted. Facebook Pages can post directly now; the others follow once each network approves the app.</p>
      {current && <NetworkDialog c={current} brand={brand} notify={notify} reload={reload} onClose={() => setOpen(null)} />}
    </div>
  )
}

function NetworkDialog({ c, brand, notify, reload, onClose }) {
  const dialog = useRef(null)
  const [handle, setHandle] = useState(c.handle)
  const [url, setUrl] = useState(c.url)
  const [busy, setBusy] = useState(false)
  useEffect(() => { dialog.current.showModal() }, [])
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await call('saveChannel', { brand_id: brand.id, channel: c.channel, handle, url })
      notify(`${c.name} ${c.added ? 'saved' : 'added'}.`, 'ok')
      reload()
      onClose()
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    try {
      await call('removeChannel', { brand_id: brand.id, channel: c.channel })
      reload()
      onClose()
    } catch (err) {
      notify(err.message)
    }
  }
  return (
    <dialog ref={dialog} className="workspace-dialog net-dialog" onCancel={(e) => { e.preventDefault(); onClose() }}>
      <header className="net-dialog-head">
        <NetworkLogo channel={c.channel} size={52} title={c.name} />
        <div>
          <span className="eyebrow">Infinite Variance / Networks</span>
          <h2>{c.added ? c.name : `Connect ${c.name}`}</h2>
          <p className="small dim">Up to {c.limit.toLocaleString()} characters{c.needs ? `. ${NEEDS[c.needs]}` : ''}.</p>
        </div>
        <button className="btn btn-quiet btn-small net-close" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <section className="net-section">
        <h3>The account</h3>
        <p className="small dim">So Copy &amp; open goes to the right place and the chat knows where you post.</p>
        <form onSubmit={save} className="channel-form">
          <label><span className="small">Handle or page name</span><input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle or page name" maxLength={120} /></label>
          <label><span className="small">Link to the account</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (optional)" maxLength={400} /></label>
          <div className="form-actions">
            <button className="btn btn-small btn-primary" disabled={busy}>{c.added ? 'Save' : `Add ${c.name}`}</button>
            {c.added && c.url && <button type="button" className="btn btn-small" onClick={() => call('openChannel', { channel: c.channel, url: c.url }).catch((e) => notify(e.message))}>Open ↗</button>}
            {c.added && <button type="button" className="btn btn-small btn-quiet" onClick={remove}>Remove</button>}
          </div>
        </form>
      </section>
      <section className="net-section">
        <h3>Posting</h3>
        {c.channel === 'facebook' ? <FacebookConnect brand={brand} notify={notify} embedded /> : <p className="small">By hand for now. When an approved post’s time comes, Copy &amp; open puts its words on your clipboard and opens {c.name}. Direct posting arrives once {c.name} approves the app.</p>}
      </section>
    </dialog>
  )
}
