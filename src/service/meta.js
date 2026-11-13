// Publishing to a Facebook Page through Meta's Graph API with a Page access token the person made themselves (Graph API
// Explorer on their own Meta app). Approved posts are scheduled on Facebook itself (published=false plus
// scheduled_publish_time), so they go out on time even when IV Signal is closed. IV_SIGNAL_GRAPH_URL points tests at a
// stand-in. Instagram needs pictures at a public web address, so it waits for the server.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const GRAPH = () => (process.env.IV_SIGNAL_GRAPH_URL || 'https://graph.facebook.com/v23.0').replace(/\/+$/, '')
// Facebook accepts a scheduled time between 10 minutes and 30 days ahead (it says 75 days for some Pages; 30 is safe).
export const MIN_AHEAD_MS = 11 * 60 * 1000
export const MAX_AHEAD_MS = 29 * 24 * 60 * 60 * 1000

async function graph(path, { token, method = 'GET', form = null, query = {} } = {}) {
  const url = new URL(`${GRAPH()}/${path.replace(/^\//, '')}`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  let body = null
  if (form) {
    body = new FormData()
    for (const [k, v] of Object.entries(form)) if (v !== undefined && v !== null) body.append(k, v)
  }
  const headers = { Authorization: `Bearer ${token}` }
  const r = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(120000) })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* not JSON */
  }
  if (!r.ok || json?.error) {
    const e = json?.error
    const msg = e?.error_user_msg || e?.message || `Facebook answered ${r.status}.`
    const err = new Error(/expired|session has expired/i.test(msg) ? 'The Facebook token has expired. Make a new one and connect again.' : /permission|\(#200\)|\(#10\)/i.test(msg) ? `Facebook refused: ${msg} The token needs pages_manage_posts and pages_read_engagement for this Page.` : `Facebook: ${msg}`)
    err.status = r.status
    throw err
  }
  return json
}

// Check a pasted token belongs to a Page (a Page token's /me is the Page itself) and return the Page.
export async function verifyPageToken(token) {
  const t = String(token || '').trim()
  if (!/^[A-Za-z0-9]{40,}$/.test(t)) throw new Error('That doesn’t look like a Facebook access token.')
  const me = await graph('me', { token: t, query: { fields: 'id,name,category,link' } })
  if (!me?.id || !me.category) throw new Error('That is a personal (user) token. Pick your Page in Graph API Explorer and copy the Page access token.')
  return { page_id: me.id, page_name: me.name, link: me.link || null }
}

// Schedule (or, with no time, publish now) one version on the Page. Returns { external_id, scheduled_for, url }.
export async function publishToPage({ token, page_id, text, imagePath = null, when = null }) {
  let schedule = {}
  let scheduledFor = null
  if (when) {
    const at = Date.parse(when)
    const ahead = at - Date.now()
    if (ahead < MIN_AHEAD_MS) throw new Error('Facebook needs at least 11 minutes to schedule. Pick a later time, or post now.')
    if (ahead > MAX_AHEAD_MS) throw new Error('Facebook schedules up to about 30 days ahead. Pick an earlier time.')
    schedule = { published: 'false', scheduled_publish_time: String(Math.floor(at / 1000)) }
    scheduledFor = new Date(at).toISOString()
  }
  if (imagePath) {
    const file = new Blob([readFileSync(imagePath)])
    const r = await graph(`${page_id}/photos`, { token, method: 'POST', form: { caption: text || '', source: new File([file], basename(imagePath)), ...schedule } })
    return { external_id: r.post_id || r.id, scheduled_for: scheduledFor, url: null }
  }
  const r = await graph(`${page_id}/feed`, { token, method: 'POST', form: { message: text || '', ...schedule } })
  return { external_id: r.id, scheduled_for: scheduledFor, url: null }
}

// Ask Facebook about a post: is it live yet, and where.
export async function checkPagePost({ token, external_id }) {
  const r = await graph(external_id, { token, query: { fields: 'id,is_published,permalink_url,created_time' } })
  return { published: r.is_published !== false, url: r.permalink_url || null }
}

export async function cancelPagePost({ token, external_id }) {
  await graph(external_id, { token, method: 'DELETE' })
  return true
}
