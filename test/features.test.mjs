import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as s from '../src/core/index.js'
import { approvalPackHtml } from '../src/service/approvalpack.js'
import { picturePrompt } from '../src/service/pictures.js'

const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ivsignal-'))
  return { db: s.openDb(join(dir, 'signal.db')), dir }
}
const hours = (h) => new Date(Date.now() + h * 36e5).toISOString()

test('results are only for posted versions, and keep their history', () => {
  const { db, dir } = fresh()
  const b = s.createBrand(db, { name: 'Kiln' })
  const p = s.createPost(db, { brand_id: b.id, title: 'Tip', variants: [{ channel: 'linkedin', text: 'A tip.' }] })
  const vid = p.variants[0].id
  assert.throws(() => s.recordResults(db, vid, { likes: 4 }), /posted/)
  s.approvePosts(db, [p.id])
  s.markPosted(db, vid, { url: 'https://linkedin.com/posts/1' })
  assert.throws(() => s.recordResults(db, vid, {}), /at least one/)
  assert.throws(() => s.recordResults(db, vid, { likes: -2 }), /Numbers only/)
  s.recordResults(db, vid, { likes: '1,204', comments: 9, measured_at: hours(-48) })
  s.recordResults(db, vid, { likes: 1500, notes: 'Comments asked for the template.' })
  const [row] = s.postedWithResults(db, { brand_id: b.id })
  assert.equal(row.history.length, 2)
  assert.equal(row.latest.likes, 1500)
  assert.equal(row.history[1].likes, 1204)
  db.close(); rmSync(dir, { recursive: true, force: true })
})

test('a version scheduled on a network is locked until it is cancelled', () => {
  const { db, dir } = fresh()
  const b = s.createBrand(db, { name: 'Kiln' })
  const p = s.createPost(db, { brand_id: b.id, title: 'Sale', variants: [{ channel: 'facebook', text: 'Sale on Friday.', planned_for: hours(72) }, { channel: 'linkedin', text: 'Sale on Friday.', planned_for: hours(1) }] })
  s.approvePosts(db, [p.id])
  const fb = s.getPost(db, p.id).variants.find((v) => v.channel === 'facebook')

  assert.equal(s.facebookToSchedule(db, { brand_id: b.id }).length, 1, 'a later Facebook post waits to be scheduled')
  const d = s.recordDelivery(db, { variant_id: fb.id, provider: 'facebook', external_id: '123_456', scheduled_for: fb.planned_for, status: 'scheduled' })
  assert.equal(s.facebookToSchedule(db, { brand_id: b.id }).length, 0)
  assert.equal(s.facebookScheduled(db, { brand_id: b.id }).length, 1)
  assert.throws(() => s.setVariant(db, p.id, { channel: 'facebook', text: 'Sale on Saturday.' }), /Cancel that first/)
  assert.throws(() => s.removeVariant(db, p.id, 'facebook'), /Cancel that first/)
  assert.throws(() => s.archivePost(db, p.id), /Cancel that first/)
  assert.ok(s.calendar(db, { brand_id: b.id }).items.some((i) => i.channel === 'facebook' && i.delivery === 'scheduled'))
  assert.equal(s.dueDeliveries(db).length, 0, 'not due yet')

  s.updateDelivery(db, d.id, { status: 'cancelled' })
  assert.equal(s.activeDelivery(db, fb.id), null)
  assert.equal(s.facebookToSchedule(db, { brand_id: b.id }).length, 1, 'back in the list after cancelling')
  s.setVariant(db, p.id, { channel: 'facebook', text: 'Sale on Saturday.' })
  assert.equal(s.getPost(db, p.id).approved, false, 'editing still withdraws approval')

  // A failed hand-off is remembered on the version but doesn't lock it.
  s.approvePosts(db, [p.id])
  s.recordDelivery(db, { variant_id: fb.id, provider: 'facebook', status: 'failed', error: 'Facebook: token expired' })
  const again = s.getPost(db, p.id).variants.find((v) => v.channel === 'facebook')
  assert.equal(again.delivery.status, 'failed')
  assert.equal(s.activeDelivery(db, fb.id), null)
  assert.ok(s.listEvents(db, { brand_id: b.id }).some((e) => e.kind === 'delivery_scheduled'))
  db.close(); rmSync(dir, { recursive: true, force: true })
})

