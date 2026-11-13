import { useEffect, useRef, useState } from 'react'
import { call, CHANNELS } from '../api'
import { AgentRows, useAgentSetup } from './AgentSetup'
import PageStage from './PageStage'

const STEPS = ['Welcome', 'Your brand', 'Your voice', 'Your agent', 'Your networks', 'Ready']
const TITLES = ['Say it once. Say it well.', 'What’s the brand?', 'How does it sound?', 'Meet your writing partner.', 'Where does it post?', 'A clear place to start.']
const ART = ['today', 'brand', 'brand', 'settings', 'channels', 'create']
const TYPES = ['Product brand', 'Service business', 'Creator / personal brand', 'Agency (for a client)', 'Local business', 'Something else']

export default function Onboarding({ initial, notify, onClose, onFinish }) {
  const [step, setStep] = useState(initial.completedAt ? 0 : initial.step || 0)
  const [profile, setProfile] = useState({ kind: 'Product brand', ...initial.profile })
  const [channels, setChannels] = useState(initial.channels?.length ? initial.channels : ['instagram', 'facebook', 'linkedin'])
  const [engine, setEngine] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setup = useAgentSetup()
  const dialog = useRef(null), scroll = useRef(null), heading = useRef(null)
  const change = (key, value) => setProfile((p) => ({ ...p, [key]: value }))
  const valid = profile.company?.trim() && profile.offer?.trim() && profile.audience?.trim()
  useEffect(() => {
    dialog.current.showModal()
    call('appSettings').then((s) => setEngine(s.chatEngine || ''), (e) => setError(e.message))
  }, [])
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [step])
  const run = async (fn) => { if (busy) return; setBusy(true); setError(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) } }
  const save = (next, dismiss = false) => call('onboardingSave', { profile, channels, step: next, dismiss })
  const move = (next) => run(async () => { await save(next); if (step === 3) await call('saveAppSettings', { chatEngine: engine }); setStep(next) })
  const skip = () => run(async () => { await save(step, true); onClose() })
  const finish = (target) => run(async () => { await call('saveAppSettings', { chatEngine: engine }); const result = await call('onboardingFinish', { profile, channels }); onFinish(result, target) })
  const toggle = (c) => setChannels(channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c])
  return <dialog ref={dialog} className="onboarding" aria-label="Welcome to IV Signal" onCancel={(e) => { e.preventDefault(); skip() }}>
    <div className="onboarding-top"><span className="eyebrow">Infinite Variance / Guided setup</span><button className="btn btn-quiet" disabled={busy} onClick={skip}>Save & close ×</button></div>
    <div className="onboarding-scroll" ref={scroll}>
      <div className="onboarding-art"><PageStage key={step} kind={ART[step]} title={step === 0 ? 'Welcome to IV Signal' : STEPS[step]} kicker={`Step ${step + 1} / ${STEPS.length}`} subtitle={TITLES[step]} /></div>
      <ol className="onboarding-steps" aria-label="Setup progress">{STEPS.map((label, i) => <li key={label} className={i === step ? 'on' : ''}><button disabled={busy || i > step} aria-current={i === step ? 'step' : undefined} onClick={() => move(i)}><b>{i < step ? '✓' : i + 1}</b><span>{label}</span></button></li>)}</ol>
      <section className="onboarding-body" key={step}>
        <h2 ref={heading} tabIndex={-1}>{TITLES[step]}</h2>
        {step === 0 && <><p className="onboarding-lede">A little about your brand. Your own AI agent. Then a week of posts in your voice, ready for your OK.</p><div className="onboarding-pillars"><article><b>01 / Remember</b><h3>Know the brand.</h3><p>Voice, offer, audience and the things you never say, kept in a Brand Brain.</p></article><article><b>02 / Create</b><h3>Write it once.</h3><p>One idea becomes a version for each network, within each one’s limits.</p></article><article><b>03 / Approve</b><h3>Give the OK.</h3><p>Nothing goes out without you. Edit anything and it needs approving again.</p></article></div><p className="onboarding-note">Your brands, posts and pictures stay on this PC. The chat runs on your own Claude Code, Codex or Hermes. No IV account needed.</p></>}
        {step === 1 && <><p className="onboarding-lede">This starts your Brand Brain. You and the chat can add to it any time.</p><div className="onboarding-types" role="group" aria-label="Kind of brand">{TYPES.map((type) => <button className={profile.kind === type ? 'on' : ''} aria-pressed={profile.kind === type} key={type} onClick={() => change('kind', type)}>{type}</button>)}</div><div className="form-grid two">
          <label><span>Your first name (optional)</span><input value={profile.name || ''} onChange={(e) => change('name', e.target.value)} maxLength={80} autoComplete="given-name" /></label>
          <label><span>Brand name</span><input value={profile.company || ''} onChange={(e) => change('company', e.target.value)} maxLength={150} autoComplete="organization" required /></label>
          <label className="wide"><span>What does it offer?</span><textarea rows={2} value={profile.offer || ''} onChange={(e) => change('offer', e.target.value)} placeholder="Hand-thrown stoneware mugs, made in small batches" maxLength={1200} required /></label>
          <label className="wide"><span>Who is it for?</span><textarea rows={2} value={profile.audience || ''} onChange={(e) => change('audience', e.target.value)} placeholder="Coffee people who buy fewer, better things" maxLength={1200} required /></label>
          <label><span>Where is it? (optional)</span><input value={profile.location || ''} onChange={(e) => change('location', e.target.value)} placeholder="Columbus, Ohio" maxLength={200} /></label>
          <label><span>Website (optional)</span><input value={profile.website || ''} onChange={(e) => change('website', e.target.value)} placeholder="yourbrand.com" maxLength={300} /></label>
        </div></>}
        {step === 2 && <><p className="onboarding-lede">A sentence or two is plenty. The chat can interview you for more later.</p><div className="form-grid two">
          <label className="wide"><span>How it sounds</span><textarea rows={3} value={profile.voice || ''} onChange={(e) => change('voice', e.target.value)} placeholder="Warm, plain, a little dry. Short sentences. No hype, no exclamation marks." maxLength={1200} /></label>
          <label className="wide"><span>What it wants from social (optional)</span><input value={profile.goal || ''} onChange={(e) => change('goal', e.target.value)} placeholder="More newsletter sign-ups and first orders" maxLength={300} /></label>
        </div><p className="onboarding-note">Things your brand must never claim go in the Brand Brain’s Never say list. Drafts that say one can’t be approved.</p></>}
        {step === 3 && <><p className="onboarding-lede">Use an agent you already have, or install one with its official installer. Sign-in happens with the provider.</p><AgentRows setup={setup} notify={(message) => { setError(message); notify?.(message) }} /><label className="onboarding-agent-choice"><span>Preferred chat agent</span><select value={engine} onChange={(e) => setEngine(e.target.value)}><option value="">Use an installed agent automatically</option>{['claude', 'codex', 'hermes'].filter((id) => setup?.[id]?.installed).map((id) => <option key={id} value={id}>{id === 'claude' ? 'Claude Code' : id === 'codex' ? 'Codex' : 'Hermes'}</option>)}</select></label><p className="onboarding-note">No API key needed. Your agent plan’s limits apply. You can finish setup before signing in.</p></>}
        {step === 4 && <><p className="onboarding-lede">Pick the networks this brand posts to. You can add the account links later.</p><div className="onboarding-types" role="group" aria-label="Networks">{Object.entries(CHANNELS).map(([c, name]) => <button key={c} className={channels.includes(c) ? 'on' : ''} aria-pressed={channels.includes(c)} onClick={() => toggle(c)}>{name}</button>)}</div><div className="onboarding-rules"><article><b>Posting by hand, for now</b><p>When an approved post’s time comes, IV Signal copies the words and opens the network. You paste, post and mark it posted.</p></article><article><b>Direct publishing</b><p>Facebook Pages can post straight from IV Signal now (Networks page). The others follow once each network approves the app. Nothing changes in how you approve.</p></article></div></>}
        {step === 5 && <><p className="onboarding-lede">Save your brand and choose where to begin. Nothing is written or posted by finishing setup.</p><dl className="onboarding-summary"><div><dt>Brand</dt><dd>{profile.company || 'Not added yet'}</dd></div><div><dt>Offer</dt><dd>{profile.offer || 'Not added yet'}</dd></div><div><dt>Audience</dt><dd>{profile.audience || 'Not added yet'}</dd></div><div><dt>Networks</dt><dd>{channels.map((c) => CHANNELS[c]).join(', ') || 'None yet'}</dd></div></dl>{!valid && <p className="bad">Go back to Your brand and add its name, what it offers and who it’s for.</p>}<p className="onboarding-note">You can reopen this guide from Settings → Open guided setup.</p></>}
      </section>
    </div>
    {error && <p className="onboarding-error" role="alert">{error}</p>}
    <footer className="onboarding-footer"><span className="mono small">{step + 1} of {STEPS.length} · Stays on this PC</span><div>{step > 0 && <button className="btn" disabled={busy} onClick={() => move(step - 1)}>← Back</button>}{step < 5 ? <button className="btn btn-primary" disabled={busy || (step === 1 && !valid)} onClick={() => move(step + 1)}>{busy ? 'Saving…' : step === 0 ? 'Let’s get started →' : 'Continue →'}</button> : <><button className="btn" disabled={busy || !valid} onClick={() => finish('brand')}>Finish & open the Brand Brain</button><button className="btn btn-primary" disabled={busy || !valid} onClick={() => finish('today')}>{busy ? 'Saving…' : 'Save & start →'}</button></>}</div></footer>
  </dialog>
}
