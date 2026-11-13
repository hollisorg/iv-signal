import { useState } from 'react'
import { call, useData, askAgent, when } from '../api'

const METRICS = [['reach', 'Reach'], ['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares'], ['saves', 'Saves'], ['clicks', 'Clicks']]
const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString())

// Posted versions and how they did. Numbers go in by hand (or the chat records them); "Learn from these" asks the chat
// to turn clear patterns into Brand Brain lessons that cite the numbers.
export default function ResultsPanel({ brand, notify, openChat }) {
  const [posted, reload] = useData('postedWithResults', { brand_id: brand.id }, [brand.id])
  const [open, setOpen] = useState(null)
  if (!posted?.length) return null
  const withNumbers = posted.filter((p) => p.latest).length
  return (
    <section className="panel" data-guide="results">
      <div className="panel-head">
        <h2>How they did</h2>
        <span className="small dim">{withNumbers} of {posted.length} posted versions have results</span>
      </div>
      <div className="head-actions results-actions">
        <button className="btn" disabled={withNumbers < 2} title={withNumbers < 2 ? 'Add results to at least two posts first' : ''} onClick={() => (openChat(), askAgent({ text: 'Look at the results of my posted posts. Tell me what worked and what didn’t, citing the numbers, then save the clear lessons to my Brand Brain.', send: true }))}>Learn from these</button>
      </div>
      <ul className="results-list">
        {posted.map((v) => (
          <li key={v.id}>
            <div className="results-row">
              <span className={`chan ${v.channel}`}>{v.channel_name}</span>
              <strong>{v.title}</strong>
              <span className="mono small dim">posted {when(v.posted_at)}</span>
              {v.posted_url && <a className="link-btn" href={v.posted_url} onClick={(e) => { e.preventDefault(); call('openChannel', { channel: v.channel, url: v.posted_url }).catch((err) => notify(err.message)) }}>Open ↗</a>}
              <button className="btn btn-small" onClick={() => setOpen(open === v.id ? null : v.id)}>{v.latest ? 'Update results' : 'Add results'}</button>
            </div>
            {v.latest && <p className="mono small results-numbers">{METRICS.filter(([k]) => v.latest[k] !== null).map(([k, label]) => `${label} ${fmt(v.latest[k])}`).join(' · ') || 'Notes only'}{v.latest.notes ? ` · ${v.latest.notes}` : ''} <span className="dim">({when(v.latest.measured_at)})</span></p>}
            {open === v.id && <ResultsForm v={v} notify={notify} done={() => { setOpen(null); reload() }} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ResultsForm({ v, notify, done }) {
  const [values, setValues] = useState(Object.fromEntries(METRICS.map(([k]) => [k, v.latest?.[k] ?? ''])))
  const [notes, setNotes] = useState('')
  const save = async (e) => {
    e.preventDefault()
    try {
      await call('recordResults', { variant_id: v.id, ...values, notes })
      notify('Results saved.', 'ok')
      done()
    } catch (err) {
      notify(err.message)
    }
  }
  return (
    <form className="results-form" onSubmit={save}>
      {METRICS.map(([k, label]) => <label key={k}><span>{label}</span><input inputMode="numeric" value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })} aria-label={`${label} for ${v.channel_name}`} /></label>)}
      <label className="wide"><span>Notes (optional)</span><input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Three people asked about the travel cup" /></label>
      <div className="form-actions wide"><button className="btn btn-primary">Save results</button><button type="button" className="btn btn-quiet" onClick={done}>Cancel</button></div>
    </form>
  )
}
