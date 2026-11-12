// The person's own Claude Code, Codex or Hermes on this PC (ported from IV Studio's harness.js). IV Signal's chat runs
// on whichever they have, on their own plan; IV Signal never needs an API key of its own.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const HARNESSES = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes' }

// Claude Code takes these names; '' leaves the choice to the person's Claude Code settings.
export const CLAUDE_MODELS = [
  { id: '', name: 'Your Claude Code default' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
]

const firstExisting = (paths) => paths.find((p) => p && fs.existsSync(p)) || null

// The Codex app keeps its command-line tool in OpenAI\Codex\bin, newer builds in hash-named subfolders next to an
// older one; the most recently updated copy is the one the app itself uses.
function newestCodex(local) {
  const bin = path.join(local, 'OpenAI', 'Codex', 'bin')
  const found = []
  try {
    for (const name of ['', ...fs.readdirSync(bin)]) {
      const exe = path.join(bin, name, 'codex.exe')
      if (fs.existsSync(exe)) found.push({ exe, at: fs.statSync(exe).mtimeMs })
    }
  } catch {
    /* no Codex app */
  }
  return found.sort((a, b) => b.at - a.at)[0]?.exe || null
}

// A program on PATH or in the places Linux and Mac installers put it (an app started from the desktop or Finder
// gets a short PATH; Homebrew lives in /opt/homebrew on Apple Silicon and /usr/local on Intel Macs).
export const EXTRA_BIN = (home = os.homedir()) => [path.join(home, '.local', 'bin'), path.join(home, '.npm-global', 'bin'), path.join(home, '.bun', 'bin'), path.join(home, '.volta', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
export function onPath(name, env = process.env, home = os.homedir()) {
  const dirs = [...String(env.PATH || '').split(path.delimiter), ...EXTRA_BIN(home)]
  return firstExisting(dirs.filter(Boolean).map((d) => path.join(d, name)))
}

export function findHarnesses(env = process.env, home = os.homedir(), platform = process.platform) {
  if (platform !== 'win32') return { claude: firstExisting([path.join(home, '.claude', 'local', 'claude')]) || onPath('claude', env, home), codex: onPath('codex', env, home) }
  const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  const roaming = env.APPDATA || path.join(home, 'AppData', 'Roaming')
  return {
    claude: firstExisting([path.join(home, '.local', 'bin', 'claude.exe'), path.join(roaming, 'npm', 'claude.cmd')]),
    // the Codex app's copy, then OpenAI's command-line installer (install.ps1), then npm
    codex: newestCodex(local) || firstExisting([path.join(local, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'), path.join(roaming, 'npm', 'codex.cmd')]),
  }
}

const codexHome = (env, home) => env.CODEX_HOME || path.join(home, '.codex')

// The model in the person's Codex settings: their config is skipped when IV Signal runs Codex, so it's passed on.
export function codexConfigured(env = process.env, home = os.homedir()) {
  try {
    return /^\s*model\s*=\s*["']([^"']+)["']/m.exec(fs.readFileSync(path.join(codexHome(env, home), 'config.toml'), 'utf8'))?.[1] || null
  } catch {
    return null
  }
}

// A Codex model's usable context window (its models cache), for the chat's context meter.
export function codexWindow(model = '', env = process.env, home = os.homedir()) {
  const slug = model || codexConfigured(env, home)
  try {
    const cache = JSON.parse(fs.readFileSync(path.join(codexHome(env, home), 'models_cache.json'), 'utf8'))
    const list = cache.models || (Array.isArray(cache) ? cache : [])
    const m = list.find((x) => x.slug === slug) || (!slug && list[0]) || null
    if (!m?.context_window) return null
    return { model: m.slug, window: Math.round((m.context_window * (m.effective_context_window_percent || 100)) / 100) }
  } catch {
    return null
  }
}
