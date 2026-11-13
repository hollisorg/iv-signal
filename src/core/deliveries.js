// Versions handed to a network to publish. A delivery is "scheduled" only once the network has accepted it and given
// an id back; "published" only once the network says it's live (then the version is marked posted with its link).
import { CHANNELS, now, newId, logEvent, clip } from './db.js'

export const ACTIVE = ['scheduled', 'published']

export function activeDelivery(db, variant_id) {
  return db.prepare(`select * from deliveries where variant_id = ? and status in ('scheduled','published') order by created_at desc limit 1`).get(variant_id) || null
}

export function lastDelivery(db, variant_id) {
  return db.prepare('select * from deliveries where variant_id = ? order by created_at desc limit 1').get(variant_id) || null
}

export function recordDelivery(db, { variant_id, provider, external_id = null, scheduled_for = null, status, url = null, error = null, fingerprint = null, actor }) {
  const v = db.prepare('select v.channel, p.brand_id, p.title from variants v join posts p on p.id = v.post_id where v.id = ?').get(variant_id)
  if (!v) throw new Error('That version is gone.')
  const id = newId(), at = now()
  db.prepare('insert into deliveries (id, variant_id, provider, external_id, scheduled_for, status, url, error, fingerprint, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, variant_id, provider, external_id, scheduled_for, status, url, clip(error, 500) || null, fingerprint, at, at)
  const what = status === 'scheduled' ? `Scheduled "${v.title}" on ${CHANNELS[v.channel].name}` : status === 'published' ? `Published "${v.title}" on ${CHANNELS[v.channel].name}` : `${CHANNELS[v.channel].name} didn't take "${v.title}"`
  logEvent(db, `delivery_${status}`, { actor, brand_id: v.brand_id, summary: what, data: { variant_id, external_id } })
  return db.prepare('select * from deliveries where id = ?').get(id)
}

export function updateDelivery(db, id, { status, url, error, actor } = {}) {
  const d = db.prepare('select * from deliveries where id = ?').get(id)
  if (!d) throw new Error('That delivery is gone.')
  db.prepare('update deliveries set status = ?, url = ?, error = ?, updated_at = ? where id = ?').run(status || d.status, url ?? d.url, error === undefined ? d.error : clip(error, 500) || null, now(), id)
  if (status && status !== d.status) {
    const v = db.prepare('select v.channel, p.brand_id, p.title from variants v join posts p on p.id = v.post_id where v.id = ?').get(d.variant_id)
    logEvent(db, `delivery_${status}`, { actor, brand_id: v?.brand_id, summary: `${status === 'published' ? 'Published' : status === 'cancelled' ? 'Cancelled' : 'Updated'} "${v?.title}" on ${CHANNELS[v?.channel]?.name || d.provider}`, data: { delivery_id: id } })
  }
  return db.prepare('select * from deliveries where id = ?').get(id)
}

// Scheduled deliveries whose time has passed (or that have no time), to check with the network.
export function dueDeliveries(db, { slackMs = 2 * 60 * 1000 } = {}) {
  const cutoff = new Date(Date.now() - slackMs).toISOString()
  return db.prepare(`select * from deliveries where status = 'scheduled' and (scheduled_for is null or scheduled_for <= ?)`).all(cutoff)
}
