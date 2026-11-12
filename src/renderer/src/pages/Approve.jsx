import PageStage, { PageMetrics } from '../components/PageStage'
import { call, useData, askAgent, at, mediaUrl } from '../api'
import emptyArt from '../assets/signal-approve.webp'

export default function Approve({ brand, notify, go, openChat }) {
  const [drafts, reload] = useData('listPosts', { brand_id: brand.id, status: 'draft' }, [brand.id])
  const [approved] = useData('listPosts', { brand_id: brand.id, status: 'approved' }, [brand.id])
  const clean = (drafts || []).filter((p) => p.variants.length && !p.blocking)
  const approve = async (ids) => {
    try {
      const r = await call('approvePosts', { ids })
      const no = r.filter((x) => !x.approved)
      if (no.length) notify(no[0].reason)
      else notify(`Approved ${r.length}. Each goes on your posting list when its time comes.`, 'ok')
      reload()
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <div className="page approve">
      <PageStage kind="approve" title="Approve" kicker="Infinite Variance / The final say" subtitle="Nothing goes out without your OK." />
      <div className="page-context"><p className="eyebrow">{brand.name}</p><PageMetrics items={[[drafts?.length ?? '—', 'To review'], [clean.length, 'Ready to approve'], [approved?.length ?? '—', 'Approved']]} /></div>
      <div className="page-toolbar">
        <p className="small dim">Read every version. Approve exactly what goes out; any later edit needs approving again.</p>
        <div className="head-actions">
          {(drafts || []).some((p) => p.blocking) && <button className="btn" onClick={() => (openChat(), askAgent({ text: 'Fix the drafts that can’t be approved yet, and tell me what you changed.' }))}>Ask the chat to fix the issues</button>}
          {clean.length > 1 && <button className="btn btn-primary" onClick={() => approve(clean.map((p) => p.id))}>Approve {clean.length} ready posts</button>}
        </div>
      </div>
      {!drafts ? <p className="dim">Loading…</p> : !drafts.length ? (
        <div className="empty art">
          <img src={emptyArt} alt="" width="200" height="200" />
          <div>
            <p className="empty-title">Nothing waiting for you.</p>
            <p className="dim">Drafts land here for your OK, from you or from the chat.</p>
            <button className="btn" onClick={() => go('create')}>Write a post</button>
          </div>
        </div>
      ) : (
        <div className="drafts">
          {drafts.map((p) => (
            <article key={p.id} className={`draft ${p.blocking ? 'blocked' : ''}`}>
              <header className="draft-head">
                <div><strong>{p.title}</strong>{p.campaign_name && <span className="small dim"> · {p.campaign_name}</span>}</div>
                <span className="mono small dim">{p.variants.length} version{p.variants.length === 1 ? '' : 's'}{p.created_by !== 'person' ? ' · drafted by the chat' : ''}</span>
              </header>
              {!p.variants.length && <p className="dim small">No network versions yet.</p>}
              {p.variants.map((v) => (
                <section key={v.id} className="draft-version">
                  <p className="mono small"><span className={`chan ${v.channel}`}>{v.channel_name}</span> {v.planned_for ? <span className="dim">· {at(v.planned_for)}</span> : <span className="dim">· any time</span>} <span className={v.text.length > v.limit ? 'bad' : 'dim'}>· {v.text.length}/{v.limit}</span></p>
                  <p className="draft-text">{v.text}</p>
                  {v.media.length > 0 && <div className="posting-media">{v.media.map((m) => (m.kind === 'image' ? <img key={m.id} src={mediaUrl(m)} alt={m.alt_text || ''} /> : <span key={m.id} className="chip">▶ {m.name}</span>))}</div>}
                  {v.issues.length > 0 && <ul className="issues">{v.issues.map((i) => <li key={i.text} className={i.level}>{i.text}</li>)}</ul>}
                </section>
              ))}
              <footer className="draft-foot">
                <button className="btn btn-primary" disabled={p.blocking || !p.variants.length} onClick={() => approve([p.id])}>Approve</button>
                <button className="btn" onClick={() => go('create', { post: { id: p.id, title: p.title } })}>Edit</button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
