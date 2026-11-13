// Making a picture for a post with the person's own Codex (ChatGPT image generation on their ChatGPT plan, no API key):
// Codex runs in an empty folder, makes one image and saves it there; IV Signal copies it into the brand's library.
// The picture is made without any words in it (generated lettering garbles); real words go in the post itself.
import { mkdtempSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findHarnesses } from './harness.js'
import { killTree, spawnAgent } from './agentrun.js'
import * as sg from '../core/index.js'

export const SHAPES = {
  square: 'square 1:1',
  portrait: 'portrait 4:5',
  story: 'tall 9:16',
  landscape: 'wide 16:9',
}
const LIMIT_MS = 8 * 60 * 1000

export function picturePrompt({ description, shape = 'square', brand }) {
  const p = brand?.profile || {}
  const looks = [p.visual && `Visual standards for this brand: ${p.visual}`].filter(Boolean).join(' ')
  return [
    `Use your image generation tool to create ONE image, then save it into the current directory as picture.png (copy the generated file here; do not write any other files and do not run anything else).`,
    `The image: ${String(description).trim()}`,
    `Shape: ${SHAPES[shape] || SHAPES.square}.`,
    looks,
    'No text, no letters, no numbers, no logos, no watermarks anywhere in the image. No real people\'s likenesses.',
  ].filter(Boolean).join(' ')
}

// Runs Codex and resolves with the saved file's path. references: library files Codex may look at (-i).
export function makePicture({ description, shape = 'square', brand, references = [], codex = findHarnesses().codex, onLine = () => {} }) {
  if (!codex) throw new Error('Making pictures uses your own Codex. Install Codex (Settings → Your agent) and sign in first.')
  if (!String(description || '').trim()) throw new Error('Describe the picture first.')
  const dir = mkdtempSync(join(tmpdir(), 'ivsignal-picture-'))
  const args = ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', dir]
  for (const r of references.slice(0, 3)) if (existsSync(r)) args.push('-i', r)
  args.push('--', picturePrompt({ description, shape, brand }).replace(/"/g, "'"))
  const child = spawnAgent(codex, args, { cwd: dir, env: process.env })
  let stopped = false
  const promise = new Promise((resolve) => {
    const timer = setTimeout(() => { stopped = true; killTree(child) }, LIMIT_MS)
    child.stdout?.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => onLine(l.slice(0, 300))))
    child.stderr?.on('data', () => {})
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: e.message, dir }) })
    child.on('close', () => {
      clearTimeout(timer)
      const file = readdirSync(dir).map((f) => join(dir, f)).find((f) => /\.(png|jpe?g|webp)$/i.test(f) && statSync(f).size > 1000)
      if (file) resolve({ ok: true, file, dir })
      else resolve({ ok: false, error: stopped ? 'Codex took too long and was stopped.' : 'Codex finished without saving a picture. Check it is signed in, then try again.', dir })
    })
  })
  return { promise, stop: () => { stopped = true; killTree(child) } }
}

// The whole job for the app and the MCP server: make it, copy it into the library, optionally put it on a version.
export async function pictureIntoLibrary(db, { brand_id, description, shape = 'square', reference_media_ids = [], post_id = null, channel = null, actor } = {}, { onLine } = {}) {
  const brand = sg.requireBrand(db, brand_id)
  const refs = reference_media_ids.map((id) => db.prepare('select * from media where id = ? and brand_id = ?').get(id, brand_id)).filter((m) => m?.kind === 'image').map((m) => sg.mediaPath(m))
  const run = makePicture({ description, shape, brand, references: refs, onLine })
  const r = await run.promise
  try {
    if (!r.ok) throw new Error(r.error)
    const name = `${String(description).trim().replace(/[^\w\s-]/g, '').split(/\s+/).slice(0, 6).join(' ') || 'picture'}.png`
    const m = sg.importMedia(db, { brand_id, path: r.file, name, alt_text: String(description).trim().slice(0, 300), actor })
    sg.logEvent(db, 'picture_made', { actor, brand_id, summary: `Made a picture with Codex for ${brand.name}`, data: { media_id: m.id } })
    if (post_id && channel) {
      const post = sg.getPost(db, post_id)
      const v = post?.variants.find((x) => x.channel === channel)
      if (v && v.status !== 'posted') sg.setVariant(db, post_id, { channel, media_ids: [...v.media_ids, m.id], actor })
    }
    return m
  } finally {
    rmSync(r.dir, { recursive: true, force: true })
  }
}
