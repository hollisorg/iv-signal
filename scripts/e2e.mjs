// A full click-through of the built app on a throwaway data folder with three made-up brands. Every step uses the
// window the way a person would (clicks and typing), then checks the database. Outside links are recorded, not opened.
// Usage: node scripts/e2e.mjs <out-dir> [--keep]   (--keep leaves the data folder and prints its path)
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as s from '../src/core/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] || join(root, 'docs', 'verification', 'e2e'))
const keep = process.argv.includes('--keep')
mkdirSync(out, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'ivsignal-e2e-'))
const fx = (f) => join(root, 'test', 'fixtures', f)
const results = []
const pageErrors = []
let shotN = 0

const app = await electron.launch({ args: [join(root, 'out', 'main', 'index.js')], cwd: root, env: { ...process.env, IV_SIGNAL_DATA_DIR: data, IV_SIGNAL_TEST_NO_OPEN: '1' } })
const win = await app.firstWindow()
win.on('pageerror', (e) => pageErrors.push(String(e)))
win.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()) })
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForTimeout(1500)

const db = () => s.openDb(join(data, 'signal.db'))
const q = (sql, ...a) => { const d = db(); try { return d.prepare(sql).all(...a) } finally { d.close() } }
const one = (sql, ...a) => q(sql, ...a)[0]
const call = (m, a) => win.evaluate(([m2, a2]) => window.ivsignal.call(m2, a2), [m, a])
const shot = (name) => win.screenshot({ path: join(out, `${String(++shotN).padStart(2, '0')}-${name}.png`) })
const nav = async (label) => { await win.locator('nav.side .nav button', { hasText: label }).first().click(); await win.waitForTimeout(500) }
const main = () => win.locator('main')
const btn = (name, scope = main()) => scope.getByRole('button', { name, exact: false }).first()
const toast = async () => (await win.locator('.toast').first().textContent({ timeout: 4000 }).catch(() => '')) || ''
async function step(name, fn) {
  const before = pageErrors.length
  try {
    await fn()
    if (pageErrors.length > before) throw new Error(`page error: ${pageErrors.slice(before).join(' | ')}`)
    results.push({ name, ok: true })
    console.log(`PASS  ${name}`)
  } catch (e) {
    results.push({ name, ok: false, error: e.message.split('\n')[0] })
    console.log(`FAIL  ${name}: ${e.message.split('\n')[0]}`)
    await shot(`FAIL-${name.replace(/\W+/g, '-').slice(0, 40)}`).catch(() => {})
    await win.keyboard.press('Escape').catch(() => {})
  }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg) }

// ---- 1. Guided setup creates the first brand ----
await step('guided setup creates Kiln & Co with three networks', async () => {
  const dlg = win.locator('dialog.onboarding')
  await dlg.waitFor({ timeout: 8000 })
  await shot('welcome')
  await btn('started', dlg).click()
  await btn('Product brand', dlg).click()
  await dlg.getByLabel('Your first name (optional)').fill('Ada')
  await dlg.getByLabel('Brand name').fill('Kiln & Co')
  await dlg.getByLabel('What does it offer?').fill('Hand-thrown stoneware mugs and bowls, made in small batches in Columbus, Ohio')
  await dlg.getByLabel('Who is it for?').fill('Coffee people who buy fewer, better things')
  await dlg.getByLabel('Website (optional)').fill('kilnandco.example')
  await btn('Continue', dlg).click()
  await dlg.getByLabel('How it sounds').fill('Warm, plain, a little dry. Short sentences. No hype, no exclamation marks.')
  await btn('Continue', dlg).click()
  await btn('Continue', dlg).click() // agent step
  await btn('TikTok', dlg).click()
  await btn('LinkedIn', dlg).click() // off again
  await btn('Continue', dlg).click()
  await shot('setup-ready')
  await btn('Save & start', dlg).click()
  await dlg.waitFor({ state: 'detached', timeout: 8000 })
  const b = one("select * from brands where name = 'Kiln & Co'")
  ok(b, 'brand not created')
  const p = JSON.parse(b.profile_json)
  ok(p.voice?.startsWith('Warm'), 'voice not saved')
  ok(p.website === 'https://kilnandco.example/', `website ${p.website}`)
  const ch = q('select channel from channels where brand_id = ? order by channel', b.id).map((r) => r.channel)
  ok(JSON.stringify(ch) === JSON.stringify(['facebook', 'instagram', 'tiktok']), `channels ${ch}`)
  await win.waitForTimeout(800)
  await shot('today-first')
})

