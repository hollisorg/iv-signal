// Where a brand stands today, for the Today page and the agent's first look.
import { CHANNELS } from './db.js'
import { requireBrand } from './brands.js'
import { postingQueue } from './posts.js'

export function overview(db, { brand_id } = {}) {
  const brand = requireBrand(db, brand_id)
  const count = (sql, ...args) => db.prepare(sql).get(...args).n
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const weekAhead = new Date(Date.now() + 7 * 864e5).toISOString()
  const nowIso = new Date().toISOString()
  const toPost = postingQueue(db, { brand_id })
  const upcoming = db.prepare(`select v.id, v.channel, v.planned_for, v.status, p.id post_id, p.title, p.status post_status from variants v join posts p on p.id = v.post_id
      where p.brand_id = ? and p.status != 'archived' and v.status in ('draft','approved') and v.planned_for >= ? and v.planned_for < ? order by v.planned_for limit 12`)
    .all(brand_id, nowIso, weekAhead).map((r) => ({ ...r, channel_name: CHANNELS[r.channel].name }))
  const p = brand.profile || {}
  const missing = [
    !p.offer && 'what you offer',
    !p.audience && 'who it\'s for',
    !p.voice && 'how you sound',
  ].filter(Boolean)
  return {
    brand: { id: brand.id, name: brand.name },
    counts: {
      drafts: count("select count(*) n from posts where brand_id = ? and status = 'draft'", brand_id),
      approved: count("select count(*) n from posts where brand_id = ? and status = 'approved'", brand_id),
      planned_week: count("select count(*) n from variants v join posts p on p.id = v.post_id where p.brand_id = ? and p.status != 'archived' and v.status in ('draft','approved') and v.planned_for >= ? and v.planned_for < ?", brand_id, nowIso, weekAhead),
      posted_week: count("select count(*) n from variants v join posts p on p.id = v.post_id where p.brand_id = ? and v.status = 'posted' and v.posted_at >= ?", brand_id, weekAgo),
      brain: count('select count(*) n from brain where brand_id = ?', brand_id),
      media: count('select count(*) n from media where brand_id = ?', brand_id),
      channels: count('select count(*) n from channels where brand_id = ?', brand_id),
      to_post: toPost.length,
    },
    profile_missing: missing,
    to_post: toPost.slice(0, 8).map((v) => ({ id: v.id, post_id: v.post_id, title: v.post_title, channel: v.channel, channel_name: v.channel_name, planned_for: v.planned_for })),
    upcoming,
    publishing: 'manual',
  }
}
