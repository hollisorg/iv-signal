import { useEffect, useRef, useState } from 'react'
import { call, on } from '../api'
import { AgentRows, useAgentSetup } from './AgentSetup'
import { chatLines } from '../chatText'

// The chat with the person's own Claude Code, Codex or Hermes (ported from IV Studio's ChatPanel): a panel down the
// right side. Every IV Signal tool plus web research; approving posts, recording posting or removing things
// profile shows an Allow card first.
const NAMES = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes' }
const PLAN = { claude: 'Claude', codex: 'ChatGPT', hermes: 'Hermes' }
const tokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n || 0))
const timeOf = (at) => (at ? new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '')

const IDEAS = {
  today: [
    'Plan a week of posts for this brand',
    'What should I post about this week?',
    'Read my website and fill in my Brand Brain',
    'What should I do next?',
  ],
  brand: ['Read my website and fill in the profile', 'Ask me questions to learn how my brand sounds', 'What is missing from my Brand Brain?'],
  create: ['Turn this idea into posts for my networks', 'Make this post shorter and warmer', 'Write a version for LinkedIn too'],
  approve: ['Check these drafts against my Brand Brain', 'Fix the posts that cannot be approved yet', 'Which of these is strongest, and why?'],
  calendar: ['Plan posting times for my drafts this week', 'Fill the gaps in my next two weeks', 'What is ready for me to post today?'],
  library: ['Write picture descriptions for my library', 'Which posts need a picture?'],
  channels: ['Which networks suit my brand best?', 'How does posting work for now?'],
  settings: ['How do I use IV Signal from Claude Code?', 'What does IV Signal keep on my PC?'],
}

function useChat() {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    let live = true
    const load = () => call('chatStatus').then((s) => live && setStatus(s), () => {})
    load()
    const off = on('chat:changed', (chat) => live && setStatus((s) => (s ? { ...s, chat } : s)))
    return () => ((live = false), off())
  }, [])
  const reload = () => call('chatStatus').then(setStatus, () => {})
  return [status, reload]
}

const Parts = ({ parts }) =>
  parts.map((p, i) => (p.b ? <strong key={i}>{p.t}</strong> : p.i ? <em key={i}>{p.t}</em> : p.code ? <code key={i}>{p.t}</code> : <span key={i}>{p.t}</span>))

function ChatText({ text }) {
  return (
    <div className="chat-text">
      {chatLines(text).map((l, i) =>
        l.kind === 'rule' ? (
          <hr key={i} />
        ) : l.kind === 'head' ? (
          <div key={i} className="ct-head"><Parts parts={l.parts} /></div>
        ) : l.kind === 'bullet' ? (
          <div key={i} className="ct-bullet" style={l.indent ? { marginLeft: Math.min(l.indent, 8) * 6 } : undefined}>
            <span className="ct-mark">{l.mark}</span>
            <span><Parts parts={l.parts} /></span>
          </div>
        ) : l.parts.length ? (
          <div key={i}><Parts parts={l.parts} /></div>
        ) : (
          <div key={i} className="ct-gap" />
        ),
      )}
    </div>
  )
}

