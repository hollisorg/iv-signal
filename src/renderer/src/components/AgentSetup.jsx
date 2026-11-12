import { useEffect, useState } from 'react'
import { call, on } from '../api'

// Claude Code and Codex on this PC (ported from IV Studio): found or not, Install with the maker's own installer, and
// Sign in (a window running the agent's login). Hermes is found when installed.
export function useAgentSetup() {
  const [setup, setSetup] = useState(null)
  useEffect(() => {
    let live = true
    const load = () => call('agentSetup').then((s) => live && setSetup(s), () => {})
    load()
    const off = on('agents:setupChanged', (s) => live && setSetup((x) => ({ ...(x || {}), ...s })))
    // back from the sign-in window: check again
    window.addEventListener('focus', load)
    return () => ((live = false), off(), window.removeEventListener('focus', load))
  }, [])
  return setup
}

const ENGINES = ['claude', 'codex']

export function AgentRows({ setup, notify }) {
  if (!setup) return <p className="dim small">Looking for Claude Code, Codex and Hermes…</p>
  const busy = setup.install?.status === 'running' ? setup.install.engine : null
  const act = (fn) => async () => {
    try {
      await fn()
    } catch (e) {
      notify?.(e.message)
    }
  }
  return (
    <div className="agent-setup">
      {ENGINES.map((engine) => {
        const a = setup[engine]
        if (!a) return null
        const mine = setup.install?.engine === engine ? setup.install : null
        const installing = mine?.status === 'running'
        const failed = mine?.status === 'failed' && !a.installed
        const ready = a.installed && a.signedIn === true
        const state = installing ? 'Installing…' : ready ? 'Ready' : a.installed ? (a.signedIn === false ? 'Installed, not signed in' : 'Installed') : 'Not on this PC'
        return (
          <div key={engine} className={`agent-row ${ready ? 'ready' : ''}`}>
            <div className="agent-who">
              <span className="agent-name">
                {ready && (
                  <svg className="tick" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.2 4.2L19 7" />
                  </svg>
                )}
                {a.name}
              </span>
              <span className={`agent-state mono ${ready ? 'ok' : 'dim'}`}>{state}</span>
            </div>
            <div className="agent-act">
              {installing ? (
                <button className="btn btn-small" onClick={act(() => call('agentStopInstall'))}>Stop</button>
              ) : !a.installed ? (
                <button className="btn btn-small btn-primary" disabled={!!busy} title={busy ? 'One install at a time' : `Install ${a.name} with ${a.maker}'s own installer`} onClick={act(() => call('agentInstall', { engine }))}>
                  Install {a.name}
                </button>
              ) : (
                a.signedIn !== true && (
                  <button className="btn btn-small" onClick={act(() => call('agentSignIn', { engine }))}>Sign in</button>
                )
              )}
            </div>
            {installing && <p className="agent-line mono small dim" aria-live="polite">{mine.lines?.at(-1) || `Starting ${a.maker}'s installer…`}</p>}
            {failed && (
              <p className="agent-line small bad" role="alert">
                {mine.error || 'The install stopped.'}{' '}
                <button className="link-btn" onClick={act(() => call('openLink', { url: a.site }))}>Get it from {a.maker} ↗</button>
              </p>
            )}
            {!a.installed && !installing && !failed && <p className="agent-line small dim">{a.plan} Installs in a minute or two, no admin needed, and keeps itself up to date.</p>}
            {a.installed && a.signedIn !== true && !installing && (
              <p className="agent-line small dim">Sign in opens a small window that starts {a.name}’s browser login. When it’s done, close it and come back here.</p>
            )}
          </div>
        )
      })}
      <div className={`agent-row ${setup.hermes?.installed ? 'ready' : ''}`}>
        <div className="agent-who">
          <span className="agent-name">Hermes</span>
          <span className={`agent-state mono ${setup.hermes?.installed ? 'ok' : 'dim'}`}>{setup.hermes?.installed ? 'Found' : 'Not on this PC'}</span>
        </div>
        <div className="agent-act">
          {!setup.hermes?.installed && (
            <button className="btn btn-small" onClick={act(() => call('openLink', { url: 'https://hermes-agent.nousresearch.com' }))}>Get Hermes ↗</button>
          )}
        </div>
      </div>
    </div>
  )
}
