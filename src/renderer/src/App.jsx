import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useData, call, on } from './api'
import Onboarding from './components/Onboarding'
import { BrandMark } from './components/BrandIdentity'
import BrandDialog from './components/BrandDialog'
import GuideHost from './components/GuideHost'
import { startGuide } from './guides'
import ChatPanel from './components/ChatPanel'
import { Wordmark } from './components/Logo'
import Today from './pages/Today'
import Brand from './pages/Brand'
import Create from './pages/Create'
import Approve from './pages/Approve'
import Calendar from './pages/Calendar'
import Library from './pages/Library'
import Channels from './pages/Channels'
import Settings from './pages/Settings'
import { UpdateButton } from './components/UpdateSettings'

const NAV = [
  { id: 'today', label: 'Today' },
  { id: 'brand', label: 'Brand Brain' },
  { id: 'create', label: 'Create' },
  { id: 'approve', label: 'Approve' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'library', label: 'Library' },
  { id: 'channels', label: 'Networks' },
  { id: 'settings', label: 'Settings' },
]
const AGENT = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes' }
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

export default function App() {
  const [page, setPage] = useState('today')
  const [chatOpen, setChatOpen] = useState(true)
  const [chatWindow, setChatWindow] = useState({ detached: false })
  const [onboarding, setOnboarding] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [brandId, setBrandId] = useState(undefined)
  const [brandDialog, setBrandDialog] = useState(null)
  const [switcher, setSwitcher] = useState(false)
  const [post, setPost] = useState(null)
  const [toast, setToast] = useState(null)
  const [workspace, reloadWorkspace] = useData('workspaceState')
  const brands = workspace?.brands || []
  const chosen = brandId === undefined ? workspace?.brandId : brandId
  const brand = brands.find((b) => b.id === chosen) || brands[0] || null
  const [overview] = useData('overview', { brand_id: brand?.id || '__none__' }, [brand?.id])
  const [chat] = useData('chatStatus')
  const [fbStatus] = useData('metaStatus', { brand_id: brand?.id }, [brand?.id])

  const notify = (text, tone = 'error') => {
    setToast({ text, tone })
    setTimeout(() => setToast(null), 5000)
  }
  const selectBrand = (id) => {
    setBrandId(id)
    setPost(null)
    setSwitcher(false)
    call('workspaceSelect', { brandId: id }).catch((e) => notify(e.message))
  }
  const go = (p, opts = {}) => {
    setPage(p)
    if (opts.post !== undefined) setPost(opts.post)
  }
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }) }, [page])
  useEffect(() => {
    call('chatWindowState').then(setChatWindow)
    const off = on('chat:window', (state) => { setChatWindow(state); if (state.returned) setChatOpen(true) })
    call('onboardingStatus').then((state) => { setOnboarding(state); setShowOnboarding(state.showOnLaunch) }).catch((e) => notify(e.message))
    const handoff = (e) => { setChatOpen(true); call('chatHandoff', e.detail).catch((err) => notify(err.message)) }
    window.addEventListener('iv:ask', handoff)
    return () => { off(); window.removeEventListener('iv:ask', handoff) }
  }, [])
  const context = { page, brandId: brand?.id || null, brandName: brand?.name || null, postId: page === 'create' ? post?.id || null : null, postTitle: page === 'create' ? post?.title || null : null, timezone: TIMEZONE }
  useEffect(() => { call('chatSetContext', context).catch((e) => notify(e.message)) }, [page, brand?.id, brand?.name, post?.id, post?.title])

  const docked = chatOpen && !chatWindow.detached
  const openOnboarding = async () => { try { setOnboarding(await call('onboardingStatus')); setShowOnboarding(true) } catch (e) { notify(e.message) } }
  const agent = chat?.chat?.engine || chat?.preferred
  const counts = overview?.counts
  const shared = {
    brand, brands, overview, go, notify, post, setPost,
    addBrand: () => setBrandDialog('new'),
    editBrand: () => setBrandDialog('edit'),
    openChat: () => { flushSync(() => setChatOpen(true)); if (chatWindow.detached) call('chatFocus').catch((e) => notify(e.message)) },
    openOnboarding,
  }

  return (
    <div className={`app ${docked ? 'with-chat' : ''}`}>
      <header className="titlebar">
        <div className="titlebar-brand"><Wordmark tone="light" /></div>
        <div className="titlebar-mid">
          <span className="badge" title={agent ? `The chat runs on your ${AGENT[agent]}` : 'No agent installed yet'}>
            <span className={`dot ${agent ? 'ok' : ''}`} />
            <span className="mono">{agent ? AGENT[agent] : 'No agent'}</span>
          </span>
          <button className="badge as-btn" onClick={() => go('channels')} title={fbStatus?.connected ? `Facebook posts go straight to ${fbStatus.page_name}; other networks are posted by hand` : 'Publishing isn’t connected yet: you post approved versions yourself'}>
            <span className={`dot ${fbStatus?.connected ? 'ok' : 'idle'}`} />
            <span className="mono">{fbStatus?.connected ? 'Facebook direct' : 'Posting by hand'}</span>
          </button>
          {(!chatOpen || chatWindow.detached) && (
            <button className="badge as-btn" onClick={shared.openChat}>
              <span className="mono">{chatWindow.detached ? 'Show chat window ↗' : 'Open chat'}</span>
            </button>
          )}
        </div>
      </header>

      <div className={`shell ${docked ? 'with-chat' : ''}`}>
        <nav className="side" aria-label="IV Signal">
          <div className="side-purpose"><span className="eyebrow">Say it once. Say it well.</span><p>Your brand.<br />Every channel.</p></div>
          <ul className="nav">
            {NAV.map((n, i) => (
              <li key={n.id}>
                <button className={page === n.id ? 'on' : ''} aria-current={page === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
                  <span className="nav-label"><span className="nav-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{n.label}</span>
                  {n.id === 'approve' && counts?.drafts > 0 && <span className="count">{counts.drafts}</span>}
                  {n.id === 'calendar' && counts?.to_post > 0 && <span className="count">{counts.to_post}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="side-foot">
            <p className="eyebrow">{brand?.name || 'Your brand'} / This week</p>
            {counts && (
              <>
                <Meter label="Planned" n={counts.planned_week} cap={Math.max(7, counts.planned_week)} />
                <Meter label="Posted" n={counts.posted_week} cap={Math.max(7, counts.posted_week, counts.planned_week)} />
                <Meter label="Brand Brain notes" n={counts.brain} cap={Math.max(20, counts.brain)} />
              </>
            )}
            <UpdateButton />
            <p className="side-brand mono">Infinite Variance / Signal</p>
          </div>
        </nav>

        <main className="main">
          <div className="workspace-strip" data-guide="workspace">
            <button className="workspace-brand" onClick={() => setSwitcher(!switcher)} aria-expanded={switcher} aria-label="Switch brand">
              <BrandMark brand={brand} />
              <span><small>{brand ? 'Brand' : 'Start here'}</small><strong>{brand?.name || 'Add your brand'}</strong></span>
              <span aria-hidden="true">⌄</span>
            </button>
            <span className="workspace-divider" aria-hidden="true">/</span>
            <button className="workspace-plan" onClick={() => go('brand')}><small>Brand Brain <span className="dim">· {counts?.brain ?? 0} note{counts?.brain === 1 ? "" : "s"}</span></small><strong>{overview?.profile_missing?.length ? `Add ${overview.profile_missing[0]}` : 'Open the Brand Brain'} <span aria-hidden="true">↗</span></strong></button>
            <button className="help-launch" onClick={() => startGuide(page)}><b>?</b> How this works</button>
            {switcher && (
              <div className="brand-switch" role="menu">
                {brands.map((b) => (
                  <button key={b.id} role="menuitem" className={b.id === brand?.id ? 'on' : ''} onClick={() => selectBrand(b.id)}>
                    <BrandMark brand={b} /><span><strong>{b.name}</strong><small>{b.post_count} posts · {b.brain_count} notes</small></span>
                  </button>
                ))}
                <button role="menuitem" className="brand-switch-add" onClick={() => { setSwitcher(false); setBrandDialog('new') }}>＋ Add a brand</button>
                {brand && <button role="menuitem" className="brand-switch-add" onClick={() => { setSwitcher(false); setBrandDialog('edit') }}>Edit {brand.name}</button>}
              </div>
            )}
          </div>
          {!workspace ? <div className="page"><p className="dim">Loading…</p></div> : !brand && page === 'settings' ? <Settings {...shared} /> : !brand ? <NoBrand addBrand={() => setBrandDialog('new')} openOnboarding={openOnboarding} /> : (
            <>
              {page === 'today' && <Today {...shared} />}
              {page === 'brand' && <Brand {...shared} />}
              {page === 'create' && <Create {...shared} />}
              {page === 'approve' && <Approve {...shared} />}
              {page === 'calendar' && <Calendar {...shared} />}
              {page === 'library' && <Library {...shared} />}
              {page === 'channels' && <Channels {...shared} />}
              {page === 'settings' && <Settings {...shared} />}
            </>
          )}
        </main>

        {docked && (
          <ChatPanel
            onClose={() => setChatOpen(false)}
            onPopOut={() => call('chatPopOut').catch((e) => notify(e.message))}
            context={context}
            page={page}
            notify={notify}
            go={go}
          />
        )}
      </div>

      {showOnboarding && onboarding && <Onboarding initial={onboarding} notify={notify} onClose={() => setShowOnboarding(false)} onFinish={(state, target) => { setOnboarding(state); setShowOnboarding(false); reloadWorkspace(); if (state.brandId) selectBrand(state.brandId); go(target) }} />}
      <GuideHost page={page} go={go} notify={notify} modalOpen={!!brandDialog || showOnboarding} />
      {brandDialog && <BrandDialog kind={brandDialog} brand={brandDialog === 'edit' ? brand : null} notify={notify} onClose={() => setBrandDialog(null)} onSaved={(saved) => { reloadWorkspace(); selectBrand(saved.id); setBrandDialog(null); notify(brandDialog === 'edit' ? 'Brand updated.' : `${saved.name} is ready.`, 'ok') }} />}
      {toast && <div className={`toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.text}</div>}
    </div>
  )
}

function NoBrand({ addBrand, openOnboarding }) {
  return (
    <div className="page">
      <div className="empty">
        <p className="empty-title">Start with your brand.</p>
        <p className="dim">IV Signal keeps each brand's voice, offer and rules in its own Brand Brain. Add one to begin.</p>
        <div className="form-actions"><button className="btn btn-primary" onClick={openOnboarding}>Guided setup</button><button className="btn" onClick={addBrand}>Add a brand</button></div>
      </div>
    </div>
  )
}

function Meter({ label, n, cap }) {
  const p = cap ? Math.min(100, Math.round((100 * n) / cap)) : 0
  return (
    <div className="meter">
      <div className="meter-top"><span className="mono">{label}</span><span className="mono">{n}</span></div>
      <div className="meter-bar" aria-hidden="true"><span style={{ width: `${p}%` }} /></div>
    </div>
  )
}
