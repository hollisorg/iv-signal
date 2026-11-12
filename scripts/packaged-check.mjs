// Checks a packaged build on a throwaway data folder: its MCP server (through the app's own exe in Node mode) lists
// IV Signal's tools and drafts a post, and its window opens every page with no page errors.
// Usage: node scripts/packaged-check.mjs [path-to-IV Signal.exe] [out-dir]
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const exe = resolve(process.argv[2] || join(root, 'dist', 'win-unpacked', 'IV Signal.exe'))
const out = resolve(process.argv[3] || join(root, 'docs', 'verification', 'packaged'))
mkdirSync(out, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'ivsignal-pkg-'))
const errors = []

// The MCP server, launched the way outside agents launch it.
const script = join(dirname(exe), 'resources', 'app.asar', 'out', 'main', 'mcp.js')
const client = new Client({ name: 'packaged-check', version: '1' })
await client.connect(new StdioClientTransport({ command: exe, args: [script], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', IV_SIGNAL_DATA_DIR: data } }))
const tools = (await client.listTools()).tools.map((t) => t.name)
const call = async (name, args) => { const r = await client.callTool({ name, arguments: args }); if (r.isError) throw new Error(r.content[0].text); return JSON.parse(r.content[0].text) }
const brand = await call('signal_create_brand', { name: 'Packaged Test', profile: { offer: 'Test mugs', audience: 'Testers', voice: 'Plain.' } })
const post = await call('signal_draft_post', { brand_id: brand.id, title: 'Hello', variants: [{ channel: 'linkedin', text: 'Hello from the packaged build.' }] })
await client.close()
console.log(`MCP: ${tools.length} tools; drafted "${post.title}" (${post.variants.length} version).`)
if (tools.length < 30 || !post.id) errors.push('MCP check failed')

// The window, on the same data.
const app = await electron.launch({ executablePath: exe, env: { ...process.env, IV_SIGNAL_DATA_DIR: data } })
const win = await app.firstWindow()
win.on('pageerror', (e) => errors.push(String(e)))
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForTimeout(2000)
const version = await app.evaluate(({ app: a }) => a.getVersion())
for (const label of ['Today', 'Brand Brain', 'Create', 'Approve', 'Calendar', 'Library', 'Networks', 'Settings']) {
  await win.locator('nav.side .nav button', { hasText: label }).first().click()
  await win.waitForTimeout(500)
}
await win.locator('nav.side .nav button', { hasText: 'Approve' }).first().click()
await win.waitForTimeout(800)
await win.screenshot({ path: join(out, 'packaged-approve.png') })
const seen = await win.evaluate(() => document.querySelector('.drafts')?.innerText || '')
if (!seen.includes('Hello from the packaged build.')) errors.push('The window did not show the post drafted through MCP.')
await app.close()
rmSync(data, { recursive: true, force: true })
console.log(`Window: version ${version}, 8 pages opened.`)
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'No errors. PASS')
process.exit(errors.length ? 1 : 0)
