import { useCallback, useEffect, useRef, useState } from 'react'

export const call = (method, args) => window.ivsignal.call(method, args)
export const on = (channel, cb) => window.ivsignal.on(channel, cb)

// Load something and reload it when the agent (or anything else) changes data, and every few seconds while the
// window is visible, since the MCP server in Claude Desktop writes to the same database.
export function useData(method, args, deps = []) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const key = JSON.stringify(args || {})
  const requestKey = method + key
  const current = useRef(requestKey), sequence = useRef(0)
  current.current = requestKey
  const load = useCallback(() => {
    const request = ++sequence.current
    call(method, args).then(
      (data) => { if (current.current === requestKey && sequence.current === request) { setResult({ key: requestKey, data }); setError(null) } },
      (e) => { if (current.current === requestKey && sequence.current === request) setError(e.message) },
    )
  }, [method, key, ...deps])
  useEffect(() => {
    load()
    const off = on('data:changed', load)
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 5000)
    return () => (off(), clearInterval(t))
  }, [load])
  return [result?.key === requestKey ? result.data : null, load, error]
}

export const pct = (a, b) => (b ? Math.min(100, Math.round((100 * a) / b)) : 0)
export const when = (at) => {
  if (!at) return ''
  const d = new Date(at)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days} d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// When a planned post goes out, in the person's own words and timezone.
export const at = (iso, opts = {}) => {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...opts })
}
// For <input type="datetime-local">: local time without seconds, and back to ISO with the offset.
export const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

export const CHANNELS = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X', threads: 'Threads',
  tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest', google: 'Google Business',
}
export const mediaUrl = (m) => (m?.file ? `ivmedia://${m.file}` : '')

// Anywhere in the app can hand the chat a question (ChatPanel listens).
export const askAgent = ({ text = '', send = false } = {}) => window.dispatchEvent(new CustomEvent('iv:ask', { detail: { text, send } }))

// The IV Newsletter box's door into the main process (src/main/newsletter.js)
export const newsletterApi = { status: () => call('newsletterStatus'), join: (input) => call('newsletterJoin', input), closeCard: () => call('newsletterCloseCard'), openPage: () => call('newsletterOpenPage') }
