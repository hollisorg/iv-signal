// The media library: pictures and videos copied into IV Signal's own folder (named by their SHA-256), so a post keeps
// the exact file the person approved even if the original moves or changes.
import { createHash } from 'node:crypto'
import { openSync, readSync, closeSync, statSync, copyFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { defaultDataDir, now, newId, logEvent, clip } from './db.js'
import { requireBrand } from './brands.js'

export const MEDIA_TYPES = {
  '.png': ['image', 'image/png'], '.jpg': ['image', 'image/jpeg'], '.jpeg': ['image', 'image/jpeg'], '.webp': ['image', 'image/webp'], '.gif': ['image', 'image/gif'],
  '.mp4': ['video', 'video/mp4'], '.mov': ['video', 'video/quicktime'], '.webm': ['video', 'video/webm'], '.m4v': ['video', 'video/mp4'],
}
const MAX = { image: 30 * 1024 * 1024, video: 1024 * 1024 * 1024 }

export const mediaDir = (dataDir = defaultDataDir()) => join(dataDir, 'media')
export const mediaPath = (row, dataDir = defaultDataDir()) => join(mediaDir(dataDir), row.file)

function sha256File(path) {
  const hash = createHash('sha256'), buf = Buffer.alloc(1024 * 1024), fd = openSync(path, 'r')
  try {
    let n
    while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n))
  } finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

// size: optional { width, height } the window measured (the MCP server can't read image sizes).
export function importMedia(db, { brand_id, path, alt_text = '', name, size = null, actor } = {}, { dataDir = defaultDataDir() } = {}) {
  const brand = requireBrand(db, brand_id)
  const file = String(path || '')
  if (!file || !existsSync(file)) throw new Error('That file isn\'t there.')
  const ext = extname(file).toLowerCase()
  const type = MEDIA_TYPES[ext]
  if (!type) throw new Error(`IV Signal takes ${Object.keys(MEDIA_TYPES).join(', ')} files.`)
  const st = statSync(file)
  if (!st.isFile()) throw new Error('Choose a file, not a folder.')
  if (st.size > MAX[type[0]]) throw new Error(`That ${type[0]} is over ${Math.round(MAX[type[0]] / 1048576)} MB.`)
  const sha = sha256File(file)
  const already = db.prepare('select * from media where brand_id = ? and sha256 = ?').get(brand_id, sha)
  if (already) return { ...already, already: true }
  mkdirSync(mediaDir(dataDir), { recursive: true })
  const stored = `${sha}${ext === '.jpeg' ? '.jpg' : ext}`
  const target = join(mediaDir(dataDir), stored)
  if (!existsSync(target)) copyFileSync(file, target)
  if (sha256File(target) !== sha) { rmSync(target, { force: true }); throw new Error('The copy didn\'t match the original. Try again.') }
  const id = newId()
  const w = Number(size?.width) || null, h = Number(size?.height) || null
  db.prepare('insert into media (id, brand_id, file, name, kind, mime, bytes, sha256, width, height, alt_text, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, brand_id, stored, clip(name || basename(file), 200), type[0], type[1], st.size, sha, w, h, clip(alt_text, 1000) || null, now())
  logEvent(db, 'media_added', { actor, brand_id, summary: `Added ${basename(file)} to ${brand.name}'s library` })
  return db.prepare('select * from media where id = ?').get(id)
}

export function listMedia(db, { brand_id, kind } = {}) {
  requireBrand(db, brand_id)
  const rows = kind
    ? db.prepare('select * from media where brand_id = ? and kind = ? order by created_at desc').all(brand_id, kind)
    : db.prepare('select * from media where brand_id = ? order by created_at desc').all(brand_id)
  return rows.map((m) => ({
    ...m,
    used_in: db.prepare("select count(*) n from variants v join posts p on p.id = v.post_id where p.status != 'archived' and exists (select 1 from json_each(v.media_json) j where j.value = ?)").get(m.id).n,
  }))
}

export function updateMedia(db, id, { alt_text, name, actor } = {}) {
  const m = db.prepare('select * from media where id = ?').get(id)
  if (!m) throw new Error('That file is gone.')
  db.prepare('update media set alt_text = ?, name = ? where id = ?').run(
    alt_text === undefined ? m.alt_text : clip(alt_text, 1000) || null,
    name === undefined ? m.name : clip(name, 200) || m.name, id)
  logEvent(db, 'media_updated', { actor, brand_id: m.brand_id, summary: `Updated ${m.name}` })
  return db.prepare('select * from media where id = ?').get(id)
}

// Remove from the library; refused while a live post uses it.
export function removeMedia(db, id, { actor } = {}, { dataDir = defaultDataDir() } = {}) {
  const m = db.prepare('select * from media where id = ?').get(id)
  if (!m) throw new Error('That file is gone.')
  const used = db.prepare("select count(*) n from variants v join posts p on p.id = v.post_id where p.status != 'archived' and exists (select 1 from json_each(v.media_json) j where j.value = ?)").get(id).n
  if (used) throw new Error(`It's used in ${used} post version${used === 1 ? '' : 's'}. Take it out of them first.`)
  db.prepare('delete from media where id = ?').run(id)
  const stillShared = db.prepare('select count(*) n from media where file = ?').get(m.file).n
  if (!stillShared) rmSync(join(mediaDir(dataDir), m.file), { force: true })
  logEvent(db, 'media_removed', { actor, brand_id: m.brand_id, summary: `Removed ${m.name} from the library` })
  return { removed: id }
}
