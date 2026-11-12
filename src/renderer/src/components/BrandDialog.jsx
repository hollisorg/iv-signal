import { useEffect, useRef, useState } from 'react'
import { call } from '../api'
import { BrandPreview } from './BrandIdentity'

// Add a brand, or edit its name, basics, colour, logo and cover. Images stay on this PC.
export default function BrandDialog({ kind, brand, notify, onClose, onSaved }) {
  const dialog = useRef(null)
  const p = brand?.profile || {}
  const [name, setName] = useState(brand?.name || '')
  const [profile, setProfile] = useState({ offer: p.offer || '', audience: p.audience || '', website: p.website || '', accent: p.accent || '#f19dac', logo_id: p.logo_id || '', cover_id: p.cover_id || '' })
  const [art, setArt] = useState({ logo: brand?.art?.logo || null, cover: brand?.art?.cover || null })
  const [busy, setBusy] = useState(false)
  useEffect(() => { dialog.current.showModal() }, [])
  const change = (k, v) => setProfile((x) => ({ ...x, [k]: v }))
  const pick = async (which) => {
    try {
      const r = await call('chooseBrandImage', { kind: which })
      if (!r) return
      change(`${which}_id`, r.id)
      setArt((a) => ({ ...a, [which]: r.dataUrl }))
    } catch (e) {
      notify(e.message)
    }
  }
  const save = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const saved = kind === 'edit'
        ? await call('updateBrand', { id: brand.id, name, profile })
        : await call('createBrand', { name, profile })
      onSaved(saved)
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <dialog ref={dialog} className="workspace-dialog brand-dialog" onCancel={(e) => { e.preventDefault(); onClose() }}>
      <form onSubmit={save}>
        <span className="eyebrow">Infinite Variance / {kind === 'edit' ? 'Edit brand' : 'New brand'}</span>
        <h2>{kind === 'edit' ? brand.name : 'Add a brand'}</h2>
        <BrandPreview brand={{ name: name || brand?.name, profile, art }} />
        <div className="form-grid two">
          <label className="wide"><span>Brand name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} required autoFocus /></label>
          <label className="wide"><span>What it offers</span><textarea rows={2} value={profile.offer} onChange={(e) => change('offer', e.target.value)} maxLength={1500} placeholder="Hand-thrown stoneware mugs, made in small batches" /></label>
          <label className="wide"><span>Who it's for</span><textarea rows={2} value={profile.audience} onChange={(e) => change('audience', e.target.value)} maxLength={1500} placeholder="Coffee people who buy fewer, better things" /></label>
          <label><span>Website (optional)</span><input value={profile.website} onChange={(e) => change('website', e.target.value)} maxLength={300} placeholder="yourbrand.com" /></label>
          <label><span>Brand colour</span><input type="color" value={profile.accent} onChange={(e) => change('accent', e.target.value)} /></label>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => pick('logo')}>{art.logo ? 'Change logo' : 'Add a logo'}</button>
          <button type="button" className="btn" onClick={() => pick('cover')}>{art.cover ? 'Change cover' : 'Add a cover'}</button>
        </div>
        <p className="small dim">The voice, rules and everything else live in the Brand Brain.</p>
        <footer>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : kind === 'edit' ? 'Save' : 'Add the brand'}</button>
        </footer>
      </form>
    </dialog>
  )
}
