import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as s from '../src/core/index.js'

const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ivsignal-'))
  return { db: s.openDb(join(dir, 'signal.db')), dir }
}

test('brand, brain and brief', () => {
  const { db, dir } = fresh()
  const b = s.createBrand(db, { name: 'Kiln & Co', profile: { offer: 'Hand-thrown mugs', prohibited: 'cures anxiety\nbest in the world' } })
  assert.deepEqual(b.profile.prohibited, ['cures anxiety', 'best in the world'])
  s.addBrainNote(db, { brand_id: b.id, kind: 'voice', text: 'Warm, plain, a little dry.' })
  s.addBrainNote(db, { brand_id: b.id, kind: 'voice', text: 'warm, plain, a little dry.' })
  assert.equal(s.listBrain(db, b.id).length, 1, 'duplicate notes collapse')
  assert.deepEqual(s.brandBrief(db, b.id).brain.voice, ['Warm, plain, a little dry.'])
  assert.throws(() => s.addBrainNote(db, { brand_id: b.id, kind: 'gossip', text: 'x' }))
  db.close(); rmSync(dir, { recursive: true, force: true })
})

test('issues block approval; approval follows the exact words', () => {
  const { db, dir } = fresh()
  const b = s.createBrand(db, { name: 'Kiln', profile: { prohibited: ['best in the world'] } })
  const p = s.createPost(db, { brand_id: b.id, title: 'Launch', variants: [
    { channel: 'x', text: 'x'.repeat(300) },
    { channel: 'instagram', text: 'New mugs.' },
  ] })
  assert.equal(p.blocking, true)
  let r = s.approvePosts(db, [p.id])
  assert.equal(r[0].approved, false)
  assert.match(r[0].reason, /allows 280/)
  assert.match(r[0].reason, /needs a picture/)

  const img = join(dir, 'mug.png')
  writeFileSync(img, Buffer.from('89504e470d0a1a0a', 'hex'))
  const m = s.importMedia(db, { brand_id: b.id, path: img, alt_text: 'A blue mug' }, { dataDir: dir })
  assert.equal(s.importMedia(db, { brand_id: b.id, path: img }, { dataDir: dir }).already, true)
  s.setVariant(db, p.id, { channel: 'x', text: 'New mugs, best in the world.' })
  s.setVariant(db, p.id, { channel: 'instagram', media_ids: [m.id] })
  assert.match(s.approvePosts(db, [p.id])[0].reason, /never claims/)
  s.setVariant(db, p.id, { channel: 'x', text: 'New mugs are out.' })
  r = s.approvePosts(db, [p.id], { actor: 'person' })
  assert.equal(r[0].approved, true)
  let got = s.getPost(db, p.id)
  assert.equal(got.approved, true)
  assert.ok(got.variants.every((v) => v.status === 'approved'))

  // Editing withdraws approval.
  got = s.setVariant(db, p.id, { channel: 'x', text: 'New mugs are out!' })
  assert.equal(got.approved, false)
  assert.equal(got.status, 'draft')
  assert.throws(() => s.markPosted(db, got.variants[0].id, { url: 'https://x.com/a/1' }), /Approve/)

  s.approvePosts(db, [p.id])
  got = s.markPosted(db, s.getPost(db, p.id).variants.find((v) => v.channel === 'x').id, { url: 'x.com/kiln/status/1' })
  const xv = got.variants.find((v) => v.channel === 'x')
  assert.equal(xv.status, 'posted')
  assert.equal(xv.posted_url, 'https://x.com/kiln/status/1')
  assert.throws(() => s.setVariant(db, p.id, { channel: 'x', text: 'changed' }), /already posted/)
  assert.throws(() => s.removeMedia(db, m.id, {}, { dataDir: dir }), /used in/)
  db.close(); rmSync(dir, { recursive: true, force: true })
})

test('calendar, posting queue and overview', () => {
  const { db, dir } = fresh()
  const b = s.createBrand(db, { name: 'Kiln' })
  const soon = new Date(Date.now() + 3600e3).toISOString()
  const later = new Date(Date.now() + 3 * 864e5).toISOString()
  const p = s.createPost(db, { brand_id: b.id, title: 'Tip', variants: [{ channel: 'linkedin', text: 'A tip.', planned_for: soon }, { channel: 'facebook', text: 'A tip.', planned_for: later }] })
  assert.equal(s.calendar(db, { brand_id: b.id }).items.length, 2)
  assert.equal(s.postingQueue(db, { brand_id: b.id }).length, 0, 'drafts are not in the queue')
  s.approvePosts(db, [p.id])
  const q = s.postingQueue(db, { brand_id: b.id })
  assert.equal(q.length, 1)
  assert.equal(q[0].channel, 'linkedin')
  const o = s.overview(db, { brand_id: b.id })
  assert.equal(o.counts.approved, 1)
  assert.equal(o.counts.planned_week, 2)
  assert.deepEqual(o.profile_missing, ['what you offer', 'who it\'s for', 'how you sound'])
  assert.ok(s.listEvents(db, { brand_id: b.id }).some((e) => e.kind === 'post_approved'))
  db.close(); rmSync(dir, { recursive: true, force: true })
})

test('campaigns and channels', () => {
  const { db, dir } = fresh()
  const b = s.createBrand(db, { name: 'Kiln' })
  const other = s.createBrand(db, { name: 'Other' })
  const c = s.createCampaign(db, { brand_id: b.id, name: 'Holiday', starts_on: '2026-12-01', ends_on: '2026-12-20' })
  assert.throws(() => s.createCampaign(db, { brand_id: b.id, name: 'Bad', starts_on: '2026-12-10', ends_on: '2026-12-01' }))
  assert.throws(() => s.createPost(db, { brand_id: other.id, campaign_id: c.id, title: 'x' }), /another brand/)
  const list = s.saveChannel(db, { brand_id: b.id, channel: 'instagram', handle: '@kiln', url: 'instagram.com/kiln' })
  assert.equal(list.find((x) => x.channel === 'instagram').url, 'https://instagram.com/kiln')
  db.close(); rmSync(dir, { recursive: true, force: true })
})
