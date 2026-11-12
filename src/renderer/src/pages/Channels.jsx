import PageStage, { PageMetrics } from '../components/PageStage'
import { useState } from 'react'
import { call, useData } from '../api'

const NEEDS = { image: 'needs a picture or video', video: 'needs a video' }

export default function Channels({ brand, notify }) {
  const [list, reload] = useData('listChannels', { brand_id: brand.id }, [brand.id])
  const added = (list || []).filter((c) => c.added)
  return (
    <div className="page channels">
      <PageStage kind="channels" title="Networks" kicker="Infinite Variance / Where you post" subtitle="Every account, and how posting works today." />
      <div className="page-context"><p className="eyebrow">{brand.name}</p><PageMetrics items={[[added.length, 'Networks added'], ['By hand', 'How posts go out'], ['Later', 'Direct publishing']]} /></div>
      <div className="banner">
        <div>
          <strong>Posting is by hand for now.</strong>
          <p className="small">When an approved post’s time comes, Copy &amp; open puts its words on your clipboard and opens the network. Paste, add the picture, post, then mark it posted. Publishing straight from IV Signal arrives once each network approves the app.</p>
        </div>
      </div>
      <div className="connect-grid" data-guide="channels">
        {(list || []).map((c) => <ChannelCard key={c.channel} c={c} brand={brand} notify={notify} reload={reload} />)}
      </div>
    </div>
  )
}

function ChannelCard({ c, brand, notify, reload }) {
  const [editing, setEditing] = useState(false)
  const [handle, setHandle] = useState(c.handle)
  const [url, setUrl] = useState(c.url)
  const save = async (e) => {
    e.preventDefault()
    try {
      await call('saveChannel', { brand_id: brand.id, channel: c.channel, handle, url })
      setEditing(false)
      reload()
    } catch (err) {
      notify(err.message)
    }
  }
  const remove = async () => {
    try {
      await call('removeChannel', { brand_id: brand.id, channel: c.channel })
      reload()
    } catch (err) {
      notify(err.message)
    }
  }
  return (
    <article className={`connect-card ${c.added ? 'is-added' : ''}`}>
      <header><span className={`chan ${c.channel}`}>{c.name}</span>{c.added && <span className="chip st-interested">Added</span>}</header>
      <p className="small dim">Up to {c.limit.toLocaleString()} characters{c.needs ? `, ${NEEDS[c.needs]}` : ''}.</p>
      {editing || !c.added ? (
        <form onSubmit={save} className="channel-form">
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle or page name" maxLength={120} aria-label={`${c.name} handle`} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link to the account (optional)" maxLength={400} aria-label={`${c.name} link`} />
          <div className="form-actions"><button className="btn btn-small btn-primary">{c.added ? 'Save' : `Add ${c.name}`}</button>{editing && <button type="button" className="btn btn-small btn-quiet" onClick={() => setEditing(false)}>Cancel</button>}</div>
        </form>
      ) : (
        <>
          <p><strong>{c.handle || 'No handle saved'}</strong></p>
          <div className="form-actions">
            {c.url && <button className="btn btn-small" onClick={() => call('openChannel', { channel: c.channel, url: c.url }).catch((e) => notify(e.message))}>Open ↗</button>}
            <button className="btn btn-small" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn btn-small btn-quiet" onClick={remove}>Remove</button>
          </div>
        </>
      )}
    </article>
  )
}