test('connecting a channel for direct posting keeps its handle', () => {
  const { db, dir } = fresh()
  const b = s.createBrand(db, { name: 'Kiln' })
  s.saveChannel(db, { brand_id: b.id, channel: 'facebook', handle: 'Kiln Studio' })
  let fb = s.setChannelStatus(db, { brand_id: b.id, channel: 'facebook', status: 'connected', url: 'https://facebook.com/kiln' }).find((c) => c.channel === 'facebook')
  assert.equal(fb.status, 'connected')
  assert.equal(fb.handle, 'Kiln Studio')
  fb = s.setChannelStatus(db, { brand_id: b.id, channel: 'facebook', status: 'manual' }).find((c) => c.channel === 'facebook')
  assert.equal(fb.status, 'manual')
  assert.equal(fb.url, 'https://facebook.com/kiln')
  assert.throws(() => s.setChannelStatus(db, { brand_id: b.id, channel: 'facebook', status: 'live' }))
  db.close(); rmSync(dir, { recursive: true, force: true })
})

test('the approval pack shows the exact words, escaped, with no outside calls', () => {
  const { db, dir } = fresh()
  const b = s.createBrand(db, { name: 'Kiln & Co', profile: { accent: '#3355ff' } })
  const p = s.createPost(db, { brand_id: b.id, title: 'Launch <b>day</b>', variants: [{ channel: 'instagram', text: 'Mugs are out.\nCome by.' }, { channel: 'x', text: 'Mugs "out" now' }] })
  const html = approvalPackHtml({ brand: b, posts: [s.getPost(db, p.id)], note: 'Reply by Friday', from: 'Matt', timezone: 'America/New_York' })
  assert.match(html, /Launch &lt;b&gt;day&lt;\/b&gt;/)
  assert.match(html, /Mugs are out\.<br>Come by\./)
  assert.match(html, /Mugs &quot;out&quot; now/)
  assert.match(html, /Approve 01/)
  assert.match(html, /#3355ff/)
  assert.doesNotMatch(html, /<script|src="https?:|href="https?:\/\/(?!)/i)
  db.close(); rmSync(dir, { recursive: true, force: true })
})

test('picture prompts carry the brand look and ask for no lettering', () => {
  const t = picturePrompt({ description: 'A mug on a sunny windowsill', shape: 'story', brand: { profile: { visual: 'Warm film grain, cream and rust.' } } })
  assert.match(t, /A mug on a sunny windowsill/)
  assert.match(t, /9:16/)
  assert.match(t, /cream and rust/)
  assert.match(t, /No text, no letters/)
})

// A stand-in for Facebook's Graph API.
function fakeGraph() {
  const calls = []
  const server = createServer((req, res) => {
    let body = Buffer.alloc(0)
    req.on('data', (c) => (body = Buffer.concat([body, c])))
    req.on('end', () => {
      const url = new URL(req.url, 'http://x')
      const auth = req.headers.authorization || ''
      calls.push({ method: req.method, path: url.pathname, auth, body: body.toString('latin1') })
      const send = (code, json) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)) }
      const token = auth.replace(/^Bearer /, '')
      if (token.startsWith('EXPIRED')) return send(400, { error: { message: 'Error validating access token: Session has expired', code: 190 } })
      if (url.pathname === '/me') return token.startsWith('USER') ? send(200, { id: '9', name: 'Matt' }) : send(200, { id: '777', name: 'Kiln Studio', category: 'Shopping & retail', link: 'https://www.facebook.com/kiln' })
      if (url.pathname === '/777/feed' && req.method === 'POST') return send(200, { id: '777_1001' })
      if (url.pathname === '/777/photos' && req.method === 'POST') return send(200, { id: '55', post_id: '777_1002' })
      if (url.pathname === '/777_1001' && req.method === 'GET') return send(200, { id: '777_1001', is_published: false })
      if (url.pathname === '/777_1002' && req.method === 'GET') return send(200, { id: '777_1002', is_published: true, permalink_url: 'https://www.facebook.com/kiln/posts/1002' })
      if (req.method === 'DELETE') return send(200, { success: true })
      if (url.pathname === '/777_gone') return send(404, { error: { message: 'Unsupported get request.' } })
      send(404, { error: { message: 'Unknown path' } })
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })))
}