// ---- 2. Two more brands through the brand switcher ----
for (const [name, offer, audience] of [
  ['Northside Physio', 'Sports physiotherapy and running clinics in Northside', 'Weekend runners and people coming back from injury'],
  ['Volt Coffee Roasters', 'Small-lot coffee roasted every Tuesday, sold online and at two cafes', 'Home brewers who care where their beans come from'],
]) {
  await step(`add the brand ${name}`, async () => {
    await win.locator('.workspace-brand').click()
    await win.locator('.brand-switch').getByRole('menuitem', { name: /Add a brand/ }).click()
    const dlg = win.locator('dialog.brand-dialog')
    await dlg.getByLabel('Brand name').fill(name)
    await dlg.getByLabel('What it offers').fill(offer)
    await dlg.getByLabel('Who it\'s for').fill(audience)
    await btn('Add the brand', dlg).click()
    await dlg.waitFor({ state: 'detached', timeout: 6000 })
    await win.waitForTimeout(600)
    ok(one('select count(*) n from brands where name = ?', name).n === 1, 'not created')
    ok((await win.locator('.workspace-brand strong').textContent()).includes(name), 'not switched to the new brand')
  })
}

await step('switch back to Kiln & Co', async () => {
  await win.locator('.workspace-brand').click()
  await win.locator('.brand-switch').getByRole('menuitem', { name: /Kiln & Co/ }).click()
  await win.waitForTimeout(600)
  ok((await win.locator('.workspace-brand strong').textContent()).includes('Kiln'), 'still on another brand')
})
const kiln = one("select id from brands where name = 'Kiln & Co'").id

// ---- 3. Brand Brain ----
await step('Brand Brain: save products and visual standards', async () => {
  await nav('Brand Brain')
  await main().getByLabel('Products and prices').fill('The 12 oz mug ($38), the travel cup ($44), seconds sale every March')
  await main().getByLabel('Visual standards').fill('Natural light, real hands, earthy backgrounds. No stock photos.')
  await btn('Save the basics').click()
  await win.waitForTimeout(600)
  const p = JSON.parse(one('select profile_json from brands where id = ?', kiln).profile_json)
  ok(p.products?.includes('$38') && p.visual?.startsWith('Natural'), 'profile not saved')
  ok(p.offer?.startsWith('Hand-thrown'), 'saving the basics lost the offer')
})
await step('Brand Brain: Never say list add and remove', async () => {
  for (const phrase of ['best in the world', 'microwave safe', 'cheapest']) {
    await main().getByLabel('A phrase the brand never says').fill(phrase)
    await main().locator('[data-guide="brand-never"]').getByRole('button', { name: 'Add' }).click()
    await win.waitForTimeout(400)
  }
  await main().getByRole('button', { name: 'Remove cheapest' }).click()
  await win.waitForTimeout(500)
  const p = JSON.parse(one('select profile_json from brands where id = ?', kiln).profile_json)
  ok(JSON.stringify(p.prohibited) === JSON.stringify(['best in the world', 'microwave safe']), `list ${p.prohibited}`)
})
await step('Brand Brain: notes by kind, add and remove', async () => {
  const notes = main().locator('[data-guide="brand-notes"]')
  await notes.getByRole('tab', { name: /Facts/ }).click()
  await notes.getByLabel('New note').fill('Every mug is thrown by hand by Ada, who started Kiln & Co in 2019.')
  await notes.getByLabel('Source').fill('Ada, by chat')
  await btn('Save note', notes).click()
  await win.waitForTimeout(400)
  await notes.getByRole('tab', { name: /Rules/ }).click()
  await notes.getByLabel('New note').fill('Never promise delivery dates before the batch is fired.')
  await btn('Save note', notes).click()
  await win.waitForTimeout(400)
  await notes.getByLabel('New note').fill('A rule to delete')
  await btn('Save note', notes).click()
  await win.waitForTimeout(400)
  await notes.locator('.brain-notes li', { hasText: 'A rule to delete' }).getByRole('button', { name: 'Remove' }).click()
  await win.waitForTimeout(400)
  const rows = q('select kind, text from brain where brand_id = ? order by kind', kiln)
  ok(rows.length === 2 && rows.some((r) => r.kind === 'fact') && rows.some((r) => r.kind === 'rule'), JSON.stringify(rows))
})
await step('Brand Brain: start, pause and resume a campaign', async () => {
  const sec = main().locator('section', { hasText: 'A named push' })
  await sec.getByLabel('Name').fill('Holiday batch')
  await sec.getByLabel('Goal').fill('Sell out the 40 holiday mugs')
  await sec.getByLabel('Starts').fill('2026-11-20')
  await sec.getByLabel('Ends').fill('2026-12-15')
  await btn('Start the campaign', sec).click()
  await win.waitForTimeout(500)
  await btn('Pause', sec).click()
  await win.waitForTimeout(400)
  ok(one("select status from campaigns where name = 'Holiday batch'").status === 'paused', 'not paused')
  await btn('Resume', sec).click()
  await win.waitForTimeout(400)
  ok(one("select status from campaigns where name = 'Holiday batch'").status === 'active', 'not resumed')
  await shot('brand-brain')
})

