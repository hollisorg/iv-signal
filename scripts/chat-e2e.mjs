// Real chat turns with Allow cards answered in the window, on a throwaway data folder with a made-up brand.
// For each agent: it drafts two posts, asks to approve the first (the test clicks Allow), then asks to approve the
// second (the test clicks Don't allow). Usage: node scripts/chat-e2e.mjs <out-dir> [claude,codex,hermes]
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as s from '../src/core/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(process.argv[2] || join(root, 'docs', 'verification', 'chat-e2e'))
const engines = (process.argv[3] || 'claude,codex,hermes').split(',')
mkdirSync(out, { recursive: true })
const report = []

for (const engine of engines) {
  const data = mkdtempSync(join(tmpdir(), `ivsignal-chat-${engine}-`))
  let db = s.openDb(join(data, 'signal.db'))
  const brand = s.createBrand(db, { name: 'Northside Physio', profile: { offer: 'Sports physiotherapy and a Saturday running clinic in Northside', audience: 'Weekend runners and people coming back from injury', voice: 'Calm, practical, encouraging. Plain words, no medical jargon, no exclamation marks.', prohibited: ['cure', 'guaranteed', 'pain-free'] } })
  s.addBrainNote(db, { brand_id: brand.id, kind: 'fact', text: 'The Saturday running clinic starts at 8 a.m. at the Northside track, is free, and runs every week until the end of March.' })
  s.addBrainNote(db, { brand_id: brand.id, kind: 'rule', text: 'Never give individual medical advice in a post; invite people to book an assessment instead.' })
  for (const c of ['linkedin', 'facebook']) s.saveChannel(db, { brand_id: brand.id, channel: c })
  db.close()
  writeFileSync(join(data, 'app-settings.json'), JSON.stringify({ chatEngine: engine, selectedBrandId: brand.id }))

  const app = await electron.launch({ args: [join(root, 'out', 'main', 'index.js')], cwd: root, env: { ...process.env, IV_SIGNAL_DATA_DIR: data, IV_SIGNAL_TEST_NO_OPEN: '1' } })
  const win = await app.firstWindow()
  const errors = []
  win.on('pageerror', (e) => errors.push(String(e)))
  await win.setViewportSize({ width: 1440, height: 900 })
  await win.waitForTimeout(1500)
  const call = (m, a) => win.evaluate(([m2, a2]) => window.ivsignal.call(m2, a2), [m, a])
  await call('chatNew', { engine })

  // One turn: send, click each Allow card as it appears with the given answer, wait for the end.
  const turn = async (text, answer) => {
    const t0 = Date.now()
    await call('chatSend', { text, engine })
    let asked = 0
    for (;;) {
      await win.waitForTimeout(1500)
      const btns = win.locator('.chat-ask-btns')
      if (await btns.count()) {
        await btns.first().getByRole('button', { name: answer === 'allow' ? 'Allow' : 'Don’t allow', exact: true }).click()
        asked += 1
      }
      const st = await call('chatStatus')
      if (!st.chat?.busy) return { seconds: Math.round((Date.now() - t0) / 1000), asked, chat: st.chat }
      if (Date.now() - t0 > 8 * 60e3) { await call('chatStop'); return { seconds: 480, asked, chat: st.chat, timeout: true } }
    }
  }
  const r1 = await turn('Draft two short posts about our free Saturday running clinic, each with a LinkedIn and a Facebook version, using only what my Brand Brain says. Save them as drafts and show me the first one.', null)
  const r2 = await turn('Good. Approve the first post you drafted.', 'allow')
  const r3 = await turn('Now approve the second post too.', 'deny')
  await win.waitForTimeout(800)
  await win.screenshot({ path: join(out, `chat-${engine}.png`) })
  await app.close()

  db = s.openDb(join(data, 'signal.db'))
  const posts = s.listPosts(db, { brand_id: brand.id, limit: 20 }).reverse()
  const events = s.listEvents(db, { brand_id: brand.id, limit: 50 })
  db.close()
  const said = (c) => c.entries.filter((e) => e.kind === 'agent').map((e) => e.text).join(' ').slice(-400)
  const row = {
    engine,
    drafted: posts.length,
    byChat: posts.every((p) => p.created_by === `chat:${engine}`),
    networks: posts.map((p) => p.variants.map((v) => v.channel).sort().join('+')),
    blockedDrafts: posts.filter((p) => p.blocking).length,
    approved: posts.filter((p) => p.status === 'approved').map((p) => p.title),
    stillDraft: posts.filter((p) => p.status === 'draft').map((p) => p.title),
    allowCards: [r2.asked, r3.asked],
    approvalLoggedAs: events.filter((e) => e.kind === 'post_approved').map((e) => e.actor),
    seconds: [r1.seconds, r2.seconds, r3.seconds],
    timeouts: [r1, r2, r3].some((r) => r.timeout),
    pageErrors: errors.length,
    lastWords: said(r3.chat),
    firstPost: posts[0]?.variants.map((v) => `[${v.channel}] ${v.text}`).join('\n'),
  }
  row.pass = row.drafted === 2 && row.byChat && row.approved.length === 1 && row.stillDraft.length === 1 && row.allowCards[0] >= 1 && row.allowCards[1] >= 1 && row.approvalLoggedAs.every((a) => a === `chat:${engine}`) && !row.timeouts && !row.pageErrors
  report.push(row)
  console.log(JSON.stringify(row, null, 1))
  rmSync(data, { recursive: true, force: true })
}
writeFileSync(join(out, 'chat-e2e.json'), JSON.stringify(report, null, 1))
console.log(report.map((r) => `${r.engine}: ${r.pass ? 'PASS' : 'FAIL'}`).join(' | '))
process.exit(report.every((r) => r.pass) ? 0 : 1)
