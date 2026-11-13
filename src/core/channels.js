// Where a brand posts. Today every channel is "manual": the person posts approved versions themselves from the
// calendar. Connected publishing arrives with the server once the network app reviews are approved.
import { CHANNELS, now, newId, logEvent, clip } from './db.js'
import { requireBrand } from './brands.js'

export function listChannels(db, { brand_id } = {}) {
  requireBrand(db, brand_id)
  const rows = db.prepare('select * from channels where brand_id = ?').all(brand_id)
  return Object.entries(CHANNELS).map(([key, spec]) => {
    const row = rows.find((r) => r.channel === key)
    return { channel: key, name: spec.name, limit: spec.limit, needs: spec.needs, added: !!row, handle: row?.handle || '', url: row?.url || '', status: row?.status || null, id: row?.id || null }
  })
}

export function saveChannel(db, { brand_id, channel, handle = '', url = '', actor } = {}) {
  const brand = requireBrand(db, brand_id)
  const key = String(channel || '').toLowerCase()
  if (!CHANNELS[key]) throw new Error('Choose a network.')
  let link = clip(url, 400)
  if (link) {
    const u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`)
    if (u.protocol !== 'https:' || u.username || u.password) throw new Error('Use the account\'s public https link.')
    link = u.toString()
  }
  const at = now()
  db.prepare(`insert into channels (id, brand_id, channel, handle, url, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)
    on conflict(brand_id, channel) do update set handle = excluded.handle, url = excluded.url, updated_at = excluded.updated_at`)
    .run(newId(), brand_id, key, clip(handle, 120) || null, link || null, at, at)
  logEvent(db, 'channel_saved', { actor, brand_id, summary: `Added ${brand.name}'s ${CHANNELS[key].name} account` })
  return listChannels(db, { brand_id })
}

export function removeChannel(db, { brand_id, channel, actor } = {}) {
  const brand = requireBrand(db, brand_id)
  db.prepare('delete from channels where brand_id = ? and channel = ?').run(brand_id, String(channel || ''))
  logEvent(db, 'channel_removed', { actor, brand_id, summary: `Removed ${brand.name}'s ${CHANNELS[channel]?.name || channel} account` })
  return listChannels(db, { brand_id })
}

// Mark whether a network is connected for direct publishing (the token itself lives in the app's encrypted settings).
export function setChannelStatus(db, { brand_id, channel, status, handle, url, actor } = {}) {
  requireBrand(db, brand_id)
  if (!['manual', 'connected', 'needs_reconnect'].includes(status)) throw new Error('Unknown channel status.')
  const at = now()
  db.prepare(`insert into channels (id, brand_id, channel, handle, url, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(brand_id, channel) do update set status = excluded.status, handle = coalesce(excluded.handle, channels.handle), url = coalesce(excluded.url, channels.url), updated_at = excluded.updated_at`)
    .run(newId(), brand_id, channel, handle || null, url || null, status, at, at)
  logEvent(db, 'channel_status', { actor, brand_id, summary: `${CHANNELS[channel].name} is ${status === 'connected' ? 'connected for direct posting' : status === 'manual' ? 'back to posting by hand' : 'needing to reconnect'}` })
  return listChannels(db, { brand_id })
}