test('Facebook: Page tokens only, schedule, post a picture, check, cancel', async () => {
  const g = await fakeGraph()
  process.env.IV_SIGNAL_GRAPH_URL = g.url
  const meta = await import('../src/service/meta.js')
  const page = 'P'.repeat(60), user = 'USER' + 'u'.repeat(60), old = 'EXPIRED' + 'e'.repeat(60)
  const dir = mkdtempSync(join(tmpdir(), 'ivsignal-'))
  try {
    await assert.rejects(meta.verifyPageToken('short'), /doesn’t look like/)
    await assert.rejects(meta.verifyPageToken(user), /personal \(user\) token/)
    await assert.rejects(meta.verifyPageToken(old), /expired/)
    assert.deepEqual(await meta.verifyPageToken(page), { page_id: '777', page_name: 'Kiln Studio', link: 'https://www.facebook.com/kiln' })

    await assert.rejects(meta.publishToPage({ token: page, page_id: '777', text: 'x', when: new Date(Date.now() + 5 * 60e3).toISOString() }), /11 minutes/)
    await assert.rejects(meta.publishToPage({ token: page, page_id: '777', text: 'x', when: new Date(Date.now() + 40 * 864e5).toISOString() }), /30 days/)
    const at = new Date(Date.now() + 2 * 864e5)
    const r = await meta.publishToPage({ token: page, page_id: '777', text: 'Sale on Friday.', when: at.toISOString() })
    assert.equal(r.external_id, '777_1001')
    const feed = g.calls.find((c) => c.path === '/777/feed')
    assert.equal(feed.auth, `Bearer ${page}`, 'the token goes in a header, never the address')
    assert.ok(!g.calls.some((c) => c.path.includes(page)))
    assert.match(feed.body, /name="published"\r\n\r\nfalse/)
    assert.match(feed.body, new RegExp(`name="scheduled_publish_time"\\r\\n\\r\\n${Math.floor(at.getTime() / 1000)}`))
    assert.equal((await meta.checkPagePost({ token: page, external_id: '777_1001' })).published, false)

    const img = join(dir, 'mug.png')
    writeFileSync(img, Buffer.from('89504e470d0a1a0a', 'hex'))
    const now = await meta.publishToPage({ token: page, page_id: '777', text: 'Mugs are out.', imagePath: img })
    assert.equal(now.external_id, '777_1002')
    assert.equal(now.scheduled_for, null)
    const photo = g.calls.find((c) => c.path === '/777/photos')
    assert.match(photo.body, /filename="mug\.png"/)
    assert.doesNotMatch(photo.body, /scheduled_publish_time/)
    assert.deepEqual(await meta.checkPagePost({ token: page, external_id: '777_1002' }), { published: true, url: 'https://www.facebook.com/kiln/posts/1002' })

    assert.equal(await meta.cancelPagePost({ token: page, external_id: '777_1001' }), true)
    await assert.rejects(meta.checkPagePost({ token: page, external_id: '777_gone' }), (e) => e.status === 404)
  } finally {
    delete process.env.IV_SIGNAL_GRAPH_URL
    g.server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
