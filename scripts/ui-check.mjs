// Opens the built app on a throwaway data folder with a fictional brand, visits every page, saves a screenshot of each
// and fails on any page error. Usage: node scripts/ui-check.mjs <out-dir> [--empty]
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as s from '../src/core/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] || join(root, 'docs', 'verification', 'ui'))
const empty = process.argv.includes('--empty')
mkdirSync(out, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'ivsignal-ui-'))

if (!empty) {
  const db = s.openDb(join(data, 'signal.db'))
  const b = s.createBrand(db, { name: 'Kiln & Co', profile: { offer: 'Hand-thrown stoneware mugs, made in small batches in Columbus', audience: 'Coffee people who buy fewer, better things', voice: 'Warm, plain, a little dry. Short sentences. No hype.', website: 'kilnandco.example', prohibited: ['best in the world', 'microwave safe'] } })
  for (const [kind, text] of [['fact', 'Every mug is thrown by hand by Ada, who started Kiln & Co in 2019.'], ['voice', 'Sign off with "From the kiln," never with exclamation marks.'], ['rule', 'Never promise delivery dates before the batch is fired.'], ['lesson', 'Close-ups of glaze drips got twice the saves of table shots in October.']]) s.addBrainNote(db, { brand_id: b.id, kind, text, source: kind === 'lesson' ? 'Instagram insights, October' : '' })
  for (const c of ['instagram', 'facebook', 'linkedin']) s.saveChannel(db, { brand_id: b.id, channel: c, handle: '@kilnandco' })
  s.createCampaign(db, { brand_id: b.id, name: 'Holiday batch', goal: 'Sell out the 40 holiday mugs', starts_on: '2026-11-20', ends_on: '2026-12-15' })
  const img = s.importMedia(db, { brand_id: b.id, path: join(root, 'src', 'renderer', 'src', 'assets', 'signal-library.webp'), alt_text: '' }, { dataDir: data })
  const day = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 30, 0, 0); return x.toISOString() }
  const due = s.createPost(db, { brand_id: b.id, title: 'Holiday batch is out of the kiln', idea: '40 mugs, two new glazes, opens Friday at 9.', variants: [
    { channel: 'instagram', text: 'Forty mugs. Two new glazes. Out of the kiln this morning.\n\nThe shop opens Friday at 9.\n\nFrom the kiln,\nAda', media_ids: [img.id], alt_text: 'Stoneware mugs cooling on a wooden shelf', planned_for: new Date(Date.now() - 600e3).toISOString() },
    { channel: 'linkedin', text: 'Small-batch update: our holiday run of 40 mugs is out of the kiln, with two new glazes. The shop opens Friday at 9.', planned_for: day(1, 9) },
  ] })
  s.approvePosts(db, [due.id])
  s.createPost(db, { brand_id: b.id, title: 'Why we fire twice', idea: 'Bisque, then glaze.', variants: [
    { channel: 'facebook', text: 'Every mug goes through the kiln twice: once to harden the clay, once to melt the glaze into glass.', planned_for: day(2, 10) },
    { channel: 'x', text: 'Every mug goes through the kiln twice: once to harden the clay, once to melt the glaze into glass. That second firing is where the colour happens, and it is the best in the world at surprising us. From the kiln, Ada. '.repeat(1) + 'x'.repeat(40), planned_for: day(2, 10) },
  ] })
  const old = s.createPost(db, { brand_id: b.id, title: 'Studio Saturday', variants: [{ channel: 'facebook', text: 'Studio is open Saturday 10 to 2.', planned_for: day(-2, 11) }] })
  s.approvePosts(db, [old.id])
  s.markPosted(db, s.getPost(db, old.id).variants[0].id, { url: 'https://www.facebook.com/kilnandco/posts/1' })
  db.close()
}

const app = await electron.launch({ args: [join(root, 'out', 'main', 'index.js')], cwd: root, env: { ...process.env, IV_SIGNAL_DATA_DIR: data } })
const errors = []
const win = await app.firstWindow()
win.on('pageerror', (e) => errors.push(String(e)))
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForTimeout(1500)
const shot = (name) => win.screenshot({ path: join(out, `${name}.png`) })
if (empty) {
  await shot('0-welcome')
} else {
  const pages = ['Today', 'Brand Brain', 'Create', 'Approve', 'Calendar', 'Library', 'Networks', 'Settings']
  // Anything wider than the page, on every page at a wide and a narrow window (the header art's SVG is meant to bleed).
  for (const width of [1440, 1100]) {
    await win.setViewportSize({ width, height: width === 1440 ? 900 : 720 })
    for (const label of pages) {
      await win.locator('nav.side .nav button', { hasText: label }).first().click()
      await win.waitForTimeout(500)
      const wide = await win.evaluate(() => {
        const main = document.querySelector('main')
        const edge = main.getBoundingClientRect().right
        return { scroll: main.scrollWidth - main.clientWidth, els: [...main.querySelectorAll('*')].filter((el) => !el.closest('svg') && el.getBoundingClientRect().right > edge + 2).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`).slice(0, 4) }
      })
      if (wide.scroll > 2 || wide.els.length) errors.push(`${label} at ${width}px is ${wide.scroll}px too wide: ${wide.els.join(', ')}`)
    }
  }
  await win.setViewportSize({ width: 1440, height: 900 })
  for (const [i, label] of pages.entries()) {
    await win.locator('nav.side .nav button', { hasText: label }).first().click()
    await win.waitForTimeout(700)
    await shot(`${i + 1}-${label.toLowerCase().replace(/\s+/g, '-')}`)
    await win.evaluate(() => document.querySelector('main').scrollTo({ top: 520, behavior: 'instant' }))
    await win.waitForTimeout(250)
    await shot(`${i + 1}-${label.toLowerCase().replace(/\s+/g, '-')}-lower`)
  }
  // Open a post in Create.
  await win.locator('nav.side .nav button', { hasText: 'Create' }).first().click()
  await win.locator('.post-list li button').first().click()
  await win.waitForTimeout(700)
  await shot('9-create-open')
  await win.setViewportSize({ width: 1100, height: 720 })
  await win.waitForTimeout(400)
  await shot('10-create-narrow')
  // Anything wider than the page (the header art's decorative SVG is meant to bleed, so it's left out).
  const wide = await win.evaluate(() => [...document.querySelectorAll('main *')].filter((el) => !el.closest('svg') && el.getBoundingClientRect().right > document.querySelector('main').getBoundingClientRect().right + 2).map((el) => `${el.tagName}.${String(el.className)}`).slice(0, 5))
  if (wide.length) errors.push(`Content wider than the page at 1100px: ${wide.join(', ')}`)
}
await app.close()
rmSync(data, { recursive: true, force: true })
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'No page errors.')
console.log(`Screenshots in ${out}`)
process.exit(errors.length ? 1 : 0)
