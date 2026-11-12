import PageStage, { PageMetrics } from '../components/PageStage'
import { useEffect, useState } from 'react'
import { call, useData, askAgent, when } from '../api'

const FIELDS = [
  ['offer', 'What it offers', 'Hand-thrown stoneware mugs, made in small batches in Columbus', 3],
  ['audience', 'Who it’s for', 'Coffee people who buy fewer, better things', 3],
  ['voice', 'How it sounds', 'Warm, plain, a little dry. Short sentences. No hype.', 3],
  ['products', 'Products and prices', 'The 12 oz mug ($38), the travel cup ($44), seconds sale every March', 3],
  ['visual', 'Visual standards', 'Natural light, real hands, earthy backgrounds. No stock photos.', 2],
  ['hashtags', 'Hashtags it uses', '#handmade #stoneware', 1],
  ['goal', 'What it wants from social', 'More newsletter sign-ups and first orders', 1],
  ['location', 'Where it is', 'Columbus, Ohio', 1],
  ['website', 'Website', 'yourbrand.com', 1],
]
const KINDS = [
  ['fact', 'Facts', 'True details: history, materials, people, numbers you can stand behind.'],
  ['voice', 'Voice', 'Words it uses and avoids, how it opens and signs off.'],
  ['rule', 'Rules', 'Always and never. Legal lines, tone lines, topics to stay out of.'],
  ['lesson', 'Lessons', 'What worked and what didn’t, with the evidence.'],
  ['reference', 'References', 'Pages, posts and sources worth keeping.'],
]
const who = (by) => (by === 'person' ? 'You' : by?.startsWith('chat:') ? `The chat (${by.slice(5) === 'claude' ? 'Claude Code' : by.slice(5) === 'codex' ? 'Codex' : 'Hermes'})` : 'An agent')

export default function Brand({ brand, notify, openChat }) {
  const [notes, reloadNotes] = useData('listBrain', { brand_id: brand.id }, [brand.id])
  const [campaigns, reloadCampaigns] = useData('listCampaigns', { brand_id: brand.id }, [brand.id])
  const ask = (text) => (openChat(), askAgent({ text }))
  return (
    <div className="page brand-page">
      <PageStage kind="brand" title="Brand Brain" kicker="Infinite Variance / Remember" subtitle="What your brand knows about itself." />
      <div className="page-context"><p className="eyebrow">{brand.name}</p><PageMetrics items={[[notes?.length ?? '—', 'Notes'], [(brand.profile.prohibited || []).length, 'Never-say rules'], [campaigns?.length ?? '—', 'Campaigns']]} /></div>
      <div className="page-toolbar">
        <p className="small dim">Everything your agent writes starts here. Tell the chat something lasting and it saves it.</p>
        <div className="head-actions">
          {brand.profile.website && <button className="btn" onClick={() => ask('Read my website and suggest Brand Brain notes. Show me before saving.')}>Learn from my website</button>}
          <button className="btn btn-primary" onClick={() => ask('Ask me a few questions to learn how my brand sounds, then save what you learn.')}>Interview me</button>
        </div>
      </div>
      <Profile brand={brand} notify={notify} />
      <NeverSay brand={brand} notify={notify} />
      <Notes brand={brand} notes={notes} reload={reloadNotes} notify={notify} />
      <Campaigns brand={brand} campaigns={campaigns} reload={reloadCampaigns} notify={notify} />
    </div>
  )
}

function Profile({ brand, notify }) {
  const initial = Object.fromEntries(FIELDS.map(([k]) => [k, brand.profile[k] || '']))
  const [v, setV] = useState(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => setV(initial), [brand.id, brand.updated_at])
  const dirty = FIELDS.some(([k]) => (v[k] || '') !== (brand.profile[k] || ''))
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await call('updateBrand', { id: brand.id, profile: v })
      notify('Saved to the Brand Brain.', 'ok')
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel" data-guide="brand-profile">
      <div className="panel-head"><h2>The basics</h2><span className="small dim">Short and specific beats long and general.</span></div>
      <form onSubmit={save}>
        <div className="form-grid two">
          {FIELDS.map(([k, label, hint, rows]) => (
            <label key={k} className={rows > 1 ? 'wide' : ''}>
              <span>{label}</span>
              {rows > 1 ? <textarea rows={rows} value={v[k]} placeholder={hint} onChange={(e) => setV({ ...v, [k]: e.target.value })} maxLength={2000} /> : <input value={v[k]} placeholder={hint} onChange={(e) => setV({ ...v, [k]: e.target.value })} maxLength={400} />}
            </label>
          ))}
        </div>
        <div className="form-actions"><button className="btn btn-primary" disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save the basics'}</button>{dirty && <button type="button" className="btn btn-quiet" onClick={() => setV(initial)}>Undo</button>}</div>
      </form>
    </section>
  )
}