function Entry({ e, onAnswer, agentName, first }) {
  if (e.kind === 'you')
    return (
      <div className="chat-row you">
        <div className="bubble you">
          {e.files?.length > 0 && (
            <div className="chat-files">
              {e.files.map((f) => <span key={f.path} className="file-chip">{f.name}</span>)}
            </div>
          )}
          <span className="chat-name mono">You</span>
          <span className="chat-text">{e.text}</span>
          {e.at && <span className="chat-time mono">{timeOf(e.at)}</span>}
        </div>
      </div>
    )
  if (e.kind === 'agent')
    return (
      <div className="chat-row agent">
        <span className="message-avatar" aria-hidden="true">IV</span>
        <div className="bubble agent">
          {first && <span className="chat-name mono">{agentName}</span>}
          <ChatText text={e.text} />
          {e.at && <span className="chat-time mono">{timeOf(e.at)}</span>}
        </div>
      </div>
    )
  if (e.kind === 'compact') return <div className="chat-divider mono small">Earlier messages were summarized to make room</div>
  if (e.kind === 'problem') return <div className="chat-problem small" role="alert">{e.text}</div>
  if (e.kind === 'step')
    return (
      <div className={`chat-step mono small ${e.error ? 'err' : ''}`} title={e.error || undefined}>
        <span aria-hidden="true">{e.error ? '!' : '✓'}</span> {e.label}
        {e.count > 1 && <span className="dim"> ×{e.count}</span>}
        {e.error && <span className="chat-step-why">{e.error}</span>}
      </div>
    )
  if (e.kind === 'ask') {
    const args = Object.entries(e.args || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
    return (
      <div className={`chat-ask ${e.answer ? 'answered' : ''}`} role={e.answer ? undefined : 'group'} aria-label={`Allow ${e.label}?`}>
        <div className="chat-ask-title">Allow “{e.label}”?</div>
        <p className="small">{e.why}</p>
        {args.length > 0 && (
          <dl className="chat-ask-args mono small">
            {args.slice(0, 5).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        )}
        {e.answer ? (
          <p className="mono small chat-ask-answer">{e.answer === 'allow' ? 'Allowed' : e.answer === 'deny' ? 'Not allowed' : 'Not answered'}</p>
        ) : (
          <div className="chat-ask-btns">
            <button className="btn btn-small btn-primary" onClick={() => onAnswer(e.id, true)}>Allow</button>
            <button className="btn btn-small" onClick={() => onAnswer(e.id, false)}>Don’t allow</button>
          </div>
        )}
      </div>
    )
  }
  return null
}

function ContextMeter({ usage, engine }) {
  const [open, setOpen] = useState(false)
  if (!usage || (!usage.context && !usage.turns)) return null
  const p = usage.context && usage.window ? Math.min(100, Math.round((100 * usage.context) / usage.window)) : null
  return (
    <>
      <button className={`chat-context ${p >= 90 ? 'full' : p >= 70 ? 'warn' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} title="How full the agent's working memory is. Click for this chat's usage.">
        <span className="chat-context-bar" aria-hidden="true"><span style={{ width: `${p ?? 0}%` }} /></span>
        <span className="mono">{p != null ? `${usage.approx ? '~' : ''}${p}%` : tokens(usage.context || 0)}</span>
      </button>
      {open && (
        <div className="chat-usage small" role="note">
          <p>This chat: {tokens(usage.input)} tokens read ({tokens(usage.cached)} from cache), {tokens(usage.output)} written, over {usage.turns} {usage.turns === 1 ? 'turn' : 'turns'}.</p>
          <p className="dim">{engine === 'hermes' ? 'It runs on the model you picked in Hermes.' : `Uses your signed-in ${PLAN[engine]} account. Your plan limits and any extra-usage settings apply.`}</p>
        </div>
      )}
    </>
  )
}

function when(at) {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  if (new Date().toDateString() === d.toDateString()) return `Today, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function ChatPanel({ onClose, onPopOut, detached = false, context, page, notify }) {
  const [status, reload] = useChat()
  const setup = useAgentSetup()
  const [draft, setDraft] = useState({ tab: 'chat', text: '', files: [], engine: null })
  const [draftReady, setDraftReady] = useState(false)
  const { tab, text, files, engine } = draft
  const changeDraft = (patch) => { setDraft(d => ({...d,...patch})); call('chatSetComposer', patch).catch(e => notify?.(e.message)) }
  const setTab = tab => changeDraft({tab})
  const setText = text => changeDraft({text})
  const setFiles = value => changeDraft({files: typeof value === 'function' ? value(files) : value})
  const setEngine = engine => changeDraft({engine})
  useEffect(() => {
    let live = true
    const off = on('chat:composer', d => { if (live) { setDraft(d); setDraftReady(true) } })
    call('chatComposer').then(d => { if (live) { setDraft(d); setDraftReady(true) } }, e => notify?.(e.message))
    return () => { live = false; off() }
  }, [])
  const [dropping, setDropping] = useState(false)
  const bodyRef = useRef(null)
  const inputRef = useRef(null)
  const chat = status?.chat
  const installed = status?.installed || {}
  const ready = ['claude', 'codex', 'hermes'].filter((e) => installed[e])
  const pick = chat?.engine || (engine && installed[engine] ? engine : status?.preferred)
  const nameOf = (e) => status?.agentName || NAMES[e]
  const busy = !!chat?.busy
  const act = (fn) => async (...a) => {
    try {
      await fn(...a)
    } catch (err) {
      notify?.(err.message)
    }
  }

  const count = chat?.entries?.length || 0
  const lastText = chat?.entries?.[count - 1]?.text
  useEffect(() => {
    const b = bodyRef.current
    if (b) b.scrollTop = b.scrollHeight
  }, [count, lastText, busy, chat?.id, tab])
  useEffect(() => {
    const t = inputRef.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 160)}px`
  }, [text])
  const agentsReady = `${!!setup?.claude?.installed}${!!setup?.codex?.installed}`
  useEffect(() => {
    reload()
  }, [agentsReady])

  const send = act(async (words) => {
    const t = (words ?? text).trim()
    if ((!t && !files.length) || busy) return
    const withFiles = files
    await call('chatSend', { text: t, context, engine: pick, files: withFiles })
  })
  const addFiles = (paths) => {
    const ok = (paths || []).filter((p) => /\.(txt|md|csv)$/i.test(p))
    if (ok.length < (paths || []).length) notify?.('Only text notes (.txt, .md, .csv) can go in the chat. Add pictures and videos in the Library.')
    setFiles((now) => [...new Set([...now, ...ok])].slice(0, 5))
  }
  const fresh = act(async (e) => {
    await call('chatNew', { engine: e || pick })
    reload()
  })
  const openChat = act(async (id) => {
    await call('chatOpen', { id })
    reload()
  })
  const answer = act((id, allow) => call('chatAnswer', { id, allow }))
  const stop = act(() => call('chatStop'))

  return (
    <aside
      className={`chat ${dropping ? 'dropping' : ''}`}
      aria-label="Chat"
      onDragOver={(ev) => {
        if (!pick || ![...(ev.dataTransfer?.types || [])].includes('Files')) return
        ev.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(ev) => !ev.currentTarget.contains(ev.relatedTarget) && setDropping(false)}
      onDrop={(ev) => {
        if (!pick) return
        ev.preventDefault()
        setDropping(false)
        addFiles([...(ev.dataTransfer?.files || [])].map((f) => window.ivsignal.pathFor(f)).filter(Boolean))
      }}
    >
      <header className="chat-head">
        <span className="chat-avatar" aria-hidden="true">IV</span>
        <div className="chat-tabs" role="tablist" aria-label="Chat or history">
          <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Chat</button>
          <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History</button>
        </div>
        <span className="spacer" />
        {chat?.entries?.length > 0 && tab === 'chat' && (
          <button className="btn btn-small" disabled={busy} onClick={() => fresh()}>New</button>
        )}
        <button className="icon-btn chat-pop" aria-label={detached ? 'Dock chat' : 'Pop out chat'} title={detached ? 'Return chat to the app' : 'Open chat in its own window'} onClick={onPopOut}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{detached ? <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M14 4v16M7 12h4m-2-2 2 2-2 2"/></> : <><path d="M14 4h6v6M20 4l-9 9M10 5H4v15h15v-6"/></>}</svg>
        </button>
        <button className="icon-btn" aria-label="Close the chat" title="Close the chat" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>

      {tab === 'history' ? (
        <div className="chat-body chat-list">
          <p className="small dim">{status?.chats?.length ? 'Your conversations, newest first.' : 'No conversations yet.'}</p>
          <ul>
            {(status?.chats || []).map((c) => (
              <li key={c.id}>
                <button className={c.id === chat?.id ? 'on' : ''} disabled={busy && c.id !== chat?.id} onClick={async () => (c.id !== chat?.id && (await openChat(c.id)), setTab('chat'))}>
                  <span className="chat-list-title">{c.title || 'Untitled'}</span>
                  <span className="mono small dim">{NAMES[c.engine]} · {when(c.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : !pick ? (
        <div className="chat-body chat-setup">
          <h3 className="chat-setup-title">Chat with your own agent</h3>
          <p className="small">IV Signal’s chat runs on your own Claude Code, Codex or Hermes, on your own plan. Install one here, or sign in if you already have it.</p>
          <AgentRows setup={setup} notify={notify} />
        </div>
      ) : (
        <>
          <div className="chat-subhead">
            {ready.length > 1 && !chat?.entries?.length ? (
              <div className="segmented" role="radiogroup" aria-label="Agent">
                {ready.map((e) => (
                  <button key={e} role="radio" aria-checked={pick === e} className={pick === e ? 'on' : ''} onClick={() => (chat ? fresh(e) : setEngine(e))}>
                    {NAMES[e]}
                  </button>
                ))}
              </div>
            ) : (
              <span className="chat-who mono small"><span className="dot" aria-hidden="true" /> {nameOf(pick)}</span>
            )}
            <span className="spacer" />
            <ContextMeter usage={chat?.usage} engine={chat?.engine || pick} />
          </div>

          <div className="chat-body" ref={bodyRef} aria-live="polite">
            {!chat?.entries?.length ? (
              <div className="chat-empty">
                <p>Tell {nameOf(pick)} what you want to say this week, or ask it to read your website and fill in your Brand Brain. It drafts each post in your brand’s voice for every network, for your OK.</p>
                <div className="ideas">
                  {(IDEAS[page] || IDEAS.today).map((i) => (
                    <button key={i} className="idea" onClick={() => (setText(i), inputRef.current?.focus())}>{i}</button>
                  ))}
                </div>
              </div>
            ) : (
              chat.entries.map((e, i) => <Entry key={i} e={e} onAnswer={answer} agentName={nameOf(chat.engine)} first={e.kind !== chat.entries[i - 1]?.kind} />)
            )}
            {busy && (
              <div className="chat-row agent">
                <div className="bubble agent typing" aria-label={`${chat.name} is working`}><span /><span /><span /></div>
              </div>
            )}
          </div>

          <div className="chat-dock">
            {files.length > 0 && (
              <div className="chat-files">
                {files.map((f) => (
                  <span key={f} className="file-chip" title={f}>
                    {f.split(/[\\/]/).pop()}
                    <button aria-label="Remove" onClick={() => setFiles((now) => now.filter((x) => x !== f))}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="composer">
              <button className="icon-btn" disabled={busy || files.length >= 5} onClick={act(async () => addFiles(await call('chatPickFiles')))} title="Add a notes file (or drop it here)" aria-label="Add files">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" /></svg>
              </button>
              <textarea
                disabled={!draftReady}
                ref={inputRef}
                rows={1}
                value={text}
                placeholder={`Message ${nameOf(pick)}…`}
                aria-label={`Message ${nameOf(pick)}`}
                onChange={(ev) => setText(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing) {
                    ev.preventDefault()
                    send()
                  }
                }}
              />
              {busy ? (
                <button className="send stop" onClick={stop} title="Stop the answer" aria-label="Stop">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>
                </button>
              ) : (
                <button className="send" disabled={!text.trim() && !files.length} onClick={() => send()} title="Send (Enter)" aria-label="Send">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l14-7-5 14-2-6z" /></svg>
                </button>
              )}
            </div>
            <p className="chat-foot small dim">
              {pick === 'hermes'
                ? 'Your own Hermes, on the model you picked in Hermes. It asks before approving posts or removing anything.'
                : `Your own ${NAMES[pick]}, on your ${PLAN[pick]} plan. It asks before approving posts or removing anything.`}
            </p>
          </div>
        </>
      )}
    </aside>
  )
}
