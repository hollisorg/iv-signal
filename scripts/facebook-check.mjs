// Networks page and Facebook direct posting, clicked through in the built app against a stand-in Graph API.
// Throwaway data folder; no real Facebook calls. Usage: node scripts/facebook-check.mjs <out-dir>
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as s from '../src/core/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] || join(root, 'docs', 'verification', 'facebook'))
mkdirSync(out, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'ivsignal-fb-'))
const PAGE_TOKEN = 'TESTPAGE' + 'p'.repeat(56)

// Stand-in Graph API: one Page, posts accepted, scheduled ones not yet live.
const calls = []
const graph = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c.toString('latin1')))
  req.on('end', () => {
    const u = new URL(req.url, 'http://x')
    calls.push({ method: req.method, path: u.pathname, scheduled: /scheduled_publish_time/.test(body), photo: /name="source"/.test(body) })
    const send = (code, j) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)) }
    if ((req.headers.authorization || '') !== `Bearer ${PAGE_TOKEN}`) return send(400, { error: { message: 'Invalid OAuth access token.' } })
    if (u.pathname === '/me') return send(200, { id: '777', name: 'Infinite Variance', category: 'Software', link: 'https://www.facebook.com/infinitevariance' })
    if (u.pathname === '/777/photos') return send(200, { id: '1', post_id: `777_${calls.length}` })
    if (u.pathname === '/777/feed') return send(200, { id: `777_${calls.length}` })
    if (req.method === 'DELETE') return send(200, { success: true })
    if (req.method === 'GET') return send(200, { id: u.pathname.slice(1), is_published: true, permalink_url: `https://www.facebook.com/infinitevariance/posts${u.pathname}` })
    send(404, { error: { message: 'nope' } })
  })
})
await new Promise((r) => graph.listen(0, '127.0.0.1', r))

// Seed: one brand, X added, an approved Facebook post with a picture for in 3 days and one due within the hour.
const seed = s.openDb(join(data, 'signal.db'))
const b = s.createBrand(seed, { name: 'Infinite Variance', profile: { offer: 'Free AI film tools', audience: 'Creators', voice: 'Plain and direct' } })
s.saveChannel(seed, { brand_id: b.id, channel: 'instagram', handle: '@itsvariance' })
const img = join(data, 'still.png')
copyFileSync(join(root, 'test', 'fixtures', 'studio-open.png'), img)
const m = s.importMedia(seed, { brand_id: b.id, path: img, alt_text: 'A still from IV Studio' }, { dataDir: data })
const later = s.createPost(seed, { brand_id: b.id, title: 'IV Studio 1.1', variants: [{ channel: 'facebook', text: 'IV Studio 1.1 is out. Free, on your own PC.', media_ids: [m.id], planned_for: new Date(Date.now() + 3 * 864e5).toISOString() }] })
const soon = s.createPost(seed, { brand_id: b.id, title: 'Academy reminder', variants: [{ channel: 'facebook', text: 'IV Academy is free to join.', planned_for: new Date(Date.now() + 5 * 60e3).toISOString() }] })
s.approvePosts(seed, [later.id, soon.id])
seed.close()

const errors = []
const results = []
const app = await electron.launch({ args: [join(root, 'out', 'main', 'index.js')], cwd: root, env: { ...process.env, IV_SIGNAL_DATA_DIR: data, IV_SIGNAL_TEST_NO_OPEN: '1', IV_SIGNAL_GRAPH_URL: `http://127.0.0.1:${graph.address().port}` } })
const win = await app.firstWindow()
win.on('pageerror', (e) => errors.push(String(e)))
win.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
let n = 0
const shot = (name) => win.screenshot({ path: join(out, `${String(++n).padStart(2, '0')}-${name}.png`) })
const db = () => s.openDb(join(data, 'signal.db'))
const one = (sql, ...a) => { const d = db(); try { return d.prepare(sql).get(...a) } finally { d.close() } }
const ok = (c, msg) => { if (!c) throw new Error(msg) }
async function step(name, fn) {
  const before = errors.length
  try {
    await fn()
    if (errors.length > before) throw new Error(`page error: ${errors.slice(before).join(' | ')}`)
    results.push({ name, ok: true }); console.log(`PASS  ${name}`)
  } catch (e) {
    results.push({ name, ok: false }); console.log(`FAIL  ${name}: ${e.message.split('\n')[0]}`)
    await shot('FAIL').catch(() => {})
    await win.keyboard.press('Escape').catch(() => {})
  }
}
const nav = async (label) => { await win.locator('nav.side .nav button', { hasText: label }).first().click(); await win.waitForTimeout(600) }

for (const [w, h] of [[1440, 900], [1100, 720]]) {
  await step(`Networks page at ${w}`, async () => {
    await win.setViewportSize({ width: w, height: h })
    await win.waitForTimeout(1200)
    await win.keyboard.press('Escape').catch(() => {})
    await nav('Networks')
    ok(await win.locator('.net-tile').count() === 9, 'nine network tiles')
    ok(await win.locator('.net-tile svg').count() === 9, 'every tile has a logo')
    const over = await win.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    ok(over <= 0, `page scrolls sideways by ${over}px`)
    await shot(`networks-${w}`)
  })
}
await win.setViewportSize({ width: 1440, height: 900 })