function NeverSay({ brand, notify }) {
  const list = brand.profile.prohibited || []
  const [text, setText] = useState('')
  const save = async (next) => {
    try {
      await call('updateBrand', { id: brand.id, profile: { prohibited: next } })
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <section className="panel" data-guide="brand-never">
      <div className="panel-head"><h2>Never say</h2><span className="small dim">Claims {brand.name} never makes. A draft that says one can’t be approved.</span></div>
      {list.length ? <ul className="never-list">{list.map((p) => <li key={p}><span>“{p}”</span><button className="link-btn" onClick={() => save(list.filter((x) => x !== p))} aria-label={`Remove ${p}`}>Remove</button></li>)}</ul> : <p className="dim small">Nothing yet. Add claims you can’t back up, legal lines, or words that aren’t you (for example “cures”, “guaranteed”, “best in the world”).</p>}
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { save([...list, text.trim()]); setText('') } }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a word or phrase" maxLength={160} aria-label="A phrase the brand never says" />
        <button className="btn" disabled={!text.trim()}>Add</button>
      </form>
    </section>
  )
}

function Notes({ brand, notes, reload, notify }) {
  const [kind, setKind] = useState('fact')
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const shown = (notes || []).filter((n) => n.kind === kind)
  const add = async (e) => {
    e.preventDefault()
    try {
      await call('addBrainNote', { brand_id: brand.id, kind, text, source })
      setText('')
      setSource('')
      reload()
    } catch (err) {
      notify(err.message)
    }
  }
  const remove = async (id) => {
    try {
      await call('removeBrainNote', { id })
      reload()
    } catch (e) {
      notify(e.message)
    }
  }
  const about = KINDS.find((k) => k[0] === kind)
  return (
    <section className="panel" data-guide="brand-notes">
      <div className="panel-head"><h2>Notes</h2><span className="small dim">One lasting thing at a time.</span></div>
      <div className="segmented" role="tablist">
        {KINDS.map(([id, label]) => <button key={id} role="tab" aria-selected={kind === id} className={kind === id ? 'on' : ''} onClick={() => setKind(id)}>{label} <span className="mono small">{(notes || []).filter((n) => n.kind === id).length}</span></button>)}
      </div>
      <p className="small dim">{about[2]}</p>
      {shown.length ? (
        <ul className="brain-notes">
          {shown.map((n) => (
            <li key={n.id}>
              <p>{n.text}</p>
              <span className="mono small dim">{who(n.created_by)} · {when(n.created_at)}{n.source ? ` · ${n.source}` : ''}</span>
              <button className="link-btn" onClick={() => remove(n.id)}>Remove</button>
            </li>
          ))}
        </ul>
      ) : <p className="dim">No {about[1].toLowerCase()} yet.</p>}
      <form className="brain-add" onSubmit={add}>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Add to ${about[1].toLowerCase()}`} maxLength={1500} aria-label="New note" />
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where it came from (optional)" maxLength={300} aria-label="Source" />
        <button className="btn" disabled={!text.trim()}>Save note</button>
      </form>
    </section>
  )
}

function Campaigns({ brand, campaigns, reload, notify }) {
  const [form, setForm] = useState({ name: '', goal: '', starts_on: '', ends_on: '' })
  const create = async (e) => {
    e.preventDefault()
    try {
      await call('createCampaign', { brand_id: brand.id, ...form })
      setForm({ name: '', goal: '', starts_on: '', ends_on: '' })
      reload()
    } catch (err) {
      notify(err.message)
    }
  }
  const setStatus = async (id, status) => {
    try {
      await call('updateCampaign', { id, status })
      reload()
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <section className="panel">
      <div className="panel-head"><h2>Campaigns</h2><span className="small dim">A named push: a launch week, a seasonal offer. Posts can belong to one.</span></div>
      {campaigns?.length ? (
        <ul className="campaign-list">
          {campaigns.map((c) => (
            <li key={c.id}>
              <div><strong>{c.name}</strong><span className="small dim">{c.goal || 'No goal written'}{c.starts_on ? ` · ${c.starts_on}${c.ends_on ? ` to ${c.ends_on}` : ''}` : ''} · {c.post_count} posts</span></div>
              <span className={`chip ${c.status === 'active' ? 'st-interested' : 'st-new'}`}>{c.status}</span>
              <button className="link-btn" onClick={() => setStatus(c.id, c.status === 'active' ? 'paused' : 'active')}>{c.status === 'active' ? 'Pause' : 'Resume'}</button>
              <button className="link-btn" onClick={() => setStatus(c.id, 'archived')}>Archive</button>
            </li>
          ))}
        </ul>
      ) : <p className="dim small">No campaigns yet.</p>}
      <form className="form-grid two" onSubmit={create}>
        <label><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={160} placeholder="Holiday mugs" /></label>
        <label><span>Goal</span><input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} maxLength={1000} placeholder="Sell out the holiday batch" /></label>
        <label><span>Starts</span><input type="date" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></label>
        <label><span>Ends</span><input type="date" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></label>
        <div className="form-actions wide"><button className="btn" disabled={!form.name.trim()}>Start the campaign</button></div>
      </form>
    </section>
  )
}
