// A real update check against the private repo, from a copy that never installs: the copy (built with an older
// version label) must find the latest release, download it and verify it (status "ready").
// Usage: node scripts/update-check.mjs <path-to-older IV Signal.exe>   (uses the GitHub CLI sign-in on this PC)
import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const exe = resolve(process.argv[2])
const data = mkdtempSync(join(tmpdir(), 'ivsignal-update-'))
writeFileSync(join(data, 'app-settings.json'), JSON.stringify({ updateUseGh: true }))
const app = await electron.launch({ executablePath: exe, env: { ...process.env, IV_SIGNAL_DATA_DIR: data, IV_SIGNAL_UPDATE_NO_INSTALL: '1' } })
const win = await app.firstWindow()
const started = Date.now()
let s
for (;;) {
  await win.waitForTimeout(3000)
  s = await win.evaluate(() => window.ivsignal.call('updateState'))
  if (['ready', 'error', 'current', 'needs-key'].includes(s.status) && Date.now() - started > 12000) break
  if (Date.now() - started > 8 * 60e3) break
}
console.log(JSON.stringify({ version: s.version, status: s.status, available: s.available, keySource: s.keySource, error: s.error, seconds: Math.round((Date.now() - started) / 1000) }))
await win.keyboard.press('Escape')
await win.waitForTimeout(800)
await win.locator('nav.side .nav button', { hasText: 'Settings' }).first().click()
await win.evaluate(() => document.getElementById('setup-updates')?.scrollIntoView())
await win.waitForTimeout(600)
await win.screenshot({ path: join(resolve(process.argv[3] || '.'), 'update-settings.png') })
await app.close()
rmSync(data, { recursive: true, force: true })
process.exit(s.status === 'ready' ? 0 : 1)
