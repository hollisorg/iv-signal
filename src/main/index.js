import { workspaceHost } from '../service/iv-workspace-host.js'
import { receiveSignal } from '../service/iv-workspace-import.js'
import { app, BrowserWindow, ipcMain, shell, clipboard, dialog, nativeImage, protocol, net, safeStorage } from 'electron'
import { join, dirname, extname } from 'node:path'
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as sg from '../core/index.js'
import { findHarnesses, codexWindow } from '../service/harness.js'
import { findHermes } from '../service/hermesacp.js'
import { AGENT_INFO, runInstall, openSignIn, signedIn } from '../service/agentinstall.js'
import { AGENT_NAMES } from '../service/agentrun.js'
import {
  startChatTurn, newChat, applyChatEvent, applyUsage, saveChat, loadChat, listChats, pruneChats,
  attachmentOf, withAttachments, MAX_ATTACH, ATTACH_EXTENSIONS,
} from '../service/agentchat.js'
import { skillMarkdown, pasteMessage } from '../service/agent.js'
import { startUiBridge, UI_SNAPSHOT, MASK_SCREEN, UNMASK_SCREEN } from '../service/ui-guide.js'
import { PLACES, guidePlaces } from '../renderer/src/guides.js'
import { importBrandImage, brandImage } from '../service/brand-assets.js'
import { onboardingStatus, saveOnboarding, finishOnboarding } from '../service/onboarding.js'
import { initUpdater, updateState, REPO } from './updater.js'
import { pictureIntoLibrary, SHAPES } from '../service/pictures.js'
import { ivStudioRenders } from '../service/ivstudio.js'
import { approvalPackHtml } from '../service/approvalpack.js'
import { verifyPageToken, publishToPage, checkPagePost, cancelPagePost } from '../service/meta.js'

const here = dirname(fileURLToPath(import.meta.url))
const APP = 'IV Signal'
let db
let win
let chatWindow = null
let chatContext = { page: 'today' }
let composer = { text: '', files: [], engine: null, tab: 'chat' }
const chatWindowState = () => ({ detached: !!chatWindow && !chatWindow.isDestroyed(), context: chatContext })
let uiBridgeServer = null
let inspectingUi = false
const guideRequests = new Map()
const ME = { actor: 'person' }
// Tests (IV_SIGNAL_TEST_NO_OPEN=1) record outside links instead of opening the person's browser.
const TEST_NO_OPEN = process.env.IV_SIGNAL_TEST_NO_OPEN === '1'
const opened = []
const openOut = (url) => (TEST_NO_OPEN ? opened.push(url) : shell.openExternal(url))

function getDb() {
  if (!db) db = sg.openDb()
  return db
}

const send = (channel, payload) => {
  for (const target of [win, chatWindow]) if (target && !target.isDestroyed()) target.webContents.send(channel, payload)
}
const changed = (tool, value) => {
  send('data:changed', { tool })
  return value
}

// --- Settings kept beside the database (chat engine, models, names, selected brand) ---
const settingsFile = () => join(sg.defaultDataDir(), 'app-settings.json')
function readSettings() {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8'))
  } catch {
    return {}
  }
}
function writeSettings(patch) {
  const next = { ...readSettings(), ...patch }
  mkdirSync(dirname(settingsFile()), { recursive: true })
  writeFileSync(settingsFile(), JSON.stringify(next, null, 1))
  return next
}

// --- Visual guidance for the in-app chat (ported from IV Outreach): spotlight a named place, or look at the window ---
async function inspectUi({ screenshot = true } = {}) {
  if (readSettings().visualGuidanceEnabled === false) throw new Error('Visual guidance is off in Settings > Your agent.')
  if (!win || win.isDestroyed()) throw new Error(`Open the ${APP} window first.`)
  if (inspectingUi) throw new Error('A look at the window is already running; try again in a moment.')
  inspectingUi = true
  try {
    const snapshot = await win.webContents.executeJavaScript(UI_SNAPSHOT)
    const result = { context: chatContext, ...snapshot }
    if (screenshot) {
      await win.webContents.executeJavaScript(MASK_SCREEN)
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      result.image = (await win.webContents.capturePage()).resize({ width: 1280 }).toPNG().toString('base64')
      result.imageNote = `Current ${APP} window only. Input fields, chat and code blocks are covered. No other apps are captured.`
    }
    return result
  } finally {
    try {
      if (win && !win.isDestroyed()) await win.webContents.executeJavaScript(UNMASK_SCREEN)
    } finally {
      inspectingUi = false
    }
  }
}
async function showUi({ place, say }) {
  if (!Object.hasOwn(PLACES, place)) throw new Error('Choose a place from signal_list_places.')
  if (say !== undefined && (typeof say !== 'string' || say.length > 600)) throw new Error('Keep the explanation under 600 characters.')
  if (!win || win.isDestroyed()) throw new Error(`Open the ${APP} window first.`)
  if (guideRequests.size) throw new Error('A guide is already opening; try again in a moment.')
  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { guideRequests.delete(requestId); reject(new Error('The app did not confirm the highlight. Try again when the window is ready.')) }, 6000)
    guideRequests.set(requestId, { resolve, reject, timer })
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send('ui:guide', { requestId, place, say })
  })
}

