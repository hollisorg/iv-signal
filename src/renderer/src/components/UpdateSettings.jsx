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
  'needs-key': 'Needs a key to check for updates.',
  error: 'Couldn’t check for updates.',
}

export default function UpdateSettings({ notify }) {
  const [u, setU] = useUpdate()
  const [key, setKey] = useState('')
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
          <small>{SAY[u.status] || u.status}{u.status === 'downloading' && u.available ? ` ${u.available} (${Math.round(u.percent || 0)}%)` : ''}{u.status === 'ready' ? ` ${u.available}. It installs when you restart or quit.` : ''}{u.checkedAt ? ` Last checked ${when(u.checkedAt)}.` : ''}{u.keySource ? ` Using the ${u.keySource}.` : ''}</small>
          {u.error && <small className="bad">{u.error}</small>}
          <div className="form-actions">
            {u.status === 'ready' ? <button className="btn btn-primary" onClick={() => call('updateInstall')}>Restart to update</button> : <button className="btn" disabled={busy || u.status === 'dev' || u.status === 'checking' || u.status === 'downloading'} onClick={run(() => call('updateCheck'))}>Check for updates</button>}
          </div>
        </div>
      </div>
      <div className="iv-set-field">
        <span>Update key</span>
        <div>
          <small>IV Signal’s releases live in the private repo {u.repo}, so each PC needs a read-only GitHub key to download them. Make a fine-grained key with access to that one repository and Contents set to Read-only, then paste it here. It’s stored encrypted on this PC.</small>
          {u.hasKey ? (
            <div className="form-actions"><span className="chip st-interested">Key saved</span><button className="btn btn-quiet btn-small" disabled={busy} onClick={run(() => call('updateClearKey'), 'Key removed.')}>Remove key</button></div>
          ) : (
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await call('updateSaveKey', { key }); setKey(''); return r }, 'Key saved. IV Signal checked for updates.')() }}>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="github_pat_…" autoComplete="off" aria-label="GitHub key" data-private />
              <button className="btn" disabled={busy || !key.trim()}>Save key</button>
            </form>
          )}
          <label className="update-gh"><input type="checkbox" checked={u.useGh} disabled={busy} onChange={(e) => run(() => call('updateUseGh', { on: e.target.checked }))()} /><span>Or use my GitHub CLI sign-in (gh) when there’s no key. IV Signal reads it at each check and doesn’t store it.</span></label>
        </div>
      </div>
    </div>
  )
}
