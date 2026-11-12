// Posts, their per-network variants, the checks that stop a bad post being approved, approvals tied to the exact
// words and media, and the calendar. Nothing here publishes: an approved variant is posted by the person by hand
// (copy, open the network, paste), then marked posted with its link.
import { createHash } from 'node:crypto'
import { CHANNELS, now, newId, logEvent, clip, tx } from './db.js'
import { requireBrand } from './brands.js'
import { getCampaign } from './campaigns.js'

const hydrateVariant = (row) => {
  if (!row) return null
  const { media_json, ...rest } = row
  return { ...rest, media_ids: JSON.parse(media_json || '[]') }
}
const isoOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null
  const t = Date.parse(v)
  if (Number.isNaN(t)) throw new Error('Use a date and time like 2026-11-20T09:30:00-08:00.')
  return new Date(t).toISOString()
}
const channelOf = (c) => {
  const key = String(c || '').toLowerCase().trim()
  if (!CHANNELS[key]) throw new Error(`Unknown network "${c}". Use one of: ${Object.keys(CHANNELS).join(', ')}.`)
  return key
}

function mediaFor(db, brand_id, ids = []) {
  if (!Array.isArray(ids)) throw new Error('media_ids must be a list.')
  const unique = [...new Set(ids.map(String))].slice(0, 10)
  return unique.map((id) => {
    const m = db.prepare('select * from media where id = ?').get(id)
    if (!m || m.brand_id !== brand_id) throw new Error('A chosen picture or video isn\'t in this brand\'s library.')
    return m
  })
}

// What's wrong with a variant, in plain words. "block" issues stop approval; "warn" ones are advice.
export function variantIssues(variant, brand, media = []) {
  const out = []
  const spec = CHANNELS[variant.channel]
  const text = String(variant.text || '')
  if (!text.trim() && !media.length) out.push({ level: 'block', text: 'Nothing to post yet.' })
  if (text.length > spec.limit) out.push({ level: 'block', text: `${text.length.toLocaleString()} characters; ${spec.name} allows ${spec.limit.toLocaleString()}.` })
  if (spec.needs === 'image' && !media.some((m) => m.kind === 'image' || m.kind === 'video')) out.push({ level: 'block', text: `${spec.name} needs a picture or video.` })
  if (spec.needs === 'video' && !media.some((m) => m.kind === 'video')) out.push({ level: 'block', text: `${spec.name} needs a video.` })
  const lower = text.toLowerCase()
  for (const phrase of brand?.profile?.prohibited || []) {
    if (phrase && lower.includes(phrase.toLowerCase())) out.push({ level: 'block', text: `Says "${phrase}", which ${brand.name} never claims.` })
  }
  if (media.some((m) => m.kind === 'image') && !String(variant.alt_text || '').trim() && !media.every((m) => m.alt_text)) out.push({ level: 'warn', text: 'Add a picture description (alt text) for people using screen readers.' })
  if (variant.planned_for && Date.parse(variant.planned_for) < Date.now() && variant.status !== 'posted') out.push({ level: 'warn', text: 'The planned time has passed.' })
  return out
}

