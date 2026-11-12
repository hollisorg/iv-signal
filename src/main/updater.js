// IV Signal updates itself from the private GitHub repo's releases (latest.yml sits next to the installer), the way
// IV Studio does: it checks on launch and every six hours, downloads a new version in the background, and installs it
// when the person clicks "Restart to update" or quits. A private repo needs a read key on each PC: one the person
// pastes in Settings (kept encrypted with the OS), or their GitHub CLI sign-in if they chose that.
// IV_SIGNAL_UPDATE_FEED (a URL with a latest.yml) points a test copy at a local feed; such a copy never installs on quit.
import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater
const SIX_HOURS = 6 * 60 * 60 * 1000
const TEST_FEED = process.env.IV_SIGNAL_UPDATE_FEED
// A test copy checks and downloads for real but never installs, so it can't replace the installed app.
const NO_INSTALL = !!TEST_FEED || process.env.IV_SIGNAL_UPDATE_NO_INSTALL === '1'
export const REPO = { owner: 'hollisorg', repo: 'iv-signal' }

let state = { status: 'idle', version: app.getVersion(), available: null, percent: null, error: null, checkedAt: null, keySource: null }
export const updateState = () => state

// The GitHub CLI's own sign-in, read at check time and never stored by IV Signal.
function ghToken() {
  const candidates = ['gh', join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI', 'gh.exe'), join(process.env.LOCALAPPDATA || '', 'Programs', 'GitHub CLI', 'gh.exe'), '/opt/homebrew/bin/gh', '/usr/local/bin/gh']
  const tryOne = (i) => new Promise((resolve) => {
    if (i >= candidates.length) return resolve(null)
    const exe = candidates[i]
    if (exe !== 'gh' && !existsSync(exe)) return resolve(tryOne(i + 1))
    execFile(exe, ['auth', 'token', '--hostname', 'github.com'], { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      const token = String(stdout || '').trim()
      if (!err && /^[A-Za-z0-9_]{20,}$/.test(token)) resolve(token)
      else resolve(tryOne(i + 1))
    })
  })
  return tryOne(0)
}

// keys(): { savedKey: string|null, useGh: boolean } from the app's settings.
export function initUpdater(onChange, keys) {
  const set = (patch) => {
    state = { ...state, ...patch }
    onChange(state)
  }
  if (!app.isPackaged) {
    set({ status: 'dev' })
    return { check: async () => state, install: () => false }
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = !NO_INSTALL

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }))
  autoUpdater.on('update-not-available', () => set({ status: 'current', available: null, checkedAt: new Date().toISOString() }))
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', available: info.version, percent: 0, checkedAt: new Date().toISOString() }))
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: p.percent }))
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', available: info.version, percent: 100 }))
  autoUpdater.on('error', (err) => {
    const message = String(err?.message || err)
    if (/Unable to find latest version|No published versions/i.test(message)) return set({ status: 'current', error: null })
    if (/\b(401|403|404)\b|Bad credentials|Not Found/i.test(message)) return set({ status: 'error', error: 'GitHub refused the update key. Check it can read hollisorg/iv-signal, then try again.' })
    set({ status: 'error', error: message.split('\n')[0].slice(0, 300) })
  })

  const check = async () => {
    if (state.status === 'downloading' || state.status === 'ready') return state
    if (TEST_FEED) {
      autoUpdater.setFeedURL({ provider: 'generic', url: TEST_FEED })
      set({ keySource: 'test feed' })
    } else {
      const { savedKey, useGh } = keys()
      const token = savedKey || (useGh ? await ghToken() : null)
      if (!token) {
        set({ status: 'needs-key', keySource: null, error: useGh ? 'The GitHub CLI isn\'t signed in on this PC.' : null })
        return state
      }
      autoUpdater.setFeedURL({ provider: 'github', ...REPO, private: true, token })
      set({ keySource: savedKey ? 'saved key' : 'GitHub CLI' })
    }
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
