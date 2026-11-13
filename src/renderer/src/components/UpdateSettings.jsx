import { useEffect, useState } from 'react'
import { call, on, when } from '../api'

// Live update state for the sidebar button and the Settings card.
export function useUpdate() {
  const [state, setState] = useState(null)
  useEffect(() => {
    call('updateState').then(setState, () => {})
    return on('update:changed', setState)
  }, [])
  return [state, setState]
}

export function UpdateButton() {
  const [u] = useUpdate()
  if (u?.status !== 'ready') return null
  return <button className="btn btn-primary btn-small update-now" onClick={() => call('updateInstall')}>↻ Update to {u.available}</button>
}

const SAY = {
  dev: 'Development copy: updates only run in an installed IV Signal.',
  idle: 'Waiting to check.',
  checking: 'Checking for a new version…',
  current: 'You have the newest version.',
  downloading: 'Downloading',
  ready: 'Ready to install',
  error: 'Couldn’t check for updates.',
}

export default function UpdateSettings({ notify }) {
  const [u, setU] = useUpdate()
  const [busy, setBusy] = useState(false)
  const run = (fn, ok) => async () => {
    if (busy) return
    setBusy(true)
    try {
      setU(await fn())
      if (ok) notify(ok, 'ok')
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy(false)
    }
  }
  if (!u) return <p className="dim small">Loading…</p>
  return (
    <div className="update-settings">
      <div className="iv-set-field">
        <span>This copy</span>
        <div>
          <strong>IV Signal {u.version}</strong>
          <small>{SAY[u.status] || u.status}{u.status === 'downloading' && u.available ? ` ${u.available} (${Math.round(u.percent || 0)}%)` : ''}{u.status === 'ready' ? ` ${u.available}. It installs when you restart or quit.` : ''}{u.checkedAt ? ` Last checked ${when(u.checkedAt)}.` : ''}</small>
          {u.error && <small className="bad">{u.error}</small>}
          <div className="form-actions">
            {u.status === 'ready' ? <button className="btn btn-primary" onClick={() => call('updateInstall')}>Restart to update</button> : <button className="btn" disabled={busy || u.status === 'dev' || u.status === 'checking' || u.status === 'downloading'} onClick={run(() => call('updateCheck'))}>Check for updates</button>}
          </div>
        </div>
      </div>
      <div className="iv-set-field">
        <span>How it works</span>
        <div>
          <small>IV Signal checks for a new version when it opens and every six hours, downloads it in the background, and installs it when you restart or quit. Nothing to set up.</small>
        </div>
      </div>
    </div>
  )
}