// How agents launch our MCP server: the app's own Electron binary runs it in Node mode, so nobody needs Node.js.
function mcpCommand() {
  const script = app.isPackaged ? join(process.resourcesPath, 'app.asar', 'out', 'main', 'mcp.js') : join(here, 'mcp.js')
  const env = { ELECTRON_RUN_AS_NODE: '1', ...(uiBridgeServer ? { IV_SIGNAL_UI_URL: uiBridgeServer.url, IV_SIGNAL_UI_TOKEN: uiBridgeServer.token } : {}) }
  if (process.env.IV_SIGNAL_DATA_DIR) env.IV_SIGNAL_DATA_DIR = process.env.IV_SIGNAL_DATA_DIR
  return { command: process.execPath, args: [script], env }
}
// For outside agents: no in-app guide address (it changes every launch and only the in-app chat may use it).
function publicMcpCommand() {
  const c = mcpCommand()
  const env = { ELECTRON_RUN_AS_NODE: '1', ...(process.env.IV_SIGNAL_DATA_DIR ? { IV_SIGNAL_DATA_DIR: process.env.IV_SIGNAL_DATA_DIR } : {}) }
  return { ...c, env }
}
const claudeConfigPath = () => join(process.env.APPDATA || app.getPath('appData'), 'Claude', 'claude_desktop_config.json')

// --- Posting by hand: copy the words, open the network. Only the network's own pages or the brand's saved account. ---
const NETWORK_HOSTS = {
  facebook: /(^|\.)facebook\.com$/i, instagram: /(^|\.)instagram\.com$/i, linkedin: /(^|\.)linkedin\.com$/i, x: /(^|\.)(x|twitter)\.com$/i,
  threads: /(^|\.)threads\.(net|com)$/i, tiktok: /(^|\.)tiktok\.com$/i, youtube: /(^|\.)youtube\.com$/i, pinterest: /(^|\.)pinterest\.com$/i,
  google: /(^|\.)(google\.com|business\.google\.com)$/i,
}
function networkLink(channel, url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && NETWORK_HOSTS[channel]?.test(u.hostname) ? u.toString() : null
  } catch {
    return null
  }
}

