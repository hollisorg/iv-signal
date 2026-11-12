import PageStage, { PageMetrics } from '../components/PageStage'
import PostingList from '../components/PostingList'
import { useState } from 'react'
import { useData, askAgent } from '../api'

const DAY = 864e5
const startOfWeek = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const WEEKS = 4

export default function Calendar({ brand, go, notify, openChat }) {
  const [offset, setOffset] = useState(0)
  const first = new Date(startOfWeek(new Date()).getTime() + offset * 7 * DAY)
  const last = new Date(first.getTime() + WEEKS * 7 * DAY)
  const [cal] = useData('calendar', { brand_id: brand.id, from: first.toISOString(), to: last.toISOString() }, [brand.id, offset])
  const [queue] = useData('postingQueue', { brand_id: brand.id }, [brand.id])
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i))
  const items = cal?.items || []
  const today = new Date()
  return (
    <div className="page calendar">
      <PageStage kind="calendar" title="Calendar" kicker="Infinite Variance / When it goes out" subtitle="Every network, every day, at a glance." />
      <div className="page-context"><p className="eyebrow">{brand.name}</p><PageMetrics items={[[items.length, `Planned in ${WEEKS} weeks`], [items.filter((i) => i.status === 'posted').length, 'Posted'], [queue?.length ?? '—', 'Ready to post']]} /></div>

      {queue?.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>Ready to post</h2><span className="small dim">Publishing isn't connected yet: copy, open, post, then mark it posted.</span></div>
          <PostingList items={queue} notify={notify} />
        </section>
      )}

      <div className="page-toolbar">
        <div className="head-actions">
          <button className="btn btn-small" onClick={() => setOffset(offset - 1)} aria-label="Earlier week">←</button>
          <button className="btn btn-small" onClick={() => setOffset(0)} disabled={offset === 0}>This week</button>
          <button className="btn btn-small" onClick={() => setOffset(offset + 1)} aria-label="Later week">→</button>
          <span className="mono small dim">{first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(last.getTime() - DAY).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
        <button className="btn" onClick={() => (openChat(), askAgent({ text: 'Plan posting times for my unplanned drafts over the next two weeks. Suggest times, then save them when I agree.' }))}>Plan my drafts with the chat</button>
      </div>

      <div className="cal-grid" data-guide="calendar" role="grid" aria-label={`${WEEKS} weeks of posts`}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-dow mono" role="columnheader">{d}</div>)}
        {days.map((d) => {
          const mine = items.filter((i) => sameDay(new Date(i.planned_for), d))
          return (
            <div key={d.toISOString()} role="gridcell" className={`cal-day ${sameDay(d, today) ? 'is-today' : ''} ${d < new Date(today.getFullYear(), today.getMonth(), today.getDate()) ? 'is-past' : ''}`}>
              <span className="cal-date mono">{d.getDate() === 1 || d === days[0] ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : d.getDate()}</span>
              {mine.map((i) => (
                <button key={i.id} className={`cal-item st-${i.status}`} onClick={() => go('create', { post: { id: i.post_id, title: i.title } })} title={`${i.channel_name}: ${i.title} (${i.status})`}>
                  <span className={`chan ${i.channel}`}>{i.channel_name}</span>
                  <span className="cal-time mono">{new Date(i.planned_for).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="cal-title">{i.status === 'posted' ? '✓ ' : ''}{i.title}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
      <p className="small dim cal-key"><span className="cal-item st-draft">Draft</span> <span className="cal-item st-approved">Approved</span> <span className="cal-item st-posted">Posted</span> <span className="cal-item st-skipped">Skipped</span></p>
    </div>
  )
}
