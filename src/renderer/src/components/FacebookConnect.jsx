import { useState } from 'react'
import { call, useData } from '../api'

// Connect one Facebook Page per brand with a Page access token the person makes in Meta's Graph API Explorer. The token
// is checked with Facebook, then kept encrypted on this PC; IV Signal never shows it again.
export default function FacebookConnect({ brand, notify, embedded = false }) {
  const [status, reload] = useData('metaStatus', { brand_id: brand.id }, [brand.id])
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const connect = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await call('metaConnect', { brand_id: brand.id, token })
      setToken('')
      setOpen(false)
      notify(`Connected to ${r.page_name}. Approved Facebook posts can now go straight to it.`, 'ok')
      reload()
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }
  const disconnect = async () => {
    try {
      await call('metaDisconnect', { brand_id: brand.id })
      notify('Disconnected. Facebook is back to posting by hand. Posts already scheduled there stay scheduled.', 'ok')
      reload()
    } catch (err) {
      notify(err.message)
    }
  }
  if (!status) return null
  return (
    <section className={embedded ? 'fb-connect' : 'panel fb-connect'}>
      <div className={embedded ? 'fb-head' : 'panel-head'}>
        {embedded ? <strong>Post straight to a Facebook Page</strong> : <h2>Post straight to a Facebook Page</h2>}
        {status.connected ? <span className="chip st-interested">Connected</span> : <span className="chip">Optional</span>}
      </div>
      {status.connected ? (
        <div className="fb-connected">
          <p>Connected to <strong>{status.page_name}</strong>. Approved Facebook posts show <em>Schedule on Facebook</em> on the Calendar; Facebook posts them at their time, even with IV Signal closed.</p>
          <div className="form-actions">
            {status.link && <button className="btn btn-small" onClick={() => call('openChannel', { channel: 'facebook', url: status.link }).catch((e) => notify(e.message))}>Open the Page ↗</button>}
            <button className="btn btn-small" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Use a new token'}</button>
            <button className="btn btn-small btn-quiet" onClick={disconnect}>Disconnect</button>
          </div>
        </div>
      ) : (
        <>
          <p className="small">Facebook can post directly now, with a token you make for your own Page. Pictures and words only; videos still go by hand.</p>
          {!open && <button className="btn btn-primary btn-small" onClick={() => setOpen(true)}>Connect a Page</button>}
        </>
      )}
      {open && (
        <div className="fb-steps">
          <ol className="small">
            <li>Open <button type="button" className="link-btn" onClick={() => call('openChannel', { channel: 'facebook', url: 'https://developers.facebook.com/tools/explorer/' }).catch((e) => notify(e.message))}>Graph API Explorer</button> and pick your Meta app.</li>
            <li>Under <em>User or Page</em>, choose <strong>Get Page Access Token</strong> and pick the Page.</li>
            <li>Add the permissions <span className="mono">pages_manage_posts</span>, <span className="mono">pages_read_engagement</span> and <span className="mono">pages_show_list</span>, then <strong>Generate Access Token</strong>.</li>
            <li>For a token that lasts, open it in the <button type="button" className="link-btn" onClick={() => call('openChannel', { channel: 'facebook', url: 'https://developers.facebook.com/tools/debug/accesstoken/' }).catch((e) => notify(e.message))}>Access Token Debugger</button> and choose <strong>Extend Access Token</strong>.</li>
            <li>Copy the Page token and paste it here.</li>
          </ol>
          <form onSubmit={connect} className="fb-form">
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the Page access token" autoComplete="off" aria-label="Facebook Page access token" data-private />
            <button className="btn btn-primary btn-small" disabled={busy || token.trim().length < 40}>{busy ? 'Checking with Facebook…' : 'Connect'}</button>
          </form>
          <p className="small dim">IV Signal checks the token with Facebook, keeps it encrypted on this PC, and only uses it when you click to schedule or post.</p>
        </div>
      )}
    </section>
  )
}