function fingerprint(db, post_id) {
  const rows = db.prepare('select * from variants where post_id = ? order by channel').all(post_id).map(hydrateVariant)
  const parts = rows.map((v) => [v.channel, v.text, v.media_ids.map((id) => db.prepare('select sha256 from media where id = ?').get(id)?.sha256 || id), v.alt_text || '', v.planned_for || ''])
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

function currentApproval(db, post) {
  const a = db.prepare('select * from approvals where post_id = ? order by approved_at desc limit 1').get(post.id)
  if (!a || a.revision !== post.revision || post.status !== 'approved') return null
  return a.fingerprint === fingerprint(db, post.id) ? a : null
}

export function getPost(db, id) {
  const post = db.prepare('select * from posts where id = ?').get(id)
  if (!post) return null
  const brand = requireBrand(db, post.brand_id)
  const variants = db.prepare('select * from variants where post_id = ? order by channel').all(id).map(hydrateVariant).map((v) => {
    const media = v.media_ids.map((m) => db.prepare('select * from media where id = ?').get(m)).filter(Boolean)
    return { ...v, channel_name: CHANNELS[v.channel].name, limit: CHANNELS[v.channel].limit, media, issues: variantIssues(v, brand, media) }
  })
  const approval = currentApproval(db, post)
  const campaign = post.campaign_id ? getCampaign(db, post.campaign_id) : null
  return { ...post, campaign_name: campaign?.name || null, variants, approved: !!approval, approval, blocking: variants.some((v) => v.issues.some((i) => i.level === 'block')) }
}

function requirePost(db, id) {
  const post = getPost(db, id)
  if (!post) throw new Error('That post is gone.')
  return post
}

export function listPosts(db, { brand_id, status, campaign_id, limit = 100 } = {}) {
  requireBrand(db, brand_id)
  const where = ['brand_id = ?'], args = [brand_id]
  if (status) {
    if (!['draft', 'approved', 'archived'].includes(status)) throw new Error('Use draft, approved or archived.')
    where.push('status = ?'); args.push(status)
  } else where.push("status != 'archived'")
  if (campaign_id) { where.push('campaign_id = ?'); args.push(campaign_id) }
  const n = Math.max(1, Math.min(300, Number(limit) || 100))
  return db.prepare(`select id from posts where ${where.join(' and ')} order by updated_at desc limit ?`).all(...args, n).map((r) => getPost(db, r.id))
}

// Any change to what would be posted withdraws the approval: the person approves exactly what goes out.
function touch(db, post_id, { actor, summary }) {
  const post = db.prepare('select * from posts where id = ?').get(post_id)
  const wasApproved = post.status === 'approved'
  db.prepare("update posts set revision = revision + 1, status = case when status = 'approved' then 'draft' else status end, updated_at = ? where id = ?").run(now(), post_id)
  if (wasApproved) db.prepare("update variants set status = 'draft' where post_id = ? and status = 'approved'").run(post_id)
  logEvent(db, 'post_changed', { actor, brand_id: post.brand_id, summary: wasApproved ? `${summary} (needs approving again)` : summary, data: { post_id } })
}

function writeVariant(db, post, { channel, text, media_ids, alt_text, planned_for }) {
  const key = channelOf(channel)
  const existing = hydrateVariant(db.prepare('select * from variants where post_id = ? and channel = ?').get(post.id, key))
  if (existing?.status === 'posted') throw new Error(`The ${CHANNELS[key].name} version is already posted; it can't change.`)
  const next = {
    text: text === undefined ? existing?.text ?? '' : String(text ?? '').slice(0, 70000),
    media_ids: media_ids === undefined ? existing?.media_ids ?? [] : mediaFor(db, post.brand_id, media_ids).map((m) => m.id),
    alt_text: alt_text === undefined ? existing?.alt_text ?? null : clip(alt_text, 1000) || null,
    planned_for: planned_for === undefined ? existing?.planned_for ?? null : isoOrNull(planned_for),
  }
  const at = now()
  if (existing) {
    db.prepare('update variants set text = ?, media_json = ?, alt_text = ?, planned_for = ?, updated_at = ? where id = ?')
      .run(next.text, JSON.stringify(next.media_ids), next.alt_text, next.planned_for, at, existing.id)
  } else {
    db.prepare('insert into variants (id, post_id, channel, text, media_json, alt_text, planned_for, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(newId(), post.id, key, next.text, JSON.stringify(next.media_ids), next.alt_text, next.planned_for, at, at)
  }
}

export function createPost(db, { brand_id, campaign_id = null, title, idea = '', variants = [], actor } = {}) {
  const brand = requireBrand(db, brand_id)
  if (campaign_id && getCampaign(db, campaign_id)?.brand_id !== brand_id) throw new Error('That campaign belongs to another brand.')
  const label = clip(title, 200) || clip(idea, 80) || clip(variants[0]?.text, 80)
  if (!label) throw new Error('Give the post a title or an idea.')
  if (!Array.isArray(variants)) throw new Error('variants must be a list.')
  if (variants.length > Object.keys(CHANNELS).length) throw new Error('One version per network.')
  return tx(db, () => {
    const id = newId(), at = now()
    db.prepare('insert into posts (id, brand_id, campaign_id, title, idea, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, brand_id, campaign_id, label, clip(idea, 4000) || null, String(actor || process.env.IV_SIGNAL_ACTOR || 'person').slice(0, 40), at, at)
    const post = { id, brand_id }
    for (const v of variants) writeVariant(db, post, v)
    logEvent(db, 'post_created', { actor, brand_id, summary: `Drafted "${label}" for ${brand.name}`, data: { post_id: id, channels: variants.map((v) => v.channel) } })
    return getPost(db, id)
  })
}

export function updatePost(db, id, { title, idea, campaign_id, actor } = {}) {
  const post = requirePost(db, id)
  if (campaign_id && getCampaign(db, campaign_id)?.brand_id !== post.brand_id) throw new Error('That campaign belongs to another brand.')
  db.prepare('update posts set title = ?, idea = ?, campaign_id = ?, updated_at = ? where id = ?').run(
    title === undefined ? post.title : clip(title, 200) || post.title,
    idea === undefined ? post.idea : clip(idea, 4000) || null,
    campaign_id === undefined ? post.campaign_id : campaign_id || null,
    now(), id,
  )
  logEvent(db, 'post_renamed', { actor, brand_id: post.brand_id, summary: `Updated "${post.title}"`, data: { post_id: id } })
  return getPost(db, id)
}

export function setVariant(db, post_id, patch = {}) {
  const post = requirePost(db, post_id)
  if (post.status === 'archived') throw new Error('Restore the post before changing it.')
  return tx(db, () => {
    writeVariant(db, post, patch)
    touch(db, post_id, { actor: patch.actor, summary: `Edited the ${CHANNELS[channelOf(patch.channel)].name} version of "${post.title}"` })
    return getPost(db, post_id)
  })
}

export function removeVariant(db, post_id, channel, { actor } = {}) {
  const post = requirePost(db, post_id)
  const key = channelOf(channel)
  const v = post.variants.find((x) => x.channel === key)
  if (!v) return post
  if (v.status === 'posted') throw new Error('A posted version stays on record.')
  return tx(db, () => {
    db.prepare('delete from variants where id = ?').run(v.id)
    touch(db, post_id, { actor, summary: `Removed the ${CHANNELS[key].name} version of "${post.title}"` })
    return getPost(db, post_id)
  })
}

// Plan when each version goes out. Times are a plan for the person; nothing posts by itself yet.
export function planPost(db, post_id, times = {}, { actor } = {}) {
  const post = requirePost(db, post_id)
  return tx(db, () => {
    for (const [channel, at] of Object.entries(times || {})) {
      const key = channelOf(channel)
      if (!post.variants.some((v) => v.channel === key)) throw new Error(`"${post.title}" has no ${CHANNELS[key].name} version.`)
      writeVariant(db, post, { channel: key, planned_for: at })
    }
    touch(db, post_id, { actor, summary: `Planned when "${post.title}" goes out` })
    return getPost(db, post_id)
  })
}

export function approvePosts(db, ids = [], { actor } = {}) {
  if (!Array.isArray(ids) || !ids.length) throw new Error('Choose at least one post.')
  if (ids.length > 50) throw new Error('Approve 50 posts or fewer at a time.')
  const results = []
  tx(db, () => {
    for (const id of ids) {
      const post = getPost(db, id)
      if (!post) { results.push({ id, approved: false, reason: 'That post is gone.' }); continue }
      if (post.status === 'archived') { results.push({ id, approved: false, reason: 'Archived.' }); continue }
      if (!post.variants.length) { results.push({ id, approved: false, reason: 'No network versions yet.' }); continue }
      if (post.blocking) { results.push({ id, approved: false, reason: post.variants.flatMap((v) => v.issues.filter((i) => i.level === 'block').map((i) => `${v.channel_name}: ${i.text}`)).join(' ') }); continue }
      if (post.approved) { results.push({ id, approved: true, already: true }); continue }
      const print = fingerprint(db, id)
      db.prepare("update posts set status = 'approved', updated_at = ? where id = ?").run(now(), id)
      db.prepare("update variants set status = 'approved' where post_id = ? and status = 'draft'").run(id)
      db.prepare('insert into approvals (id, post_id, revision, fingerprint, approved_by, approved_at) values (?, ?, ?, ?, ?, ?)')
        .run(newId(), id, post.revision, print, String(actor || process.env.IV_SIGNAL_ACTOR || 'person').slice(0, 40), now())
      logEvent(db, 'post_approved', { actor, brand_id: post.brand_id, summary: `Approved "${post.title}"`, data: { post_id: id, revision: post.revision } })
      results.push({ id, approved: true })
    }
  })
  return results
}

export function archivePost(db, id, { restore = false, actor } = {}) {
  const post = requirePost(db, id)
  db.prepare('update posts set status = ?, updated_at = ? where id = ?').run(restore ? 'draft' : 'archived', now(), id)
  if (restore) db.prepare('update posts set revision = revision + 1 where id = ?').run(id)
  logEvent(db, restore ? 'post_restored' : 'post_archived', { actor, brand_id: post.brand_id, summary: `${restore ? 'Restored' : 'Archived'} "${post.title}"`, data: { post_id: id } })
  return getPost(db, id)
}

// The person posted it themselves; record where it went live.
export function markPosted(db, variant_id, { url = '', actor } = {}) {
  const v = hydrateVariant(db.prepare('select * from variants where id = ?').get(variant_id))
  if (!v) throw new Error('That version is gone.')
  const post = requirePost(db, v.post_id)
  if (!post.approved) throw new Error('Approve the post before marking it posted.')
  if (v.status === 'posted') return getPost(db, post.id)
  let link = clip(url, 600) || null
  if (link) {
    const u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Paste the post\'s web link.')
    link = u.toString()
  }
  db.prepare("update variants set status = 'posted', posted_at = ?, posted_url = ?, updated_at = ? where id = ?").run(now(), link, now(), variant_id)
  logEvent(db, 'variant_posted', { actor, brand_id: post.brand_id, summary: `Posted "${post.title}" on ${CHANNELS[v.channel].name}`, data: { post_id: post.id, variant_id, url: link } })
  return getPost(db, post.id)
}

export function skipVariant(db, variant_id, { actor } = {}) {
  const v = db.prepare('select * from variants where id = ?').get(variant_id)
  if (!v) throw new Error('That version is gone.')
  if (v.status === 'posted') throw new Error('Already posted.')
  db.prepare("update variants set status = 'skipped', updated_at = ? where id = ?").run(now(), variant_id)
  const post = db.prepare('select brand_id, title from posts where id = ?').get(v.post_id)
  logEvent(db, 'variant_skipped', { actor, brand_id: post.brand_id, summary: `Skipped "${post.title}" on ${CHANNELS[v.channel].name}`, data: { variant_id } })
  return getPost(db, v.post_id)
}

// Every planned version between two times, for the calendar.
export function calendar(db, { brand_id, from, to } = {}) {
  requireBrand(db, brand_id)
  const start = isoOrNull(from) || new Date(Date.now() - 7 * 864e5).toISOString()
  const end = isoOrNull(to) || new Date(Date.parse(start) + 42 * 864e5).toISOString()
  const rows = db.prepare(`select v.id, v.post_id, v.channel, v.text, v.planned_for, v.status, v.posted_url, p.title, p.status post_status, p.revision
      from variants v join posts p on p.id = v.post_id
      where p.brand_id = ? and p.status != 'archived' and v.planned_for is not null and v.planned_for >= ? and v.planned_for < ?
      order by v.planned_for`).all(brand_id, start, end)
  return { from: start, to: end, items: rows.map((r) => ({ ...r, channel_name: CHANNELS[r.channel].name, excerpt: r.text.slice(0, 140) })) }
}

// Approved versions whose time has come (or has no time), waiting for the person to post them.
export function postingQueue(db, { brand_id } = {}) {
  requireBrand(db, brand_id)
  const soon = new Date(Date.now() + 24 * 36e5).toISOString()
  return db.prepare(`select v.id from variants v join posts p on p.id = v.post_id
      where p.brand_id = ? and p.status = 'approved' and v.status = 'approved' and (v.planned_for is null or v.planned_for <= ?)
      order by coalesce(v.planned_for, p.updated_at)`).all(brand_id, soon)
    .map((r) => {
      const v = hydrateVariant(db.prepare('select * from variants where id = ?').get(r.id))
      const post = getPost(db, v.post_id)
      return { ...post.variants.find((x) => x.id === v.id), post_title: post.title, post_id: post.id, compose: CHANNELS[v.channel].compose }
    })
}
