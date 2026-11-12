import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const server = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'mcp', 'server.js')

async function connect(env) {
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], env: { ...process.env, ...env } }))
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args })
    const text = r.content?.[0]?.text || ''
    if (r.isError) throw new Error(text)
    return JSON.parse(text)
  }
  return { client, call }
}

test('an outside agent drafts, gets checked, and its changes are logged as an agent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ivsignal-mcp-'))
  const { client, call } = await connect({ IV_SIGNAL_DATA_DIR: dir })
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name)
    assert.ok(tools.length >= 30, `only ${tools.length} tools`)
    assert.ok(tools.every((t) => t.startsWith('signal_')))
    const brand = await call('signal_create_brand', { name: 'Kiln', profile: { offer: 'Mugs', audience: 'Coffee people', prohibited: ['best in the world'] } })
    await call('signal_add_brain_note', { brand_id: brand.id, kind: 'voice', text: 'Short sentences. No hype.' })
    const brief = await call('signal_get_brand', { brand_id: brand.id })
    assert.deepEqual(brief.brain.voice, ['Short sentences. No hype.'])
    const post = await call('signal_draft_post', { brand_id: brand.id, title: 'Batch', variants: [{ channel: 'x', text: 'The best in the world, out Friday.' }, { channel: 'linkedin', text: 'Our holiday batch is out Friday.' }] })
    assert.equal(post.blocking, true)
    const refused = await call('signal_approve_posts', { post_ids: [post.id] })
    assert.equal(refused[0].approved, false)
    await call('signal_edit_variant', { post_id: post.id, channel: 'x', text: 'Holiday batch, out Friday.' })
    const ok = await call('signal_approve_posts', { post_ids: [post.id] })
    assert.equal(ok[0].approved, true)
    const queue = await call('signal_posting_queue', { brand_id: brand.id })
    assert.equal(queue.length, 2)
    const log = await call('signal_activity', { brand_id: brand.id })
    assert.ok(log.length >= 4)
    assert.ok(log.every((e) => e.actor === 'agent'), 'outside changes are logged as an agent')
  } finally {
    await client.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('in the in-app chat, approving waits for the Allow card', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ivsignal-mcp-'))
  const asks = join(dir, 'asks')
  mkdirSync(asks, { recursive: true })
  const { client, call } = await connect({ IV_SIGNAL_DATA_DIR: dir, IV_SIGNAL_AGENT_RUN: 'chat', IV_SIGNAL_AGENT_ASK: asks, IV_SIGNAL_ACTOR: 'chat:claude', IV_SIGNAL_AGENT_ASK_MS: '8000' })
  // Answer each ask card as it appears: no to the first, yes to the second.
  const answers = [false, true]
  const answered = new Set()
  const timer = setInterval(() => {
    for (const f of readdirSync(asks)) {
      if (!f.endsWith('.ask.json') || answered.has(f)) continue
      answered.add(f)
      writeFileSync(join(asks, f.replace('.ask.json', '.answer.json')), JSON.stringify({ allow: answers.shift() }))
    }
  }, 100)
  try {
    const brand = await call('signal_create_brand', { name: 'Kiln' })
    const post = await call('signal_draft_post', { brand_id: brand.id, variants: [{ channel: 'linkedin', text: 'Out Friday.' }] })
    await assert.rejects(() => call('signal_approve_posts', { post_ids: [post.id] }), /Don't allow/)
    const ok = await call('signal_approve_posts', { post_ids: [post.id] })
    assert.equal(ok[0].approved, true)
    const log = await call('signal_activity', { brand_id: brand.id })
    assert.ok(log.some((e) => e.kind === 'post_approved' && e.actor === 'chat:claude'))
  } finally {
    clearInterval(timer)
    await client.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
