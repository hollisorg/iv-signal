// Brands and the Brand Brain. A brand's profile holds the structured basics (voice, offer, audience, what it must never
// claim); the brain holds everything else it learns, one plain note at a time.
import { now, newId, logEvent, clip } from './db.js'

const TEXT_FIELDS = { offer: 1500, audience: 1500, voice: 1500, products: 2000, website: 300, location: 200, kind: 200, goal: 600, visual: 1500, hashtags: 400 }
const hydrate = (row) => {
  if (!row) return null
  const { profile_json, ...rest } = row
  return { ...rest, profile: JSON.parse(profile_json || '{}') }
}

export function cleanProfile(input = {}) {
  const profile = {}
  for (const [key, n] of Object.entries(TEXT_FIELDS)) if (input[key] !== undefined) profile[key] = clip(input[key], n)
  // Things the brand must never say: a list, each item short. Drafts that contain one can't be approved.
  if (input.prohibited !== undefined) {
    const list = Array.isArray(input.prohibited) ? input.prohibited : String(input.prohibited || '').split(/\n|;/)
    profile.prohibited = [...new Set(list.map((s) => clip(s, 160)).filter(Boolean))].slice(0, 40)
  }
  for (const key of ['logo_id', 'cover_id']) if (input[key] !== undefined) {
    const value = String(input[key] || '')
    if (value && !/^[a-f0-9]{64}\.(png|jpg)$/.test(value)) throw new Error('Choose a brand image from the app.')
    profile[key] = value
  }
  if (input.accent !== undefined && input.accent !== '') {
    if (!/^#[a-f0-9]{6}$/i.test(input.accent)) throw new Error('Choose a valid brand color.')
    profile.accent = input.accent
  }
  if (profile.website) {
    const url = new URL(/^https?:\/\//i.test(profile.website) ? profile.website : `https://${profile.website}`)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a public website without sign-in details.')
    profile.website = url.toString()
  }
  return profile
}

export function getBrand(db, id) {
  return hydrate(db.prepare('select * from brands where id = ?').get(id))
}

export function requireBrand(db, id) {
  const brand = getBrand(db, id)
  if (!brand) throw new Error('Choose an existing brand.')
  return brand
}

export function listBrands(db) {
  return db.prepare(`select b.*,
      (select count(*) from posts p where p.brand_id = b.id and p.status != 'archived') post_count,
      (select count(*) from brain n where n.brand_id = b.id) brain_count
    from brands b order by b.created_at, b.id`).all().map(hydrate)
}

export function createBrand(db, { name, profile = {}, actor } = {}) {
  const label = clip(name, 160)
  if (!label) throw new Error('Give this brand a name.')
  const clean = cleanProfile(profile)
  const id = newId(), at = now()
  db.prepare('insert into brands (id, name, profile_json, created_at, updated_at) values (?, ?, ?, ?, ?)').run(id, label, JSON.stringify(clean), at, at)
  logEvent(db, 'brand_created', { actor, brand_id: id, summary: `Added the brand ${label}` })
  return getBrand(db, id)
}

export function updateBrand(db, id, { name, profile, actor } = {}) {
  const current = requireBrand(db, id)
  const label = name === undefined ? current.name : clip(name, 160)
  if (!label) throw new Error('Give this brand a name.')
  const next = profile ? cleanProfile({ ...current.profile, ...profile }) : current.profile
  db.prepare('update brands set name = ?, profile_json = ?, updated_at = ? where id = ?').run(label, JSON.stringify(next), now(), id)
  logEvent(db, 'brand_updated', { actor, brand_id: id, summary: `Updated ${label}'s profile`, data: { fields: Object.keys(profile || {}) } })
  return getBrand(db, id)
}

// --- The Brand Brain ---
export const BRAIN_KINDS = {
  fact: 'Facts',
  voice: 'Voice',
  rule: 'Rules',
  lesson: 'Lessons',
  reference: 'References',
}

export function listBrain(db, brand_id) {
  requireBrand(db, brand_id)
  return db.prepare('select * from brain where brand_id = ? order by created_at desc').all(brand_id)
}

export function addBrainNote(db, { brand_id, kind = 'fact', text, source = '', actor } = {}) {
  const brand = requireBrand(db, brand_id)
  if (!BRAIN_KINDS[kind]) throw new Error('Use fact, voice, rule, lesson or reference.')
  const body = clip(text, 1500)
  if (!body) throw new Error('Write the note first.')
  const dupe = db.prepare('select id from brain where brand_id = ? and kind = ? and lower(text) = lower(?)').get(brand_id, kind, body)
  if (dupe) return db.prepare('select * from brain where id = ?').get(dupe.id)
  const id = newId()
  db.prepare('insert into brain (id, brand_id, kind, text, source, created_by, created_at) values (?, ?, ?, ?, ?, ?, ?)')
    .run(id, brand_id, kind, body, clip(source, 300) || null, String(actor || process.env.IV_SIGNAL_ACTOR || 'person').slice(0, 40), now())
  logEvent(db, 'brain_added', { actor, brand_id, summary: `Added a ${kind} note to ${brand.name}'s Brand Brain` })
  return db.prepare('select * from brain where id = ?').get(id)
}

export function removeBrainNote(db, id, { actor } = {}) {
  const row = db.prepare('select * from brain where id = ?').get(id)
  if (!row) throw new Error('That note is gone.')
  db.prepare('delete from brain where id = ?').run(id)
  logEvent(db, 'brain_removed', { actor, brand_id: row.brand_id, summary: 'Removed a Brand Brain note', data: { kind: row.kind } })
  return { removed: id }
}

// Everything an agent needs to write in the brand's voice, in one object.
export function brandBrief(db, brand_id) {
  const brand = requireBrand(db, brand_id)
  const notes = listBrain(db, brand_id)
  const group = {}
  for (const n of notes) (group[n.kind] ||= []).push(n.text)
  return { id: brand.id, name: brand.name, ...brand.profile, brain: group }
}
