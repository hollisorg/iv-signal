import PageStage from '../components/PageStage'
import { useEffect, useState } from 'react'
import { call, useData, when } from '../api'
import { AgentRows, useAgentSetup } from '../components/AgentSetup'
import { BrandMark } from '../components/BrandIdentity'
import UpdateSettings from '../components/UpdateSettings'

const TOPICS = [
  ['brands', 'Brands', 'Each brand has its own Brand Brain, posts, calendar and library.'],
  ['agent', 'Your agent', 'The chat runs on your own agent, shared across brands.'],
  ['connections', 'Other apps', 'Use IV Signal from Claude Code, Codex or Claude Desktop.'],
  ['updates', 'Updates', 'IV Signal keeps itself up to date, no setup needed.'],
  ['activity', 'Activity', 'Every change, and who made it.'],
  ['data', 'Your data', 'What IV Signal keeps, and where.'],
]
export default function Settings({ notify, openOnboarding, ...workspace }) {
  const [active, setActive] = useState('brands')
  useEffect(() => {
    const main = document.querySelector('main')
    const sync = () => {
      const line = main.getBoundingClientRect().top + Math.min(220, main.clientHeight * .3)
      let current = TOPICS[0][0]
      for (const [id] of TOPICS) if (document.getElementById(`setup-${id}`)?.getBoundingClientRect().top <= line) current = id
      if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4) current = TOPICS.at(-1)[0]
      setActive(current)
    }
    main.addEventListener('scroll', sync, { passive: true }); sync()
    return () => main.removeEventListener('scroll', sync)
  }, [])
  const sections = {
    brands: <Brands {...workspace} />,
    agent: <Agent notify={notify} />,
    connections: <Connect notify={notify} />,
    updates: <UpdateSettings notify={notify} />,
    activity: <Activity brand={workspace.brand} />,
    data: <YourData />,
  }
  return <div className="page settings">
    <PageStage kind="settings" title="Your setup" kicker="Infinite Variance / Make it yours" subtitle="Your brands. Your agent. Your way." />
    <div className="setup-reopen"><span className="small dim">{workspace.brand?.name || 'Your workspace'} / Settings</span><button className="btn" onClick={openOnboarding}>Open guided setup ↗</button></div>
    <div className="iv-set-layout">
      <nav className="iv-set-nav" aria-label="Settings sections">{TOPICS.map(([id, title], i) => <button key={id} className={active === id ? 'on' : ''} aria-current={active === id ? 'location' : undefined} onClick={() => {
        const el = document.getElementById(`setup-${id}`)
        el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); el?.focus({ preventScroll: true }); setActive(id)
      }}><span className="mono">{String(i+1).padStart(2,'0')}</span>{title}</button>)}</nav>
      <div className="iv-set-cards">{TOPICS.map(([id,title,sub],i) => <section key={id} id={`setup-${id}`} className="iv-set-card" tabIndex={-1} aria-labelledby={`setup-title-${id}`}>
        <header className="iv-set-card-head"><span className="iv-set-number" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><div><h2 id={`setup-title-${id}`}>{title}</h2><p className="small dim">{sub}</p></div></header>
        <div className="iv-set-body">{sections[id]}</div>
      </section>)}</div>
    </div>
  </div>
}

function Brands({ brands, brand, addBrand, editBrand }) {
  return (
    <div className="brand-rows">
      {brands.map((b) => (
        <div key={b.id} className="business-campaign-row">
          <BrandMark brand={b} />
          <div><strong>{b.name}</strong><span className="small dim">{b.post_count} posts · {b.brain_count} Brand Brain notes{b.id === brand?.id ? ' · open now' : ''}</span></div>
          {b.id === brand?.id && <button className="btn btn-small" onClick={editBrand}>Edit</button>}
        </div>
      ))}
      <div className="form-actions"><button className="btn" onClick={addBrand}>＋ Add a brand</button></div>
    </div>
  )
}

const WHO = (a) => (a === 'person' ? 'You' : a?.startsWith('chat:') ? `Chat · ${a.slice(5) === 'claude' ? 'Claude Code' : a.slice(5) === 'codex' ? 'Codex' : 'Hermes'}` : 'Another agent')
function Activity({ brand }) {
  const [events] = useData('listEvents', { brand_id: brand?.id || null, limit: 40 }, [brand?.id])
  if (!events) return <p className="dim small">Loading…</p>
  if (!events.length) return <p className="dim small">Nothing yet.</p>
  return <ol className="activity-list">{events.map((e) => <li key={e.id}><span className="mono small dim">{when(e.at)}</span><span className={`chip ${e.actor === 'person' ? '' : 'st-interested'}`}>{WHO(e.actor)}</span><span>{e.summary}</span></li>)}</ol>
}

