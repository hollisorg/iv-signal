import PageStage from '../components/PageStage'
import PostingList from '../components/PostingList'
import { useState } from 'react'
import { askAgent, useData, at } from '../api'

export default function Today({ brand, overview, go, openChat, notify }) {
  const [idea, setIdea] = useState('')
  const [queue] = useData('postingQueue', { brand_id: brand.id }, [brand.id])
  if (!overview) return <div className="page"><p className="dim">Loading…</p></div>
  const c = overview.counts
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const ask = (text, send = false) => (openChat(), askAgent({ text, send }))
  const empty = c.drafts + c.approved === 0

  return (
    <div className="page today">
      <PageStage kind="today" title="What's the signal?" kicker="Infinite Variance / Signal" subtitle="One idea. Every channel. Your voice.">
        <form className="outreach-search signal-ask" onSubmit={(e) => { e.preventDefault(); if (idea.trim()) { ask(`Draft posts for my networks about: ${idea.trim()}`, true); setIdea('') } }}>
          <input aria-label="What do you want to post about?" placeholder="What do you want to post about?" value={idea} onChange={(e) => setIdea(e.target.value)} />
          <button className="btn btn-primary" disabled={!idea.trim()}>Draft it</button>
        </form>
        <button className="hero-chat-link mono" onClick={() => ask('Plan a week of posts for this brand. Ask me anything you need first.')}>Let the chat plan my week <span aria-hidden="true">↗</span></button>
      </PageStage>

      <header className="page-head">
        <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h2 className="dashboard-greeting">{greet}.</h2>
        <p className="lede">
          {empty
            ? `${brand.name} is set up. Tell the chat what you want to say, and it drafts each network's version in your voice.`
            : `${brand.name}: ${c.drafts} draft${c.drafts === 1 ? '' : 's'} waiting, ${c.planned_week} planned this week, ${c.posted_week} posted in the last seven days.`}
        </p>
      </header>

      {overview.profile_missing.length > 0 && (
        <div className="banner">
          <div>
            <strong>Teach the Brand Brain a little more.</strong>
            <p className="small">Missing: {overview.profile_missing.join(', ')}. Everything your agent writes starts from these.</p>
          </div>
          <div className="head-actions">
            <button className="btn" onClick={() => ask('Ask me a few quick questions to fill in my Brand Brain.')}>Fill it in with the chat</button>
            <button className="btn" onClick={() => go('brand')}>Open the Brand Brain</button>
          </div>
        </div>
      )}

      <section className="tiles">
        <Tile n={c.drafts} label="Drafts to approve" hot={c.drafts > 0} onClick={() => go('approve')} />
        <Tile n={c.to_post} label="Ready to post" hot={c.to_post > 0} onClick={() => go('calendar')} />
        <Tile n={c.planned_week} label="Planned this week" onClick={() => go('calendar')} />
        <Tile n={c.posted_week} label="Posted this week" onClick={() => go('calendar')} />
      </section>

      <section className="daily-paths" aria-label="How IV Signal works">
        {[
          ['brand', '01 / Remember', 'Know the brand', 'Voice, offer, rules and lessons, kept in one place.', 'brain'],
          ['create', '02 / Create', 'Write it once', 'One idea, a version for every network.', 'create'],
          ['approve', '03 / Approve', 'Give the final OK', 'Checked against limits and your rules.', 'approve'],
        ].map(([page, step, title, about, art]) => <button key={page} className={`daily-path path-${art}`} onClick={() => go(page)}><span className="eyebrow">{step}</span><strong>{title}</strong><span>{about}</span><i aria-hidden="true">↗</i></button>)}
      </section>

      <section className="panel" data-guide="to-post">
        <div className="panel-head">
          <h2>Ready to post</h2>
          <span className="small dim">Approved and due within a day. Publishing isn't connected yet, so these go out by hand.</span>
        </div>
        {queue?.length ? <PostingList items={queue} notify={notify} brand={brand} /> : (
          <div className="empty">
            <p>Nothing waiting. Approved posts show up here when their time comes.</p>
            {c.drafts > 0 && <button className="btn" onClick={() => go('approve')}>Review {c.drafts} draft{c.drafts === 1 ? '' : 's'}</button>}
          </div>
        )}
      </section>

      {overview.upcoming.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>Coming up</h2><span className="small dim">The next seven days</span></div>
          <ol className="hot-list">
            {overview.upcoming.map((u, i) => (
              <li key={u.id}>
                <button onClick={() => go('create', { post: { id: u.post_id, title: u.title } })}>
                  <span className="rank mono">{String(i + 1).padStart(2, '0')}</span>
                  <span className="hot-who"><span>{u.title}</span><span className="small dim">{u.channel_name}</span></span>
                  <span className={`chip ${u.status === 'approved' ? 'st-interested' : 'st-new'}`}>{u.status === 'approved' ? 'Approved' : 'Draft'}</span>
                  <span className="mono small dim">{at(u.planned_for)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function Tile({ n, label, hot, onClick }) {
  return (
    <button className={`tile ${hot ? 'is-hot' : ''}`} onClick={onClick}>
      <span className="tile-n">{n}</span>
      <span className="tile-label">{label}</span>
    </button>
  )
}
