// One real in-app chat turn on a throwaway data folder: the person's own agent drafts a post through IV Signal's tools.
// Usage: node scripts/chat-check.mjs [claude|codex|hermes] [out-dir]
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as s from '../src/core/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const engine = process.argv[2] || 'claude'
const out = resolve(process.argv[3] || join(root, 'docs', 'verification', 'chat'))
mkdirSync(out, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'ivsignal-chat-'))
let db = s.openDb(join(data, 'signal.db'))
const brand = s.createBrand(db, { name: 'Kiln & Co', profile: { offer: 'Hand-thrown stoneware mugs, made in small batches in Columbus', audience: 'Coffee people who buy fewer, better things', voice: 'Warm, plain, a little dry. Short sentences. No hype, no exclamation marks.', prohibited: ['best in the world'] } })
s.addBrainNote(db, { brand_id: brand.id, kind: 'fact', text: 'The holiday batch is 40 mugs in two new glazes, Juniper and Ember. The shop opens Friday at 9 a.m.' })
s.saveChannel(db, { brand_id: brand.id, channel: 'linkedin' })
db.close()

const app = await electron.launch({ args: [join(root, 'out', 'main', 'index.js')], cwd: root, env: { ...process.env, IV_SIGNAL_DATA_DIR: data } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForTimeout(1500)
await win.evaluate((e) => window.ivsignal.call('saveAppSettings', { chatEngine: e }), engine)
const started = Date.now()
await win.evaluate(() => window.ivsignal.call('chatSend', { text: 'Draft one LinkedIn post about our holiday batch, using only what my Brand Brain says. Just save the draft; don\'t approve it.' }))
let status
for (;;) {
  await win.waitForTimeout(3000)
  status = await win.evaluate(() => window.ivsignal.call('chatStatus'))
  if (!status.chat?.busy) break
  if (Date.now() - started > 6 * 60e3) { await win.evaluate(() => window.ivsignal.call('chatStop')); errors.push('The turn took over 6 minutes.'); break }
}
await win.locator('nav.side .nav button', { hasText: 'Approve' }).first().click()
await win.waitForTimeout(1200)
await win.screenshot({ path: join(out, `chat-${engine}.png`) })
await app.close()

db = s.openDb(join(data, 'signal.db'))
const posts = s.listPosts(db, { brand_id: brand.id })
const steps = status.chat.entries.filter((e) => e.kind === 'step').map((e) => e.label)
const said = status.chat.entries.filter((e) => e.kind === 'say').map((e) => e.text).join('\n---\n')
console.log(`Engine ${engine}, ${Math.round((Date.now() - started) / 1000)} s`)
console.log('Steps:', steps.join(' | '))
console.log('Said:', said.slice(0, 900))
for (const p of posts) console.log(`POST "${p.title}" by ${p.created_by}, ${p.status}:`, p.variants.map((v) => `[${v.channel}] ${v.text}`).join(' / '))
const ok = posts.length === 1 && posts[0].created_by === `chat:${engine}` && posts[0].status === 'draft' && posts[0].variants.some((v) => v.channel === 'linkedin')
db.close()
rmSync(data, { recursive: true, force: true })
console.log(errors.length ? `ERRORS: ${errors.join('; ')}` : 'No page errors.', ok ? 'PASS' : 'FAIL')
process.exit(ok && !errors.length ? 0 : 1)