// ---- 4. Library ----
await step('Library: add three pictures and a video, describe one', async () => {
  await nav('Library')
  for (const f of ['mug-shelf.jpg', 'glaze-closeup.jpg', 'studio-open.png', 'kiln-reel.mp4']) await call('importMediaPath', { brand_id: kiln, path: fx(f) })
  await win.waitForTimeout(800)
  ok((await main().locator('.media-card').count()) === 4, 'not 4 cards')
  const again = await call('importMediaPath', { brand_id: kiln, path: fx('mug-shelf.jpg') })
  ok(again.already, 'the same file was added twice')
  const card = main().locator('.media-card', { hasText: 'mug-shelf.jpg' })
  await card.getByRole('textbox').fill('Six stoneware mugs cooling on a wooden shelf')
  await card.getByRole('textbox').blur()
  await win.waitForTimeout(600)
  ok(one("select alt_text from media where name = 'mug-shelf.jpg'").alt_text?.startsWith('Six'), 'alt text not saved')
  const m = one("select width, height from media where name = 'mug-shelf.jpg'")
  ok(m.width === 1080 && m.height === 1080, `size ${m.width}x${m.height}`)
  await shot('library')
})

// ---- 5. Create: one idea, three networks, checks, approval ----
let postId
await step('Create: start a post myself for Instagram, Facebook and X', async () => {
  await nav('Create')
  await main().getByLabel('The idea').fill('Our holiday batch is out of the kiln: 40 mugs, two new glazes, Juniper and Ember. The shop opens Friday at 9.')
  await main().getByLabel('Title (optional)').fill('Holiday batch is out')
  await main().getByLabel('Campaign (optional)').selectOption({ label: 'Holiday batch' })
  await btn('TikTok').click() // the brand's default networks include TikTok; leave it out of this one
  await btn('X').click()
  await btn('Start them myself').click()
  await win.waitForTimeout(800)
  postId = one("select id from posts where title = 'Holiday batch is out'")?.id
  ok(postId, 'post not created')
  const ch = q('select channel from variants where post_id = ? order by channel', postId).map((r) => r.channel)
  ok(JSON.stringify(ch) === JSON.stringify(['facebook', 'instagram', 'x']), `versions ${ch}`)
  ok(one('select campaign_id from posts where id = ?', postId).campaign_id, 'campaign not set')
})
await step('Create: checks block approval (Instagram needs a picture)', async () => {
  await win.waitForTimeout(400)
  ok(await main().getByRole('button', { name: 'Approve this post' }).isDisabled(), 'Approve was enabled with blocking issues')
  ok((await main().locator('.variant', { hasText: 'Instagram' }).locator('.issues').textContent()).includes('needs a picture'), 'no picture issue shown')
})
await step('Create: X over its limit shows the count, then fixed', async () => {
  const x = main().locator('article.variant').filter({ has: win.locator('.chan.x') })
  await x.getByRole('textbox').first().fill('Forty mugs. Two new glazes, Juniper and Ember, the colours of a December evening in the studio when the kiln is still warm and the shelves are full. The shop opens Friday at 9, and when these are gone they are gone until spring, because every one is thrown by hand and fired twice. From the kiln, Ada.')
  ok((await x.locator('header .mono').textContent()).includes('/ 280'), 'no X counter')
  ok(await x.locator('header .mono.bad').count() === 1, 'counter not red over the limit')
  await btn('Save X', x).click()
  await win.waitForTimeout(600)
  ok((await main().locator('article.variant').filter({ has: win.locator('.chan.x') }).locator('.issues').textContent()).includes('allows 280'), 'limit issue not shown after saving')
  const x2 = main().locator('article.variant').filter({ has: win.locator('.chan.x') })
  await x2.getByRole('textbox').first().fill('Forty mugs. Two new glazes, Juniper and Ember. The shop opens Friday at 9. From the kiln, Ada.')
  await btn('Save X', x2).click()
  await win.waitForTimeout(600)
  ok(one("select text from variants where post_id = ? and channel = 'x'", postId).text.startsWith('Forty mugs. Two'), 'X text not saved')
})
await step('Create: add a picture and description to Instagram, plan Facebook', async () => {
  const ig = main().locator('article.variant').filter({ has: win.locator('.chan.instagram') })
  await btn('Picture or video', ig).click()
  await ig.locator('.media-pick button[title="mug-shelf.jpg"]').click()
  await win.waitForTimeout(700)
  const ig2 = main().locator('article.variant').filter({ has: win.locator('.chan.instagram') })
  await ig2.getByLabel('Picture description (alt text)').fill('Six stoneware mugs cooling on a wooden shelf')
  await btn('Save Instagram', ig2).click()
  await win.waitForTimeout(600)
  const fb = main().locator('article.variant').filter({ has: win.locator('.chan.facebook') })
  const when = new Date(Date.now() + 2 * 864e5)
  when.setHours(9, 30, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  await fb.getByLabel('Planned for').fill(`${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T09:30`)
  await btn('Save Facebook', fb).click()
  await win.waitForTimeout(600)
  const v = one("select media_json, alt_text from variants where post_id = ? and channel = 'instagram'", postId)
  ok(JSON.parse(v.media_json).length === 1 && v.alt_text, 'Instagram media or description not saved')
  const planned = one("select planned_for from variants where post_id = ? and channel = 'facebook'", postId).planned_for
  ok(planned && new Date(planned).getHours() === 9, `planned ${planned}`)
})
await step('Create: approve, then an edit withdraws the approval', async () => {
  await btn('Approve this post').click()
  await win.waitForTimeout(700)
  ok(one('select status from posts where id = ?', postId).status === 'approved', 'not approved')
  ok(one('select count(*) n from approvals where post_id = ?', postId).n === 1, 'no approval record')
  const fb = main().locator('article.variant').filter({ has: win.locator('.chan.facebook') })
  await fb.getByRole('textbox').first().fill('Forty mugs, two new glazes. The shop opens Friday at 9.')
  ok(await fb.getByText('Saving withdraws the approval').count() === 1, 'no warning before withdrawing approval')
  await btn('Save Facebook', fb).click()
  await win.waitForTimeout(700)
  ok(one('select status from posts where id = ?', postId).status === 'draft', 'approval not withdrawn')
  await shot('create-editor')
})

// ---- 6. A post that breaks a rule, and Approve ----
await step('Approve: a Never say phrase blocks a post; the clean one approves', async () => {
  await nav('Create')
  await btn('New post').click()
  await main().getByLabel('The idea').fill('Our mugs are the best in the world and they are microwave safe.')
  await btn('Start them myself').click()
  await win.waitForTimeout(800)
  await nav('Approve')
  await win.waitForTimeout(500)
  const bad = main().locator('article.draft', { hasText: 'best in the world' })
  ok((await bad.locator('.issues').allTextContents()).join(' ').includes('never claims'), 'rule not flagged')
  ok(await bad.getByRole('button', { name: 'Approve' }).isDisabled(), 'blocked post could be approved')
  const good = main().locator('article.draft', { hasText: 'Holiday batch is out' })
  await good.getByRole('button', { name: 'Approve' }).click()
  await win.waitForTimeout(700)
  ok(one('select status from posts where id = ?', postId).status === 'approved', 'not approved from Approve')
  await shot('approve')
})

// ---- 7. Calendar and posting by hand ----
await step('Calendar: the planned version shows, and posting by hand works', async () => {
  await nav('Calendar')
  await win.waitForTimeout(500)
  ok(await main().locator('.cal-item', { hasText: 'Holiday batch is out' }).count() >= 1, 'not on the calendar')
  const row = main().locator('.posting-row', { has: win.locator('.chan.instagram') })
  await btn('Copy & open Instagram', row).click()
  await win.waitForTimeout(500)
  const opened = await call('testOpened')
  ok(opened.some((u) => u.includes('instagram.com')), `opened ${opened}`)
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
  ok(clip === one("select text from variants where post_id = ? and channel = 'instagram'", postId).text, 'clipboard does not hold the Instagram words')
  await row.getByLabel('Link to the post').fill('instagram.com/p/kilnholiday')
  await btn('Mark posted', row).click()
  await win.waitForTimeout(700)
  const v = one("select status, posted_url from variants where post_id = ? and channel = 'instagram'", postId)
  ok(v.status === 'posted' && v.posted_url === 'https://instagram.com/p/kilnholiday', JSON.stringify(v))
  await btn('Later week').click()
  await btn('This week').click()
  await shot('calendar')
})

// ---- 8. Networks ----
await step('Networks: add X, open it, edit and remove TikTok', async () => {
  await nav('Networks')
  const x = main().locator('.connect-card', { has: win.locator('.chan.x') })
  await x.getByLabel('X handle').fill('@kilnandco')
  await x.getByLabel('X link').fill('x.com/kilnandco')
  await btn('Add X', x).click()
  await win.waitForTimeout(500)
  await btn('Open', main().locator('.connect-card', { has: win.locator('.chan.x') })).click()
  await win.waitForTimeout(300)
  ok((await call('testOpened')).some((u) => u === 'https://x.com/kilnandco'), 'X link not opened')
  const tt = main().locator('.connect-card', { has: win.locator('.chan.tiktok') })
  await btn('Remove', tt).click()
  await win.waitForTimeout(500)
  const ch = q('select channel from channels where brand_id = ? order by channel', kiln).map((r) => r.channel)
  ok(JSON.stringify(ch) === JSON.stringify(['facebook', 'instagram', 'x']), `channels ${ch}`)
})

// ---- 9. Archive and restore, Settings, the tour, the other brand ----
await step('Create: archive and restore the rule-breaking post', async () => {
  await nav('Create')
  await main().locator('.post-list li button', { hasText: 'best in the world' }).click()
  await btn('Archive').click()
  await win.waitForTimeout(500)
  const id = one("select id from posts where idea like '%best in the world%'").id
  ok(one('select status from posts where id = ?', id).status === 'archived', 'not archived')
  await main().getByRole('tab', { name: 'Archived' }).click()
  await main().locator('.post-list li button', { hasText: 'best in the world' }).click()
  await btn('Restore').click()
  await win.waitForTimeout(500)
  ok(one('select status from posts where id = ?', id).status === 'draft', 'not restored')
})
await step('Settings: activity log names who did what', async () => {
  await nav('Settings')
  await win.waitForTimeout(500)
  const text = await main().locator('.activity-list').textContent()
  ok(text.includes('Approved "Holiday batch is out"') && text.includes('You'), 'activity missing approval')
  await shot('settings')
})
await step('How this works: the Today tour runs to the end', async () => {
  await nav('Today')
  await btn('How this works', win.locator('.workspace-strip')).click()
  await win.locator('.guide-card').waitFor({ timeout: 5000 })
  for (let i = 0; i < 12; i++) {
    await win.waitForTimeout(500)
    const card = win.locator('.guide-card')
    if (!(await card.count())) break
    const next = card.getByRole('button', { name: /Next|Got it/ })
    if (!(await next.count())) break
    await next.first().click()
    await win.waitForTimeout(400)
  }
  ok(!(await win.locator('.guide-card').count()), 'tour did not finish')
})
await step('Other brands stay separate', async () => {
  await win.locator('.workspace-brand').click()
  await win.locator('.brand-switch').getByRole('menuitem', { name: /Northside Physio/ }).click()
  await win.waitForTimeout(700)
  await nav('Create')
  ok((await main().locator('.post-list li').count()) === 0, 'Northside shows Kiln posts')
  await nav('Library')
  ok((await main().locator('.media-card').count()) === 0, 'Northside shows Kiln pictures')
  await nav('Today')
  await shot('northside-today')
})
await step('Every page fits at 1100 wide with real data', async () => {
  await win.locator('.workspace-brand').click()
  await win.locator('.brand-switch').getByRole('menuitem', { name: /Kiln & Co/ }).click()
  await win.setViewportSize({ width: 1100, height: 720 })
  const bad = []
  for (const label of ['Today', 'Brand Brain', 'Create', 'Approve', 'Calendar', 'Library', 'Networks', 'Settings']) {
    await nav(label)
    const w = await win.evaluate(() => { const m = document.querySelector('main'); return m.scrollWidth - m.clientWidth })
    if (w > 2) bad.push(`${label} +${w}px`)
  }
  await win.setViewportSize({ width: 1440, height: 900 })
  ok(!bad.length, bad.join(', '))
})

await app.close()
const failed = results.filter((r) => !r.ok)
writeFileSync(join(out, 'results.json'), JSON.stringify({ results, pageErrors }, null, 1))
console.log(`\n${results.length - failed.length}/${results.length} passed${pageErrors.length ? `; page errors: ${pageErrors.length}` : ''}`)
if (keep) console.log(`Data kept in ${data}`)
else rmSync(data, { recursive: true, force: true })
process.exit(failed.length ? 1 : 0)
