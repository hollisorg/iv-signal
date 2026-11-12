// First launch: who the person is, their brand, and where it posts. Finishing creates the brand (or updates the one
// the welcome already made) and records its networks.
import { getSetting, setSetting, tx, CHANNELS } from '../core/db.js'
import { createBrand, getBrand, updateBrand, listBrands } from '../core/brands.js'
import { saveChannel } from '../core/channels.js'

const KEY = 'iv_signal_onboarding_v1'

export function onboardingStatus(db) {
  const saved = getSetting(db, KEY, {})
  const brands = listBrands(db).length
  return { ...saved, profile: saved.profile || {}, channels: saved.channels || [], step: saved.step || 0, existingBrands: brands, showOnLaunch: !saved.completedAt && !saved.dismissedAt && brands === 0 }
}

export function cleanProfile(input = {}, { validateWebsite = true } = {}) {
  const out = {}
  for (const key of ['name', 'company', 'kind', 'offer', 'audience', 'voice', 'location', 'website', 'goal']) out[key] = String(input[key] || '').trim().slice(0, ['offer', 'audience', 'voice'].includes(key) ? 1200 : 300)
  if (out.website && validateWebsite) {
    const u = new URL(/^https?:\/\//i.test(out.website) ? out.website : `https://${out.website}`)
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || u.username || u.password) throw new Error('Enter a public website, or leave it blank.')
    out.website = u.toString()
  }
  return out
}

const cleanChannels = (list) => [...new Set((Array.isArray(list) ? list : []).filter((c) => CHANNELS[c]))]

export function saveOnboarding(db, { profile, channels, step, dismiss = false } = {}) {
  const current = getSetting(db, KEY, {})
  const next = {
    ...current,
    ...(profile ? { profile: cleanProfile(profile, { validateWebsite: false }) } : {}),
    ...(channels ? { channels: cleanChannels(channels) } : {}),
    step: Number.isInteger(step) ? Math.max(0, Math.min(5, step)) : current.step || 0,
    ...(dismiss ? { dismissedAt: new Date().toISOString() } : {}),
  }
  setSetting(db, KEY, next)
  return onboardingStatus(db)
}

export function finishOnboarding(db, { profile, channels = [] } = {}) {
  const clean = cleanProfile(profile)
  if (!clean.company || !clean.offer || !clean.audience) throw new Error('Add your brand\'s name, what you offer and who it\'s for.')
  const picked = cleanChannels(channels)
  return tx(db, () => {
    const previous = getSetting(db, KEY, {})
    const brandProfile = { offer: clean.offer, audience: clean.audience, voice: clean.voice, website: clean.website, location: clean.location, kind: clean.kind, goal: clean.goal }
    let brandId = previous.brandId && getBrand(db, previous.brandId) ? previous.brandId : null
    if (brandId) updateBrand(db, brandId, { name: clean.company, profile: brandProfile })
    else brandId = createBrand(db, { name: clean.company, profile: brandProfile }).id
    for (const channel of picked) saveChannel(db, { brand_id: brandId, channel })
    setSetting(db, KEY, { ...previous, profile: clean, channels: picked, step: 5, brandId, completedAt: new Date().toISOString() })
    return onboardingStatus(db)
  })
}