await step('Connect X in its pop-up', async () => {
  await win.locator('.net-tile', { hasText: 'X' }).filter({ hasNot: win.locator('text=TikTok') }).getByRole('button', { name: 'Connect' }).click()
  const d = win.locator('dialog.net-dialog')
  await d.waitFor()
  await shot('x-dialog')
  await d.getByLabel('Handle or page name').fill('@itsvariance')
  await d.getByLabel('Link to the account').fill('x.com/itsvariance')
  await d.getByRole('button', { name: 'Add X' }).click()
  await d.waitFor({ state: 'detached' })
  ok(one("select handle, url from channels where channel = 'x'")?.url === 'https://x.com/itsvariance', 'X saved')
})

await step('Facebook Page connects with a token in the pop-up', async () => {
  await win.locator('.net-tile', { hasText: 'Facebook' }).getByRole('button', { name: 'Connect' }).click()
  const d = win.locator('dialog.net-dialog')
  await d.getByRole('button', { name: 'Connect a Page' }).click()
  await shot('facebook-steps')
  await d.getByLabel('Facebook Page access token').fill('not-a-token-' + 'x'.repeat(40))
  await d.getByRole('button', { name: 'Connect', exact: true }).click()
  await win.waitForTimeout(800)
  ok(await d.getByText('Connected to').count() === 0, 'a bad token must not connect')
  await d.getByLabel('Facebook Page access token').fill(PAGE_TOKEN)
  await d.getByRole('button', { name: 'Connect', exact: true }).click()
  await d.getByText('Connected to').waitFor({ timeout: 8000 })
  await shot('facebook-connected')
  await win.keyboard.press('Escape')
  await win.locator('.net-tile', { hasText: 'Facebook' }).locator('.net-state.is-direct').waitFor()
  ok(one("select status from channels where channel = 'facebook'")?.status === 'connected', 'channel marked connected')
  await shot('networks-connected')
})

await step('Schedule a later Facebook post from the Calendar', async () => {
  await nav('Calendar')
  const panel = win.locator('section.panel', { hasText: 'Schedule on Facebook' })
  await panel.getByRole('button', { name: 'Schedule on Facebook' }).click()
  await win.locator('section.panel', { hasText: 'Waiting on Facebook' }).waitFor({ timeout: 8000 })
  await shot('calendar-scheduled')
  const c = calls.find((x) => x.path === '/777/photos')
  ok(c && c.scheduled && c.photo, 'picture sent with a schedule time')
  ok(one("select status from deliveries order by created_at desc limit 1").status === 'scheduled', 'delivery scheduled')
})

await step('Post now asks first, then posts', async () => {
  const row = win.locator('.posting-row', { hasText: 'Academy reminder' })
  await row.getByRole('button', { name: 'Post now on Facebook' }).click()
  await row.getByText('goes public straight away').waitFor()
  await shot('post-now-confirm')
  await row.getByRole('button', { name: 'Yes, post it now' }).click()
  await win.waitForTimeout(1200)
  const v = one("select v.status, v.posted_url from variants v join posts p on p.id = v.post_id where p.title = 'Academy reminder'")
  ok(v.status === 'posted' && v.posted_url.includes('facebook.com'), 'marked posted with its link')
})

await step('Cancel the scheduled one', async () => {
  await win.locator('section.panel', { hasText: 'Waiting on Facebook' }).getByRole('button', { name: 'Cancel it' }).click()
  await win.locator('section.panel', { hasText: 'Schedule on Facebook' }).waitFor({ timeout: 8000 })
  ok(calls.some((c) => c.method === 'DELETE'), 'deleted on Facebook')
  ok(one("select status from deliveries where status = 'cancelled'"), 'delivery cancelled')
})

await step('The token never reaches the window or the settings file in plain text', async () => {
  const settings = await win.evaluate(() => window.ivsignal.call('appSettings'))
  ok(!JSON.stringify(settings).includes(PAGE_TOKEN) && !('meta' in settings), 'appSettings hides it')
  const { readFileSync } = await import('node:fs')
  ok(!readFileSync(join(data, 'app-settings.json'), 'utf8').includes(PAGE_TOKEN), 'stored encrypted')
})

for (const [page, label, count] of [['channels', 'Networks', 2], ['calendar', 'Calendar', 4], ['library', 'Library', 2], ['approve', 'Approve', 3]]) {
  await step(`${label} tour walks every stop`, async () => {
    await nav(label)
    await win.evaluate((p) => window.dispatchEvent(new CustomEvent('iv:guide', { detail: { steps: { channels: ['channels', 'facebook_connect'], calendar: ['calendar', 'to_post', 'facebook_post', 'results'], library: ['library', 'make_picture'], approve: ['approve', 'checks', 'approval_pack'] }[p] } })), page)
    const card = win.locator('.guide-card')
    for (let i = 1; i <= count; i++) {
      await card.getByText(`${i} of ${count}`).waitFor({ timeout: 5000 })
      const box = await card.boundingBox()
      ok(box && box.y >= 0 && box.y + box.height <= 900 && box.x >= 0 && box.x + box.width <= 1440, `card ${i} outside the window`)
      if (i === 2 && page === 'channels') await shot('tour-facebook-connect')
      await card.getByRole('button', { name: i === count ? 'Got it' : 'Next →' }).click()
    }
    await card.waitFor({ state: 'detached' })
  })
}

await app.close()
graph.close()
rmSync(data, { recursive: true, force: true })
const failed = results.filter((r) => !r.ok)
console.log(`${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
