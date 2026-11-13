// IV Studio's renders, read through IV Studio's own MCP server (started from the installed IV Studio, the same way an
// agent starts it), so IV Signal can bring a finished shot, an edit export or a picture into a brand's library.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, extname, basename } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { MEDIA_TYPES } from '../core/media.js'

export function findIvStudio(env = process.env) {
  const candidates = [
    join(env.LOCALAPPDATA || '', 'Programs', 'IV Studio'),
    join(env.ProgramFiles || 'C:\\Program Files', 'IV Studio'),
  ]
  for (const dir of candidates) {
    const exe = join(dir, 'IV Studio.exe')
    const mcp = join(dir, 'resources', 'app.asar', 'out', 'main', 'mcp.js')
    if (existsSync(exe)) return { exe, mcp }
  }
  if (process.platform === 'darwin' && existsSync('/Applications/IV Studio.app')) return { exe: '/Applications/IV Studio.app/Contents/MacOS/IV Studio', mcp: '/Applications/IV Studio.app/Contents/Resources/app.asar/out/main/mcp.js' }
  return null
}

const usable = (p) => !!p && !!MEDIA_TYPES[extname(p).toLowerCase()] && existsSync(p)

// Edits, sizzles and trailers IV Studio exports into Videos\IV Studio.
function exportsFolder() {
  const root = join(homedir(), 'Videos', 'IV Studio')
  const out = []
  for (const sub of ['Edits', 'Sizzles', 'Trailers']) {
    const dir = join(root, sub)
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      try {
        const st = statSync(p)
        if (st.isFile() && usable(p)) out.push({ key: `file:${p}`, label: basename(f, extname(f)), group: sub === 'Edits' ? 'Edit exports' : sub, at: st.mtime.toISOString(), path: p, kind: MEDIA_TYPES[extname(p).toLowerCase()][0], bytes: st.size })
      } catch {
        /* unreadable file */
      }
    }
  }
  return out
}

// Finals, pictures and exports, newest first. Previews are left out unless asked for.
export async function ivStudioRenders({ previews = false, limit = 120 } = {}) {
  const found = findIvStudio()
  const items = [...exportsFolder()]
  let reachable = false
  if (found && existsSync(found.exe)) {
    const client = new Client({ name: 'iv-signal', version: '1' })
    try {
      await client.connect(new StdioClientTransport({ command: found.exe, args: [found.mcp], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }))
      reachable = true
      const read = async (name, args) => {
        const r = await client.callTool({ name, arguments: args })
        return r.isError ? null : JSON.parse(r.content?.[0]?.text || 'null')
      }
      const renders = await read('list_renders', { limit: 200 })
      for (const r of renders?.items || []) {
        if (!previews && /preview/i.test(r.key)) continue
        if (usable(r.path)) items.push({ key: `render:${r.key}`, label: r.label, group: r.group || 'Shots', at: r.at, path: r.path, kind: MEDIA_TYPES[extname(r.path).toLowerCase()][0], bytes: statSync(r.path).size })
      }
      const images = await read('list_images', {})
      for (const set of (Array.isArray(images) ? images : images?.items || [])) {
        for (const f of set.files || []) {
          const p = typeof f === 'string' ? f : f.path
          if (usable(p)) items.push({ key: `image:${p}`, label: (set.prompt || set.name || basename(p)).slice(0, 90), group: 'Pictures', at: set.finishedAt || set.createdAt || statSync(p).mtime.toISOString(), path: p, kind: 'image', bytes: statSync(p).size })
        }
      }
    } catch {
      /* IV Studio's server didn't answer; the exports folder still works */
    } finally {
      await client.close().catch(() => {})
    }
  }
  const seen = new Set()
  return {
    installed: !!found,
    reachable,
    items: items.filter((i) => !seen.has(i.path) && seen.add(i.path)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit),
  }
}
