import { useEffect, useState } from 'react'
import { call, on } from '../api'
import ChatPanel from './ChatPanel'

export default function ChatWindow() {
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    call('chatWindowState').then(setState, e => setError(e.message))
    return on('chat:window', setState)
  }, [])
  const dock = () => call('chatDock').catch(e => setError(e.message))
  return <div className="chat-popout">
    <div className="popout-context"><span className="eyebrow">IV Signal / Chat</span><span>{state?.context?.brandName || 'Your brand'}{state?.context?.postTitle ? ` / ${state.context.postTitle}` : ''} · {state?.context?.page || 'Today'}</span></div>
    {state && <ChatPanel detached context={state.context} page={state.context.page} onClose={dock} onPopOut={dock} notify={setError} />}
    {error && <div className="popout-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
  </div>
}