// --- Media files for the window, through ivmedia://<file> (only files in IV Signal's media folder) ---
protocol.registerSchemesAsPrivileged([{ scheme: 'ivmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
function serveMedia(request) {
  const u = new URL(request.url)
  const name = decodeURIComponent(u.hostname + u.pathname).replace(/\/+$/, '')
  if (!/^[a-f0-9]{64}\.(png|jpg|webp|gif|mp4|mov|webm|m4v)$/i.test(name)) return new Response('Not found', { status: 404 })
  const file = join(sg.mediaDir(), name)
  if (!existsSync(file)) return new Response('Not found', { status: 404 })
  return net.fetch(pathToFileURL(file).toString(), { headers: request.headers })
}

// --- The person's own agents: find, install, sign in (ported from IV Studio) ---
const agentsFound = () => ({ ...findHarnesses(), hermes: findHermes() })
let agentInstall = null
const installView = () => (agentInstall ? { engine: agentInstall.engine, status: agentInstall.status, lines: agentInstall.lines.slice(-6), error: agentInstall.error } : null)
async function agentSetup() {
  const found = agentsFound()
  const one = async (engine) => ({ ...AGENT_INFO[engine], installed: !!found[engine], signedIn: found[engine] ? await signedIn(engine, found[engine]) : false })
  const [claude, codex] = await Promise.all([one('claude'), one('codex')])
  return { platform: process.platform, claude, codex, hermes: { name: 'Hermes', installed: !!found.hermes }, install: installView() }
}
const pushSetup = () => agentSetup().then((s) => send('agents:setupChanged', s), () => {})

// --- The chat ---
const chatsRoot = () => join(sg.defaultDataDir(), 'chats')
let chat = null
let chatTurn = null
const chatView = () => (chat ? { ...chat, busy: !!chatTurn } : null)
const pushChat = () => send('chat:changed', chatView())
const chatId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
function chatPreferred(found) {
  const s = readSettings()
  if (['claude', 'codex', 'hermes'].includes(s.chatEngine) && found[s.chatEngine]) return s.chatEngine
  return found.claude ? 'claude' : found.codex ? 'codex' : found.hermes ? 'hermes' : null
}
function chatEngine(engine) {
  const found = agentsFound()
  const e = engine || chatPreferred(found)
  if (!e || !AGENT_NAMES[e]) throw new Error('Install Claude Code, Codex or Hermes first: the chat uses your own.')
  if (!found[e]) throw new Error(`${AGENT_NAMES[e]} isn't installed on this PC.`)
  return e
}
const cleanContext = (c = {}) => ({
  page: String(c.page || 'today').slice(0, 40),
  brandId: c.brandId || null,
  brandName: String(c.brandName || '').slice(0, 160),
  postId: c.postId || null,
  postTitle: String(c.postTitle || '').slice(0, 200),
  timezone: String(c.timezone || '').slice(0, 60),
})

// --- Updates: from the public releases-only repo, no key needed ---
let updater = { check: async () => updateState(), install: () => false }
const updateView = () => ({ ...updateState(), repo: `${REPO.owner}/${REPO.repo}` })

// --- Pictures made with the person's Codex, one job at a time per brand, shown while they run ---
const pictureJobs = new Map()
const jobView = (j) => ({ id: j.id, brand_id: j.brand_id, description: j.description, shape: j.shape, status: j.status, error: j.error, media_id: j.media_id, startedAt: j.startedAt, post_id: j.post_id, channel: j.channel })
function startPicture(args) {
  const id = randomUUID()
  const job = { id, ...args, status: 'running', error: null, media_id: null, startedAt: new Date().toISOString() }
  pictureJobs.set(id, job)
  send('data:changed', { tool: 'picture' })
  pictureIntoLibrary(getDb(), { ...args, actor: 'person' })
    .then((m) => { job.status = 'done'; job.media_id = m.id })
    .catch((e) => { job.status = 'failed'; job.error = e.message })
    .finally(() => send('data:changed', { tool: 'picture' }))
  return jobView(job)
}

// --- A small JPEG of a library picture for the approval pack ---
function thumbDataUrl(m) {
  try {
    const img = nativeImage.createFromPath(sg.mediaPath(m))
    if (img.isEmpty()) return null
    const { width, height } = img.getSize()
    const scale = Math.min(1, 360 / Math.max(width, height))
    return `data:image/jpeg;base64,${img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' }).toJPEG(80).toString('base64')}`
  } catch {
    return null
  }
}

// --- Facebook Pages: a Page token per brand, kept encrypted; approved posts are scheduled on Facebook itself ---
function metaFor(brand_id) {
  const m = (readSettings().meta || {})[brand_id]
  if (!m?.tokenEnc || !safeStorage.isEncryptionAvailable()) return null
  try {
    return { ...m, token: safeStorage.decryptString(Buffer.from(m.tokenEnc, 'base64')) }
  } catch {
    return null
  }
}
const metaView = (brand_id) => {
  const m = (readSettings().meta || {})[brand_id]
  return m ? { connected: true, page_id: m.page_id, page_name: m.page_name, link: m.link || null, connectedAt: m.connectedAt } : { connected: false }
}
async function checkDueDeliveries() {
  for (const d of sg.dueDeliveries(getDb())) {
    if (d.provider !== 'facebook') continue
    const v = getDb().prepare('select v.*, p.brand_id from variants v join posts p on p.id = v.post_id where v.id = ?').get(d.variant_id)
    const meta = v && metaFor(v.brand_id)
    if (!meta) continue
    try {
      const r = await checkPagePost({ token: meta.token, external_id: d.external_id })
      if (r.published) {
        sg.updateDelivery(getDb(), d.id, { status: 'published', url: r.url, actor: 'facebook' })
        if (v.status !== 'posted') sg.markPosted(getDb(), v.id, { url: r.url || '', actor: 'facebook' })
        send('data:changed', { tool: 'delivery' })
      }
    } catch (e) {
      if (e.status === 404) {
        sg.updateDelivery(getDb(), d.id, { status: 'failed', error: 'Facebook no longer has this post (it may have been deleted there).', actor: 'facebook' })
        send('data:changed', { tool: 'delivery' })
      }
    }
  }
}

const withArt = (b) => ({ ...b, art: { logo: brandImage(sg.defaultDataDir(), b.profile.logo_id), cover: brandImage(sg.defaultDataDir(), b.profile.cover_id) } })


const ivWorkspace = workspaceHost({ appId: 'signal', dataDir: sg.defaultDataDir(),
  nativeBrands: () => sg.listBrands(getDb()),
  importBrand: (brand, linkedId, workspace) => {
    const db = getDb(), key = 'iv-workspace-brand:' + brand.id
    const id = linkedId || sg.getSetting(db, key)
    const existing = id ? sg.getBrand(db, id) : null
    const profile = Object.fromEntries(['website','offer','audience','voice','visual','location','goal','accent'].map(k => [k, brand[k]]))
    profile.logo_id = brand.logo ? importBrandImage(sg.defaultDataDir(), workspace.assetPath(brand.logo), 'logo', nativeImage).id : ''
    const result = sg.tx(db, () => {
      const b = existing ? sg.updateBrand(db, existing.id, {name:brand.name,profile}) : sg.createBrand(db, {name:brand.name,profile})
      sg.setSetting(db, key, b.id); return b
    })
    changed('ivWorkspaceBrand', result); return result
  },
  receive: (handoff, workspace, useBrand) => {
    const prior = sg.getSetting(getDb(), 'iv-workspace-receipt:' + handoff.id)
    const brand = prior ? {localId:prior.localId} : useBrand(handoff.brandId)
    const result = receiveSignal(handoff, workspace, getDb(), brand.localId, sg.defaultDataDir())
    writeSettings({selectedBrandId:result.localId}); changed('ivWorkspaceDraft',result); return result
  },
})
app.on('open-url', (event, url) => { event.preventDefault(); ivWorkspace.capture([url]) })

const METHODS = {
  ivWorkspace: ({method,args}) => { if (!Object.hasOwn(ivWorkspace.api, method)) throw Error('Unknown workspace action.'); return ivWorkspace.api[method](args || {}) },
  // welcome
  onboardingStatus: () => onboardingStatus(getDb()),
  onboardingSave: (args) => saveOnboarding(getDb(), args),
  onboardingFinish: (args) => {
    const result = finishOnboarding(getDb(), args)
    if (result.brandId) writeSettings({ selectedBrandId: result.brandId })
    return changed('onboarding', result)
  },
  uiGuideReady: ({ requestId, error, place, found }) => {
    const pending = guideRequests.get(requestId)
    if (!pending) return false
    clearTimeout(pending.timer)
    guideRequests.delete(requestId)
    if (error) pending.reject(new Error(String(error)))
    else pending.resolve({ shown: !!found, place, note: found ? 'Highlighted for the person.' : 'That control isn\'t on screen right now; the page was opened.' })
    return true
  },

  // chat window
  chatWindowState,
  chatPopOut: () => { createChatWindow(); return chatWindowState() },
  chatDock: () => { chatWindow?.close(); return chatWindowState() },
  chatFocus: () => { if (chatWindow) { if (chatWindow.isMinimized()) chatWindow.restore(); chatWindow.show(); chatWindow.focus() } return true },
  chatSetContext: (context) => { chatContext = cleanContext(context); send('chat:window', chatWindowState()); return chatContext },
  chatComposer: () => composer,
  chatSetComposer: (patch) => {
    composer = {
      ...composer,
      ...(typeof patch.text === 'string' ? { text: patch.text.slice(0, 8000) } : {}),
      ...(Array.isArray(patch.files) ? { files: patch.files.filter((p) => typeof p === 'string').slice(0, 5) } : {}),
      ...(['claude', 'codex', 'hermes', null].includes(patch.engine) ? { engine: patch.engine } : {}),
      ...(['chat', 'history'].includes(patch.tab) ? { tab: patch.tab } : {}),
    }
    send('chat:composer', composer)
    return composer
  },
  chatHandoff: ({ text = '', send: sendNow = false }) => {
    METHODS.chatFocus()
    if (sendNow && !chatTurn) return METHODS.chatSend({ text, context: chatContext, engine: composer.engine })
    return METHODS.chatSetComposer({ text, tab: 'chat' })
  },

  // updates
  updateState: () => updateView(),
  updateCheck: async () => { await updater.check(); return updateView() },
  updateInstall: () => updater.install(),

  // pictures with Codex
  pictureShapes: () => SHAPES,
  makePicture: ({ brand_id, description, shape, reference_media_ids = [], post_id = null, channel = null }) => {
    sg.requireBrand(getDb(), brand_id)
    if (!String(description || '').trim()) throw new Error('Describe the picture first.')
    if ([...pictureJobs.values()].some((j) => j.brand_id === brand_id && j.status === 'running')) throw new Error('A picture is already being made for this brand. Wait for it to finish.')
    return startPicture({ brand_id, description: String(description).slice(0, 1500), shape: SHAPES[shape] ? shape : 'square', reference_media_ids, post_id, channel })
  },
  pictureJobs: ({ brand_id }) => [...pictureJobs.values()].filter((j) => j.brand_id === brand_id).map(jobView).reverse(),
  clearPictureJob: ({ id }) => { const j = pictureJobs.get(id); if (j && j.status !== 'running') pictureJobs.delete(id); return true },

  // IV Studio
  ivStudioRenders: (args) => ivStudioRenders(args),
  importFromIvStudio: async ({ brand_id, paths = [] }) => {
    const known = new Set((await ivStudioRenders({ previews: true, limit: 500 })).items.map((i) => i.path))
    const out = []
    for (const path of paths.slice(0, 20)) {
      if (!known.has(path)) throw new Error('That file is not one of IV Studio’s renders.')
      out.push(METHODS.importMediaPath({ brand_id, path }))
    }
    return out
  },

  // results
  postedWithResults: ({ brand_id }) => sg.postedWithResults(getDb(), { brand_id }),
  recordResults: ({ variant_id, ...values }) => changed('results', sg.recordResults(getDb(), variant_id, values, ME)),

  // client approval pack
  approvalPack: async ({ brand_id, post_ids = [], note = '' }) => {
    const brand = sg.requireBrand(getDb(), brand_id)
    const posts = post_ids.map((id) => sg.getPost(getDb(), id)).filter((p) => p && p.brand_id === brand_id && p.status !== 'archived')
    if (!posts.length) throw new Error('Choose at least one post.')
    const html = approvalPackHtml({ brand, posts, note: String(note).slice(0, 2000), from: readSettings().userName || '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, thumb: thumbDataUrl })
    const dir = join(app.getPath('documents'), 'IV Signal', 'Approval packs')
    mkdirSync(dir, { recursive: true })
    const safe = brand.name.replace(/[^\w -]+/g, '').trim() || 'brand'
    const pick = await dialog.showSaveDialog(win, { title: 'Save the approval pack', defaultPath: join(dir, `${safe} - for approval ${new Date().toISOString().slice(0, 10)}.html`), filters: [{ name: 'Web page', extensions: ['html'] }] })
    if (pick.canceled || !pick.filePath) return null
    writeFileSync(pick.filePath, html, 'utf8')
    sg.logEvent(getDb(), 'approval_pack', { actor: 'person', brand_id, summary: `Saved an approval pack of ${posts.length} post${posts.length === 1 ? '' : 's'}` })
    shell.showItemInFolder(pick.filePath)
    return { written: pick.filePath, posts: posts.length }
  },

  // Facebook Page publishing
  metaStatus: ({ brand_id }) => metaView(brand_id),
  metaConnect: async ({ brand_id, token }) => {
    sg.requireBrand(getDb(), brand_id)
    if (!safeStorage.isEncryptionAvailable()) throw new Error('This PC can’t encrypt the token, so IV Signal won’t store it.')
    const page = await verifyPageToken(token)
    const meta = { ...(readSettings().meta || {}) }
    meta[brand_id] = { ...page, tokenEnc: safeStorage.encryptString(String(token).trim()).toString('base64'), connectedAt: new Date().toISOString() }
    writeSettings({ meta })
    sg.setChannelStatus(getDb(), { brand_id, channel: 'facebook', status: 'connected', handle: page.page_name, url: page.link, ...ME })
    send('data:changed', { tool: 'channel' })
    return metaView(brand_id)
  },
  metaDisconnect: ({ brand_id }) => {
    const meta = { ...(readSettings().meta || {}) }
    delete meta[brand_id]
    writeSettings({ meta })
    sg.setChannelStatus(getDb(), { brand_id, channel: 'facebook', status: 'manual', ...ME })
    send('data:changed', { tool: 'channel' })
    return metaView(brand_id)
  },
  // The person's click: hand one approved Facebook version to Facebook (scheduled at its planned time, or now).
  publishFacebook: async ({ variant_id, now: postNow = false }) => {
    const v = getDb().prepare('select * from variants where id = ?').get(variant_id)
    if (!v || v.channel !== 'facebook') throw new Error('Only Facebook versions go to a Facebook Page.')
    const post = sg.getPost(getDb(), v.post_id)
    const meta = metaFor(post.brand_id)
    if (!meta) throw new Error('Connect a Facebook Page on the Networks page first.')
    if (!post.approved || v.status !== 'approved') throw new Error('Approve the post first.')
    if (sg.activeDelivery(getDb(), v.id)) throw new Error('This version is already with Facebook.')
    const full = post.variants.find((x) => x.id === v.id)
    if (full.media.some((m) => m.kind === 'video')) throw new Error('Videos to Facebook come later. Post this one by hand for now.')
    const image = full.media.find((m) => m.kind === 'image')
    const when = postNow ? null : v.planned_for
    try {
      const r = await publishToPage({ token: meta.token, page_id: meta.page_id, text: v.text, imagePath: image ? sg.mediaPath(image) : null, when })
      const d = sg.recordDelivery(getDb(), { variant_id: v.id, provider: 'facebook', external_id: r.external_id, scheduled_for: r.scheduled_for, status: r.scheduled_for ? 'scheduled' : 'published', fingerprint: post.approval?.fingerprint, ...ME })
      if (!r.scheduled_for) {
        let url = null
        try { url = (await checkPagePost({ token: meta.token, external_id: r.external_id })).url } catch { /* the link can come later */ }
        if (url) sg.updateDelivery(getDb(), d.id, { url })
        sg.markPosted(getDb(), v.id, { url: url || '', ...ME })
      }
      send('data:changed', { tool: 'delivery' })
      return sg.lastDelivery(getDb(), v.id)
    } catch (e) {
      sg.recordDelivery(getDb(), { variant_id: v.id, provider: 'facebook', status: 'failed', error: e.message, ...ME })
      send('data:changed', { tool: 'delivery' })
      throw e
    }
  },
  cancelFacebook: async ({ variant_id }) => {
    const d = sg.activeDelivery(getDb(), variant_id)
    if (!d || d.status !== 'scheduled') throw new Error('Nothing is scheduled on Facebook for this version.')
    const v = getDb().prepare('select v.*, p.brand_id from variants v join posts p on p.id = v.post_id where v.id = ?').get(variant_id)
    const meta = metaFor(v.brand_id)
    if (!meta) throw new Error('Connect the Facebook Page again to cancel it there.')
    await cancelPagePost({ token: meta.token, external_id: d.external_id })
    sg.updateDelivery(getDb(), d.id, { status: 'cancelled', ...ME })
    send('data:changed', { tool: 'delivery' })
    return true
  },
  checkDeliveries: async () => { await checkDueDeliveries(); return true },

  // brands
  workspaceState: () => ({ brands: sg.listBrands(getDb()).map(withArt), brandId: readSettings().selectedBrandId || null }),
  workspaceSelect: ({ brandId }) => {
    sg.requireBrand(getDb(), brandId)
    writeSettings({ selectedBrandId: brandId })
    ivWorkspace.picked(brandId)
    return true
  },
  chooseBrandImage: async ({ kind }) => {
    if (!['logo', 'cover'].includes(kind)) throw new Error('Choose a logo or cover.')
    const result = await dialog.showOpenDialog(win, { title: kind === 'logo' ? 'Choose the brand logo' : 'Choose a brand cover', properties: ['openFile'], filters: [{ name: 'Images (up to 8 MB)', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
    return result.canceled ? null : importBrandImage(sg.defaultDataDir(), result.filePaths[0], kind, nativeImage)
  },
  createBrand: ({ name, profile }) => {
    const brand = sg.createBrand(getDb(), { name, profile, ...ME })
    writeSettings({ selectedBrandId: brand.id })
    return changed('brand', brand)
  },
  updateBrand: ({ id, name, profile }) => changed('brand', sg.updateBrand(getDb(), id, { name, profile, ...ME })),
  overview: ({ brand_id }) => sg.overview(getDb(), { brand_id }),
  brandBrief: ({ brand_id }) => sg.brandBrief(getDb(), brand_id),
  listBrain: ({ brand_id }) => sg.listBrain(getDb(), brand_id),
  addBrainNote: (args) => changed('brain', sg.addBrainNote(getDb(), { ...args, ...ME })),
  removeBrainNote: ({ id }) => changed('brain', sg.removeBrainNote(getDb(), id, ME)),

  // campaigns
  listCampaigns: ({ brand_id }) => sg.listCampaigns(getDb(), { brand_id }),
  createCampaign: (args) => changed('campaign', sg.createCampaign(getDb(), { ...args, ...ME })),
  updateCampaign: ({ id, ...patch }) => changed('campaign', sg.updateCampaign(getDb(), id, { ...patch, ...ME })),

  // posts
  listPosts: (args) => sg.listPosts(getDb(), args),
  getPost: ({ id }) => sg.getPost(getDb(), id),
  createPost: (args) => changed('post', sg.createPost(getDb(), { ...args, ...ME })),
  updatePost: ({ id, ...patch }) => changed('post', sg.updatePost(getDb(), id, { ...patch, ...ME })),
  setVariant: ({ post_id, ...patch }) => changed('post', sg.setVariant(getDb(), post_id, { ...patch, ...ME })),
  removeVariant: ({ post_id, channel }) => changed('post', sg.removeVariant(getDb(), post_id, channel, ME)),
  planPost: ({ post_id, times }) => changed('post', sg.planPost(getDb(), post_id, times, ME)),
  approvePosts: ({ ids }) => changed('approve', sg.approvePosts(getDb(), ids, ME)),
  archivePost: ({ id, restore }) => changed('post', sg.archivePost(getDb(), id, { restore, ...ME })),
  markPosted: ({ variant_id, url }) => changed('posted', sg.markPosted(getDb(), variant_id, { url, ...ME })),
  skipVariant: ({ variant_id }) => changed('posted', sg.skipVariant(getDb(), variant_id, ME)),
  calendar: (args) => sg.calendar(getDb(), args),
  postingQueue: ({ brand_id }) => sg.postingQueue(getDb(), { brand_id }),
  facebookToSchedule: ({ brand_id }) => (metaView(brand_id).connected ? sg.facebookToSchedule(getDb(), { brand_id }) : []),
  facebookScheduled: ({ brand_id }) => sg.facebookScheduled(getDb(), { brand_id }),
  // Copy an approved version's words and open the network (the brand's saved account, else the network's compose page).
  copyAndOpen: ({ variant_id }) => {
    const v = getDb().prepare('select * from variants where id = ?').get(variant_id)
    if (!v) throw new Error('That version is gone.')
    const post = sg.getPost(getDb(), v.post_id)
    if (!post.approved || v.status !== 'approved') throw new Error('Approve the post first.')
    const saved = sg.listChannels(getDb(), { brand_id: post.brand_id }).find((c) => c.channel === v.channel)
    const target = (saved?.url && networkLink(v.channel, saved.url)) || networkLink(v.channel, sg.CHANNELS[v.channel].compose)
    clipboard.writeText(v.text || '')
    if (target) openOut(target)
    return { copied: true, opened: target }
  },
  revealMedia: ({ id }) => {
    const m = getDb().prepare('select * from media where id = ?').get(id)
    if (!m) throw new Error('That file is gone.')
    shell.showItemInFolder(sg.mediaPath(m))
    return true
  },

  // library
  listMedia: (args) => sg.listMedia(getDb(), args),
  importMedia: async ({ brand_id }) => {
    const pick = await dialog.showOpenDialog(win, { title: 'Add pictures or videos', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Pictures and videos', extensions: Object.keys(sg.MEDIA_TYPES).map((e) => e.slice(1)) }] })
    if (pick.canceled) return []
    return changed('media', pick.filePaths.slice(0, 30).map((path) => METHODS.importMediaPath({ brand_id, path })))
  },
  // A file dropped on the window (its path comes from the preload's pathFor).
  importMediaPath: ({ brand_id, path }) => {
    let size = null
    if (sg.MEDIA_TYPES[extname(String(path)).toLowerCase()]?.[0] === 'image') {
      const img = nativeImage.createFromPath(path)
      if (!img.isEmpty()) size = img.getSize()
    }
    const m = sg.importMedia(getDb(), { brand_id, path, size, ...ME })
    send('data:changed', { tool: 'media' })
    return m
  },
  updateMedia: ({ id, ...patch }) => changed('media', sg.updateMedia(getDb(), id, { ...patch, ...ME })),
  removeMedia: ({ id }) => changed('media', sg.removeMedia(getDb(), id, ME)),

  // networks
  listChannels: ({ brand_id }) => sg.listChannels(getDb(), { brand_id }),
  saveChannel: (args) => changed('channel', sg.saveChannel(getDb(), { ...args, ...ME })),
  removeChannel: (args) => changed('channel', sg.removeChannel(getDb(), { ...args, ...ME })),
  openChannel: ({ channel, url }) => {
    const target = networkLink(channel, url)
    if (!target) throw new Error('Only the network\'s own https links open from here.')
    openOut(target)
    return true
  },
  ...(TEST_NO_OPEN ? { testOpened: () => opened.slice() } : {}),
  channelInfo: () => Object.entries(sg.CHANNELS).map(([key, c]) => ({ channel: key, ...c })),
  listEvents: (args) => sg.listEvents(getDb(), args),

  copyText: ({ text }) => {
    clipboard.writeText(String(text || ''))
    return { copied: true }
  },
  appSettings: () => { const { updateKeyEnc, meta, ...rest } = readSettings(); return rest },
  saveAppSettings: (patch) => {
    const clean = {}
    if (['claude', 'codex', 'hermes', ''].includes(patch.chatEngine)) clean.chatEngine = patch.chatEngine
    for (const k of ['claudeModel', 'codexModel', 'agentName', 'userName']) if (typeof patch[k] === 'string') clean[k] = patch[k].trim().slice(0, 80)
    if (typeof patch.visualGuidanceEnabled === 'boolean') clean.visualGuidanceEnabled = patch.visualGuidanceEnabled
    return writeSettings(clean)
  },

  // agents: install, sign in, connect (IV Studio's Settings -> Agents)
  agentSetup: () => agentSetup(),
  agentInstall: ({ engine }) => {
    if (!AGENT_INFO[engine]) throw new Error(`${APP} can install Claude Code or Codex.`)
    if (agentInstall?.status === 'running') throw new Error(`${AGENT_INFO[agentInstall.engine].name} is still installing.`)
    const state = { engine, status: 'running', lines: [], error: null, run: null }
    agentInstall = state
    state.run = runInstall(engine, {
      onLine: (line) => {
        state.lines.push(line)
        if (state.lines.length > 50) state.lines.shift()
        if (agentInstall === state) send('agents:setupChanged', { install: installView() })
      },
    })
    pushSetup()
    state.run.promise.then((r) => {
      const there = !!agentsFound()[engine]
      state.status = r.ok && there ? 'done' : 'failed'
      state.error = r.ok && !there ? `The installer finished, but ${APP} can't find ${AGENT_INFO[engine].name} yet. Restart ${APP}, or install it from ${AGENT_INFO[engine].site}` : r.error
      if (agentInstall === state) pushSetup()
    })
    return true
  },
  agentStopInstall: () => {
    if (agentInstall?.status === 'running') agentInstall.run.stop()
    return true
  },
  agentSignIn: ({ engine }) => {
    if (!AGENT_INFO[engine]) throw new Error(`${APP} can sign in to Claude Code or Codex.`)
    const exe = agentsFound()[engine]
    if (!exe) throw new Error(`${AGENT_INFO[engine].name} isn't installed yet.`)
    openSignIn(engine, exe)
    return true
  },
  openLink: ({ url }) => {
    const allowed = Object.values(AGENT_INFO).map((a) => a.site).concat('https://hermes-agent.nousresearch.com')
    if (!allowed.includes(url)) throw new Error(`That link isn't one ${APP} opens.`)
    shell.openExternal(url)
    return true
  },
  agentsInfo: () => {
    const skillFile = join(homedir(), '.claude', 'skills', 'iv-signal', 'SKILL.md')
    const text = skillMarkdown(publicMcpCommand())
    const installed = existsSync(skillFile)
    return {
      paste: pasteMessage(publicMcpCommand()),
      skillFile,
      skillInstalled: installed,
      skillCurrent: installed && readFileSync(skillFile, 'utf8') === text,
      desktopSnippet: JSON.stringify({ ivsignal: publicMcpCommand() }, null, 2),
      desktopConfigPath: claudeConfigPath(),
    }
  },
  installSkill: () => {
    const skillFile = join(homedir(), '.claude', 'skills', 'iv-signal', 'SKILL.md')
    mkdirSync(dirname(skillFile), { recursive: true })
    writeFileSync(skillFile, skillMarkdown(publicMcpCommand()))
    return skillFile
  },
  openClaudeConfigFolder: () => {
    const folder = dirname(claudeConfigPath())
    mkdirSync(folder, { recursive: true })
    shell.openPath(folder)
    return { opened: folder }
  },

  // chat
  chatStatus: () => {
    const found = agentsFound()
    const s = readSettings()
    return {
      installed: { claude: !!found.claude, codex: !!found.codex, hermes: !!found.hermes },
      preferred: chatPreferred(found),
      chat: chatView(),
      chats: listChats(chatsRoot()).slice(0, 20),
      agentName: (s.agentName || '').trim(),
      userName: (s.userName || '').trim(),
    }
  },
  chatNew: ({ engine }) => {
    if (chatTurn) throw new Error(`${chat.name} is still answering. Stop it first.`)
    chat = newChat({ id: chatId(), engine: chatEngine(engine) })
    pushChat()
    return chatView()
  },
  chatOpen: ({ id }) => {
    if (chatTurn) throw new Error(`${chat.name} is still answering. Stop it first.`)
    const c = loadChat(chatsRoot(), String(id || ''))
    if (!c) throw new Error('That chat is gone.')
    chat = c
    pushChat()
    return chatView()
  },
  chatPickFiles: async () => {
    const pick = await dialog.showOpenDialog(chatWindow || win, { title: 'Add to the chat', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Notes', extensions: ATTACH_EXTENSIONS }] })
    return pick.canceled ? [] : pick.filePaths.slice(0, MAX_ATTACH)
  },
  chatSend: ({ text, context, engine, files = [] }) => {
    const attached = (Array.isArray(files) ? files : []).filter((p) => typeof p === 'string' && existsSync(p)).map(attachmentOf).filter((a) => a.kind).slice(0, MAX_ATTACH)
    const message = String(text || '').trim().slice(0, 8000) || (attached.length ? 'Here are some files.' : '')
    if (!message) throw new Error('Type a message first.')
    if (chatTurn) throw new Error(`${chat.name} is still answering. Stop it first, or wait.`)
    if (!chat) chat = newChat({ id: chatId(), engine: chatEngine(engine) })
    const exe = agentsFound()[chat.engine]
    if (!exe) throw new Error(`${chat.name} isn't installed on this PC.`)
    const turnContext = cleanContext(context && typeof context === 'object' ? context : chatContext)
    if (turnContext.brandId && !sg.getBrand(getDb(), turnContext.brandId)) throw new Error('That brand is gone. Choose a brand again.')
    METHODS.chatSetComposer({ text: '', files: [], tab: 'chat' })
    const current = chat
    const s = readSettings()
    if (current.engine === 'codex') {
      const cw = codexWindow(s.codexModel || '')
      if (cw) applyUsage(current, { window: cw.window, model: cw.model })
    }
    current.turnCalls = 0
    current.entries.push({ kind: 'you', text: message, at: new Date().toISOString(), ...(attached.length ? { files: attached.map((a) => ({ name: a.name, kind: a.kind, path: a.path })) } : {}) })
    if (!current.title) current.title = message.slice(0, 80)
    saveChat(chatsRoot(), current)
    const turn = startChatTurn({
      engine: current.engine,
      exe,
      dir: join(chatsRoot(), current.id),
      session: current.session,
      message: withAttachments(message, attached),
      context: turnContext,
      mcp: mcpCommand(),
      model: current.engine === 'claude' ? s.claudeModel || '' : current.engine === 'codex' ? s.codexModel || '' : '',
      names: { agentName: s.agentName, userName: s.userName || onboardingStatus(getDb()).profile.name },
      onEvent: (e) => {
        applyChatEvent(current, e)
        if (chat === current) pushChat()
        if (e.type === 'step') send('data:changed', { tool: e.tool })
      },
    })
    chatTurn = turn
    pushChat()
    turn.promise.then((r) => {
      if (r.session) current.session = r.session
      const last = current.entries[current.entries.length - 1]
      if (!r.ok && r.error && !(last?.kind === 'problem' && last.text === r.error)) current.entries.push({ kind: 'problem', text: r.error })
      current.updatedAt = new Date().toISOString()
      if (chatTurn === turn) chatTurn = null
      try {
        saveChat(chatsRoot(), current)
        pruneChats(chatsRoot())
      } catch {
        /* a full drive shouldn't take the chat down */
      }
      pushChat()
      send('data:changed', { tool: 'turn-end' })
    })
    return chatView()
  },
  chatAnswer: ({ id, allow }) => !!chatTurn?.answer(String(id || ''), !!allow),
  chatStop: () => {
    chatTurn?.stop()
    return true
  },
}

ipcMain.handle('ivsignal:call', async (event, method, args) => {
  if (![win?.webContents, chatWindow?.webContents].includes(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted app window')
  if (method === 'chatSetContext' && event.sender !== win?.webContents) throw new Error('Only the main window changes the chat context')
  const fn = Object.hasOwn(METHODS, method) ? METHODS[method] : null
  if (!fn) throw new Error(`Unknown method ${method}`)
  return fn(args || {})
})

function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) { METHODS.chatFocus(); return }
  const bounds = win?.getBounds()
  chatWindow = new BrowserWindow({
    width: 500, height: 800, minWidth: 360, minHeight: 500,
    ...(bounds ? { x: bounds.x + Math.max(0, bounds.width - 500), y: bounds.y + 40 } : {}),
    title: `${APP} — Chat`, backgroundColor: '#100c0e', show: false, autoHideMenuBar: true,
    webPreferences: { preload: join(here, '../preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  const target = chatWindow
  target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  target.webContents.on('will-navigate', (e) => e.preventDefault())
  target.once('ready-to-show', () => target.show())
  target.on('closed', () => { chatWindow = null; send('chat:window', { ...chatWindowState(), returned: true }) })
  if (process.env.ELECTRON_RENDERER_URL) { const url = new URL(process.env.ELECTRON_RENDERER_URL); url.searchParams.set('chatWindow', '1'); target.loadURL(url.toString()) }
  else target.loadFile(join(here, '../renderer/index.html'), { query: { chatWindow: '1' } })
  send('chat:window', chatWindowState())
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 660,
    title: APP,
    backgroundColor: '#100c0e',
    icon: nativeImage.createFromPath(app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(here, '../../build/icon.png')),
    show: false,
    autoHideMenuBar: true,
    // IV Studio's frameless window: the app draws its own title bar, Windows draws the buttons over it
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 } } : { titleBarOverlay: { color: '#100c0e', symbolColor: '#f1ede5', height: 40 } }),
    webPreferences: { preload: join(here, '../preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  win.once('ready-to-show', () => win.show())
  win.on('close', () => { chatWindow?.close() })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(here, '../renderer/index.html'))
}

app.setName(APP)
app.setPath('userData', sg.defaultDataDir())
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else {
  app.on('second-instance', (_event, args) => {
    ivWorkspace.capture(args)
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
  app.whenReady().then(async () => {
    ivWorkspace.ready()
    // Follow the business chosen in IV Hivemind (or another IV app): select this app's copy of it.
    ivWorkspace.followActive({ select: ({ localId }) => {
      if (!localId || readSettings().selectedBrandId === localId) return
      writeSettings({ selectedBrandId: localId })
      send('workspace:active', { brandId: localId })
    } })
    protocol.handle('ivmedia', serveMedia)
    try {
      uiBridgeServer = await startUiBridge({ places: () => guidePlaces(), inspect: inspectUi, show: showUi })
    } catch {
      /* The chat still works without visual guidance. */
    }
    createWindow()
    setInterval(() => checkDueDeliveries().catch(() => {}), 3 * 60 * 1000)
    setTimeout(() => checkDueDeliveries().catch(() => {}), 20000)
    updater = initUpdater((state) => send('update:changed', { ...state, repo: `${REPO.owner}/${REPO.repo}` }))
  })
  let cleanedUp = false
  app.on('before-quit', () => {
    if (cleanedUp) return
    cleanedUp = true
    chatTurn?.stop()
    uiBridgeServer?.close()
    for (const pending of guideRequests.values()) { clearTimeout(pending.timer); pending.reject(new Error('The app is closing.')) }
    guideRequests.clear()
  })
  app.on('window-all-closed', () => app.quit())
}
