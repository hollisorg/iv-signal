// Campaigns: a named push with a goal and dates (a launch week, a seasonal offer). Posts can belong to one.
import { now, newId, logEvent, clip } from './db.js'
import { requireBrand } from './brands.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const day = (v) => {
  const s = clip(v, 10)
  if (!s) return null
  if (!DAY.test(s) || Number.isNaN(Date.parse(s))) throw new Error('Use dates like 2026-11-20.')
  return s
}

export function getCampaign(db, id) {
  return db.prepare('select * from campaigns where id = ?').get(id) || null
}

export function listCampaigns(db, { brand_id, include_archived = false } = {}) {
  requireBrand(db, brand_id)
  return db.prepare(`select c.*, (select count(*) from posts p where p.campaign_id = c.id and p.status != 'archived') post_count
    from campaigns c where c.brand_id = ? ${include_archived ? '' : "and c.status != 'archived'"} order by c.created_at desc`).all(brand_id)
}

export function createCampaign(db, { brand_id, name, goal = '', starts_on, ends_on, actor } = {}) {
  const brand = requireBrand(db, brand_id)
  const label = clip(name, 160)
  if (!label) throw new Error('Name the campaign.')
  const start = day(starts_on), end = day(ends_on)
  if (start && end && end < start) throw new Error('The campaign ends before it starts.')
  const id = newId(), at = now()
  db.prepare('insert into campaigns (id, brand_id, name, goal, starts_on, ends_on, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, brand_id, label, clip(goal, 1000) || null, start, end, at, at)
  logEvent(db, 'campaign_created', { actor, brand_id, summary: `Started the campaign ${label} for ${brand.name}` })
  return getCampaign(db, id)
}

export function updateCampaign(db, id, { name, goal, starts_on, ends_on, status, actor } = {}) {
  const c = getCampaign(db, id)
  if (!c) throw new Error('That campaign is gone.')
  if (status !== undefined && !['active', 'paused', 'archived'].includes(status)) throw new Error('Use active, paused or archived.')
  const next = {
    name: name === undefined ? c.name : clip(name, 160),
    goal: goal === undefined ? c.goal : clip(goal, 1000) || null,
    starts_on: starts_on === undefined ? c.starts_on : day(starts_on),
    ends_on: ends_on === undefined ? c.ends_on : day(ends_on),
    status: status ?? c.status,
  }
  if (!next.name) throw new Error('Name the campaign.')
  db.prepare('update campaigns set name = ?, goal = ?, starts_on = ?, ends_on = ?, status = ?, updated_at = ? where id = ?')
    .run(next.name, next.goal, next.starts_on, next.ends_on, next.status, now(), id)
  logEvent(db, 'campaign_updated', { actor, brand_id: c.brand_id, summary: `Updated the campaign ${next.name}` })
  return getCampaign(db, id)
}
