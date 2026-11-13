// How posted versions did. Numbers come from the person (or their agent reading the network) for now; when direct
// publishing arrives they'll come from the networks. Lessons drawn from them go into the Brand Brain with the evidence.
import { CHANNELS, now, newId, logEvent, clip } from './db.js'
import { requireBrand } from './brands.js'

const METRICS = ['reach', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks']
const count = (v) => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(String(v).replace(/[,\s]/g, ''))
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new Error('Numbers only, 0 or more.')
  return Math.round(n)
}

export function recordResults(db, variant_id, input = {}, { actor } = {}) {
  const v = db.prepare('select v.*, p.brand_id, p.title from variants v join posts p on p.id = v.post_id where v.id = ?').get(variant_id)
  if (!v) throw new Error('That version is gone.')
  if (v.status !== 'posted') throw new Error('Results are for versions that have been posted.')
  const values = Object.fromEntries(METRICS.map((m) => [m, count(input[m])]))
  if (METRICS.every((m) => values[m] === null) && !clip(input.notes, 10)) throw new Error('Add at least one number or a note.')
  const measured = input.measured_at ? new Date(input.measured_at) : new Date()
  if (Number.isNaN(measured.getTime())) throw new Error('Use a real date for when you looked.')
  const id = newId()
  db.prepare(`insert into results (id, variant_id, measured_at, ${METRICS.join(', ')}, notes, source, created_at) values (?, ?, ?, ${METRICS.map(() => '?').join(', ')}, ?, ?, ?)`)
    .run(id, variant_id, measured.toISOString(), ...METRICS.map((m) => values[m]), clip(input.notes, 1000) || null, String(actor || process.env.IV_SIGNAL_ACTOR || 'person').slice(0, 40), now())
  logEvent(db, 'results_recorded', { actor, brand_id: v.brand_id, summary: `Recorded results for "${v.title}" on ${CHANNELS[v.channel].name}`, data: { variant_id } })
  return db.prepare('select * from results where id = ?').get(id)
}

// Every posted version with its latest numbers, newest first.
export function postedWithResults(db, { brand_id, limit = 60 } = {}) {
  requireBrand(db, brand_id)
  const n = Math.max(1, Math.min(300, Number(limit) || 60))
  return db.prepare(`select v.id, v.post_id, v.channel, v.text, v.posted_at, v.posted_url, p.title
      from variants v join posts p on p.id = v.post_id
      where p.brand_id = ? and v.status = 'posted' order by v.posted_at desc limit ?`).all(brand_id, n)
    .map((v) => {
      const history = db.prepare('select * from results where variant_id = ? order by measured_at desc').all(v.id)
      return { ...v, channel_name: CHANNELS[v.channel].name, latest: history[0] || null, history }
    })
}