function YourData() {
  return <div className="small">
    <p>IV Signal keeps everything on this PC: one database file (signal.db), the library's copies of your pictures and videos, your chats and your settings, in your user folder under <span className="mono">AppData\Roaming\IV Signal</span>.</p>
    <p className="dim">The chat sends your messages, the open page and the brand details it reads to the agent you chose (Claude Code, Codex or Hermes), under that provider's terms. Posts go to a network only when you click: by hand with Copy &amp; open, or to a connected Facebook Page, which gets the words and the picture.</p>
  </div>
}

function Agent({ notify }) {
  const setup = useAgentSetup()
  const [s, setS] = useState(null)
  useEffect(() => {
    call('appSettings').then(setS, () => {})
  }, [])
  const save = async (patch) => {
    try {
      setS(await call('saveAppSettings', patch))
    } catch (e) {
      notify(e.message)
    }
  }
  return (
    <section className="panel set">
      <p className="small dim">The chat runs on your own Claude Code, Codex or Hermes, on your own plan. It reads your Brand Brain, drafts posts and plans the calendar here. IV Signal needs no API key of its own.</p>
      <AgentRows setup={setup} notify={notify} />
      {s&&<div className="visual-guidance-setting"><label><input type="checkbox" checked={s.visualGuidanceEnabled!==false} onChange={e=>save({visualGuidanceEnabled:e.target.checked})}/><span>Let my chat agent see the IV Signal window</span></label><p className="small dim">When you ask for help, your agent can inspect this app and highlight where to go. Screenshots cover input fields and chat. Other apps are never captured.</p></div>}
      {s && (
        <div className="form-grid two">
          <label>
            <span>Chat uses</span>
            <select value={s.chatEngine || ''} onChange={(e) => save({ chatEngine: e.target.value })}>
              <option value="">Whichever is installed (Claude Code first)</option>
              <option value="claude">Claude Code</option>
              <option value="codex">Codex</option>
              <option value="hermes">Hermes</option>
            </select>
          </label>
          <label>
            <span>Claude Code model</span>
            <select value={s.claudeModel || ''} onChange={(e) => save({ claudeModel: e.target.value })}>
              <option value="">Your Claude Code default</option>
              <option value="claude-opus-5-5">Claude Opus 5.5</option>
              <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
              <option value="claude-haiku-5-5">Claude Haiku 5.5</option>
            </select>
          </label>
          <label>
            <span>Call your agent</span>
            <input defaultValue={s.agentName || ''} placeholder="e.g. Echo" onBlur={(e) => save({ agentName: e.target.value })} />
          </label>
          <label>
            <span>Your first name</span>
            <input defaultValue={s.userName || ''} onBlur={(e) => save({ userName: e.target.value })} />
          </label>
        </div>
      )}
    </section>
  )
}


function Connect({ notify }) {
  const [info, reload] = useData('agentsInfo')
  if (!info) return null
  const copy = async (text, what) => {
    await call('copyText', { text })
    notify(`${what} copied.`, 'ok')
  }
  return (
    <section className="panel set">
      <p className="small dim">The same tools work in Claude Code, Codex and Claude Desktop, on this PC’s IV Signal brands and posts.</p>
      <div className="connect-grid">
        <div className="connect-card">
          <strong>Paste into any agent</strong>
          <p className="small dim">One message that tells Claude Code, Codex or Claude Desktop how to connect.</p>
          <button className="btn" onClick={() => copy(info.paste, 'Setup message')}>Copy setup message</button>
        </div>
        <div className="connect-card">
          <strong>Claude Code skill</strong>
          <p className="small dim">{info.skillInstalled ? (info.skillCurrent ? 'Installed and up to date.' : 'Installed, but older than this version.') : 'Teaches Claude Code how to use IV Signal.'}</p>
          <button className="btn" disabled={info.skillCurrent} onClick={async () => {
            try {
              await call('installSkill')
              reload()
              notify('Skill installed for Claude Code.', 'ok')
            } catch (e) {
              notify(e.message)
            }
          }}>{info.skillInstalled ? (info.skillCurrent ? 'Skill installed' : 'Update skill') : 'Install skill'}</button>
        </div>
        <div className="connect-card">
          <strong>Claude Desktop</strong>
          <p className="small dim">Add this under “mcpServers” in claude_desktop_config.json, then restart Claude.</p>
          <div className="form-row">
            <button className="btn" onClick={() => copy(info.desktopSnippet, 'Config entry')}>Copy config entry</button>
            <button className="btn btn-quiet" onClick={() => call('openClaudeConfigFolder')}>Open folder</button>
          </div>
        </div>
      </div>
    </section>
  )
}

