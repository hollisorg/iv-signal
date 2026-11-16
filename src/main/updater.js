// IV Signal updates itself, the way IV Studio does: it checks on launch and every six hours, downloads a new version in
// the background, and installs it when the person clicks "Restart to update" or quits. No key or sign-in is needed:
// the installers are published to a public, releases-only repo (hollisorg/iv-signal-releases). The source code stays
// in the private repo; only the built app and its update file are public.
// IV_SIGNAL_UPDATE_FEED (a URL with a latest.yml) points a test copy at a local feed; such a copy never installs on quit.
// A Mac copy can't use electron-updater (macOS's own updater needs an Apple Developer ID), so it swaps its own app
// bundle instead (macupdater.js), with the same states and buttons. IV_SIGNAL_UPDATE_SELFTEST=1 with a test feed
// installs as soon as the download is ready (the Mac CI's update check).
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { initMacUpdater } from './macupdater.js'

const { autoUpdater } = electronUpdater
const MAC = process.platform === 'darwin'
const SIX_HOURS = 6 * 60 * 60 * 1000
const TEST_FEED = process.env.IV_SIGNAL_UPDATE_FEED
// A test copy checks and downloads for real but never installs, so it can't replace the installed app.
const NO_INSTALL = !!TEST_FEED || process.env.IV_SIGNAL_UPDATE_NO_INSTALL === '1'
export const REPO = { owner: 'hollisorg', repo: 'iv-signal-releases' }

let state = { status: 'idle', version: app.getVersion(), available: null, percent: null, error: null, checkedAt: null }
export const updateState = () => state

export function initUpdater(onChange) {
  const set = (patch) => {
    state = { ...state, ...patch }
    onChange(state)
  }
  if (!app.isPackaged) {
    set({ status: 'dev' })
    return { check: async () => state, install: () => false }
  }
  if (MAC) {
    return initMacUpdater({
      set, get: () => state, testFeed: TEST_FEED, noInstall: NO_INSTALL, selftest: process.env.IV_SIGNAL_UPDATE_SELFTEST === '1',
      name: 'IV Signal', releases: `https://github.com/${REPO.owner}/${REPO.repo}/releases`, workName: 'iv-signal-update',
    })
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = !NO_INSTALL
  autoUpdater.setFeedURL(TEST_FEED ? { provider: 'generic', url: TEST_FEED } : { provider: 'github', ...REPO })

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }))
  autoUpdater.on('update-not-available', () => set({ status: 'current', available: null, checkedAt: new Date().toISOString() }))
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', available: info.version, percent: 0, checkedAt: new Date().toISOString() }))
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: p.percent }))
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', available: info.version, percent: 100 }))
  autoUpdater.on('error', (err) => {
    const message = String(err?.message || err)
    if (/Unable to find latest version|No published versions/i.test(message)) return set({ status: 'current', error: null })
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR_/i.test(message)) return set({ status: 'error', error: 'Couldn’t reach GitHub. It tries again later by itself.' })
    set({ status: 'error', error: message.split('\n')[0].slice(0, 300) })
  })

  const check = async () => {
    if (state.status === 'downloading' || state.status === 'ready') return state
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      /* reported through the error event */
    }
    return state
  }
  setTimeout(check, 10_000)
  setInterval(check, SIX_HOURS)

  return {
    check,
    install: () => {
      if (state.status !== 'ready' || NO_INSTALL) return false
      autoUpdater.quitAndInstall(true, true)
      return true
    },
  }
}
