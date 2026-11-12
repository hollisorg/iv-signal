import PageStage, { PageMetrics } from '../components/PageStage'
import { useEffect, useState } from 'react'
import { call, useData, askAgent, at, when, toLocalInput, fromLocalInput, CHANNELS, mediaUrl } from '../api'

const STATUS = { draft: 'Draft', approved: 'Approved', archived: 'Archived' }

export default function Create({ brand, post, setPost, notify, openChat }) {
  const [filter, setFilter] = useState('draft')
  const [posts, reload] = useData('listPosts', { brand_id: brand.id, status: filter === 'all' ? undefined : filter }, [brand.id, filter])
  const [open] = useData('getPost', { id: post?.id || '__none__' }, [post?.id])
  const current = post?.id && open && open.brand_id === brand.id ? open : null
  useEffect(() => { if (current && current.title !== post.title) setPost({ id: current.id, title: current.title }) }, [current?.title])
  return (
    <div className="page create">
      <PageStage kind="create" title="Create" kicker="Infinite Variance / Write it once" subtitle="One idea, a version for every network." />
      <div className="page-context"><p className="eyebrow">{brand.name}</p><PageMetrics items={[[posts?.length ?? '—', filter === 'all' ? 'Posts' : `${STATUS[filter] || ''} posts`], [current ? current.variants.length : '—', 'Versions open'], [current ? (current.approved ? 'Yes' : 'No') : '—', 'Approved']]} /></div>
      <div className="create-layout">
        <aside className="post-list" aria-label="Posts">
          <button className={`post-new ${!current ? 'on' : ''}`} onClick={() => setPost(null)}>＋ New post</button>
          <div className="segmented small-seg" role="tablist">
            {[['draft', 'Drafts'], ['approved', 'Approved'], ['archived', 'Archived'], ['all', 'All']].map(([id, label]) => <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}</button>)}
          </div>
          {!posts ? <p className="dim small">Loading…</p> : !posts.length ? <p className="dim small">Nothing here yet.</p> : (
            <ul>
              {posts.map((p) => (
                <li key={p.id}>
                  <button className={current?.id === p.id ? 'on' : ''} onClick={() => setPost({ id: p.id, title: p.title })}>
                    <strong>{p.title}</strong>
                    <span className="small dim">{p.variants.map((v) => CHANNELS[v.channel]).join(' · ') || 'No networks yet'}</span>
                    <span className="mono small">{p.blocking ? <span className="bad">Needs fixes</span> : STATUS[p.status]} · {when(p.updated_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="post-editor" data-guide="composer">
          {current ? <Editor key={current.id} post={current} brand={brand} notify={notify} onChanged={reload} close={() => setPost(null)} openChat={openChat} /> : <Composer brand={brand} notify={notify} onCreated={(p) => { setFilter('draft'); setPost({ id: p.id, title: p.title }); reload() }} openChat={openChat} />}
        </section>
      </div>
    </div>
  )
}

function useChannels(brand) {
  const [list] = useData('listChannels', { brand_id: brand.id }, [brand.id])
  return list || []
}

function Composer({ brand, notify, onCreated, openChat }) {
  const channels = useChannels(brand)
  const [campaigns] = useData('listCampaigns', { brand_id: brand.id }, [brand.id])
  const [idea, setIdea] = useState('')
  const [title, setTitle] = useState('')
  const [campaign, setCampaign] = useState('')
  const [picked, setPicked] = useState(null)
  const chosen = picked ?? channels.filter((c) => c.added).map((c) => c.channel)
  const toggle = (c) => setPicked(chosen.includes(c) ? chosen.filter((x) => x !== c) : [...chosen, c])
  const names = chosen.map((c) => CHANNELS[c]).join(', ')
  const blank = async () => {
    try {
      const p = await call('createPost', { brand_id: brand.id, title: title || idea.slice(0, 80), idea, campaign_id: campaign || null, variants: chosen.map((channel) => ({ channel, text: idea })) })
      onCreated(p)
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <div className="composer-new">
      <h2>New post</h2>
      <label className="field"><span>The idea</span><textarea rows={5} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Our holiday batch is out of the kiln: 40 mugs, two new glazes. Opens Friday at 9." maxLength={4000} /></label>
      <div className="form-grid two">
        <label><span>Title (optional)</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Holiday batch is out" /></label>
        <label><span>Campaign (optional)</span><select value={campaign} onChange={(e) => setCampaign(e.target.value)}><option value="">None</option>{(campaigns || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </div>
      <p className="field-label">Networks</p>
      <div className="channel-picks" role="group" aria-label="Networks">
        {Object.entries(CHANNELS).map(([c, name]) => <button key={c} type="button" aria-pressed={chosen.includes(c)} className={chosen.includes(c) ? 'on' : ''} onClick={() => toggle(c)}>{name}</button>)}
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={!idea.trim() || !chosen.length} onClick={() => (openChat(), askAgent({ text: `Draft one post from this idea, with a version for ${names}, in my brand's voice:\n\n${idea.trim()}${campaign ? `\n\n(It belongs to the campaign "${campaigns.find((c) => c.id === campaign)?.name}".)` : ''}`, send: true }))}>Write the versions with the chat</button>
        <button className="btn" disabled={!idea.trim() || !chosen.length} onClick={blank}>Start them myself</button>
      </div>
      <p className="small dim">Either way you'll see every version here before anything is approved.</p>
    </div>
  )
}

function Editor({ post, brand, notify, onChanged, close, openChat }) {
  const [title, setTitle] = useState(post.title)
  const [media] = useData('listMedia', { brand_id: brand.id }, [brand.id])
  const [adding, setAdding] = useState(false)
  const run = (fn, ok) => async () => {
    try {
      await fn()
      if (ok) notify(ok, 'ok')
      onChanged()
    } catch (e) {
      notify(e.message)
    }
  }
  const missing = Object.keys(CHANNELS).filter((c) => !post.variants.some((v) => v.channel === c))
  const blocks = post.variants.flatMap((v) => v.issues.filter((i) => i.level === 'block'))
  return (
    <div className="editor">
      <header className="editor-head">
        <input className="editor-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== post.title && run(() => call('updatePost', { id: post.id, title }))()} aria-label="Post title" maxLength={200} />
        <span className={`chip ${post.approved ? 'st-interested' : post.status === 'archived' ? 'st-suppressed' : 'st-new'}`}>{post.approved ? 'Approved' : STATUS[post.status]}</span>
      </header>
      {post.idea && <p className="small dim editor-idea">Idea: {post.idea}</p>}
      {post.campaign_name && <p className="mono small dim">Campaign: {post.campaign_name}</p>}
      <div className="variants" data-guide="checks">
        {post.variants.map((v) => <Variant key={v.id + v.updated_at} v={v} post={post} media={media || []} notify={notify} onChanged={onChanged} />)}
      </div>
      {missing.length > 0 && post.status !== 'archived' && (
        adding ? (
          <div className="channel-picks">{missing.map((c) => <button key={c} onClick={run(async () => { await call('setVariant', { post_id: post.id, channel: c, text: post.variants[0]?.text || post.idea || '' }); setAdding(false) })}>＋ {CHANNELS[c]}</button>)}<button className="btn btn-quiet btn-small" onClick={() => setAdding(false)}>Done</button></div>
        ) : <button className="btn btn-small" onClick={() => setAdding(true)}>＋ Add a network</button>
      )}
      <footer className="editor-foot">
        {post.status === 'archived' ? (
          <button className="btn" onClick={run(() => call('archivePost', { id: post.id, restore: true }), 'Restored as a draft.')}>Restore</button>
        ) : (
          <>
            {!post.approved && <button className="btn btn-primary" disabled={!post.variants.length || blocks.length > 0} title={blocks.length ? 'Fix the issues marked in red first' : ''} onClick={run(async () => { const [r] = await call('approvePosts', { ids: [post.id] }); if (!r.approved) throw new Error(r.reason) }, 'Approved. It’s on your posting list when its time comes.')}>Approve this post</button>}
            <button className="btn" onClick={() => (openChat(), askAgent({ text: 'Improve this post: keep the facts, tighten the words, and check every version against my Brand Brain.' }))}>Improve with the chat</button>
            <button className="btn btn-quiet" onClick={run(async () => { await call('archivePost', { id: post.id }); close() }, 'Archived.')}>Archive</button>
          </>
        )}
      </footer>
    </div>
  )
}

function Variant({ v, post, media, notify, onChanged }) {
  const [text, setText] = useState(v.text)
  const [alt, setAlt] = useState(v.alt_text || '')
  const [when_, setWhen] = useState(toLocalInput(v.planned_for))
  const [picking, setPicking] = useState(false)
  const posted = v.status === 'posted'
  const locked = posted || post.status === 'archived'
  const dirty = text !== v.text || alt !== (v.alt_text || '') || fromLocalInput(when_) !== (v.planned_for ? new Date(v.planned_for).toISOString() : null)
  const save = async (patch = {}) => {
    try {
      await call('setVariant', { post_id: post.id, channel: v.channel, text, alt_text: alt, planned_for: fromLocalInput(when_), ...patch })
      onChanged()
    } catch (e) {
      notify(e.message)
    }
  }
  const toggleMedia = (id) => save({ media_ids: v.media_ids.includes(id) ? v.media_ids.filter((m) => m !== id) : [...v.media_ids, id] })
  const over = text.length > v.limit
  return (
    <article className={`variant ${v.issues.some((i) => i.level === 'block') ? 'blocked' : ''}`}>
      <header>
        <span className={`chan ${v.channel}`}>{v.channel_name}</span>
        <span className={`mono small ${over ? 'bad' : 'dim'}`}>{text.length.toLocaleString()} / {v.limit.toLocaleString()}</span>
        {posted ? <span className="chip st-interested">Posted{v.posted_url ? '' : ' by hand'}</span> : v.status === 'skipped' ? <span className="chip">Skipped</span> : null}
      </header>
      <textarea value={text} disabled={locked} rows={Math.min(14, Math.max(4, Math.ceil(text.length / 70) + text.split('\n').length))} onChange={(e) => setText(e.target.value)} aria-label={`${v.channel_name} version`} />
      <div className="variant-media">
        {v.media.map((m) => <figure key={m.id}>{m.kind === 'image' ? <img src={mediaUrl(m)} alt={m.alt_text || ''} /> : <span className="video-tile">▶</span>}<figcaption className="small">{m.name}</figcaption>{!locked && <button className="link-btn" onClick={() => toggleMedia(m.id)}>Remove</button>}</figure>)}
        {!locked && <button className="btn btn-small" onClick={() => setPicking(!picking)}>{picking ? 'Done' : '＋ Picture or video'}</button>}
      </div>
      {picking && (
        <div className="media-pick">
          {media.length ? media.map((m) => <button key={m.id} className={v.media_ids.includes(m.id) ? 'on' : ''} onClick={() => toggleMedia(m.id)} title={m.name}>{m.kind === 'image' ? <img src={mediaUrl(m)} alt="" /> : <span className="video-tile">▶</span>}</button>) : <p className="small dim">The library is empty. Add pictures and videos on the Library page.</p>}
        </div>
      )}
      <div className="form-grid two">
        {v.media.some((m) => m.kind === 'image') && <label className="wide"><span>Picture description (alt text)</span><input value={alt} disabled={locked} onChange={(e) => setAlt(e.target.value)} maxLength={1000} placeholder="A blue mug on a wooden table by a window" /></label>}
        <label><span>Planned for</span><input type="datetime-local" value={when_} disabled={locked} onChange={(e) => setWhen(e.target.value)} /></label>
        <div className="variant-when small dim">{v.planned_for ? `Goes on the posting list ${at(v.planned_for)}` : 'No time: it’s ready to post as soon as it’s approved.'}</div>
      </div>
      {v.issues.length > 0 && <ul className="issues">{v.issues.map((i) => <li key={i.text} className={i.level}>{i.text}</li>)}</ul>}
      {!locked && (
        <footer className="variant-foot">
          {dirty && <button className="btn btn-primary btn-small" onClick={() => save()}>Save {v.channel_name}</button>}
          {dirty && <button className="btn btn-quiet btn-small" onClick={() => { setText(v.text); setAlt(v.alt_text || ''); setWhen(toLocalInput(v.planned_for)) }}>Undo</button>}
          {post.approved && !dirty && v.status === 'approved' && <button className="btn btn-quiet btn-small" onClick={async () => { try { await call('skipVariant', { variant_id: v.id }); onChanged() } catch (e) { notify(e.message) } }}>Skip this network</button>}
          {!post.approved && <button className="btn btn-quiet btn-small" onClick={async () => { try { await call('removeVariant', { post_id: post.id, channel: v.channel }); onChanged() } catch (e) { notify(e.message) } }}>Remove {v.channel_name}</button>}
          {post.approved && dirty && <span className="small dim">Saving withdraws the approval.</span>}
        </footer>
      )}
    </article>
  )
}
