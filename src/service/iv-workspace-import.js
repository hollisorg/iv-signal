import * as sg from '../core/index.js'
import { briefText } from './iv-workspace.js'

export function receiveSignal(h, workspace, db, brandId, dataDir) {
  const key = `iv-workspace-receipt:${h.id}`, old = sg.getSetting(db, key)
  if (old) {
    if (!sg.getPost(db, old.id)) throw Error('This imported draft was removed. Create a new handoff to start again.')
    return old
  }
  // Imported copies are content-addressed; a rolled-back import can reuse them safely.
  return sg.tx(db, () => {
    const again = sg.getSetting(db, key); if (again) return again
    const media = h.assets.map(id => sg.importMedia(db, { brand_id: brandId, path: workspace.assetPath(id), name: workspace.asset(id).name, actor: 'person' }, { dataDir }))
    const campaign = h.brief.campaign ? sg.createCampaign(db, { brand_id: brandId, name: h.brief.campaign, goal: h.brief.goal, actor: 'person' }) : null
    const channel = String(h.brief.channel || '').toLowerCase()
    // Unknown channels (e.g. Email/Website) remain an idea with no network version.
    const variants = sg.CHANNELS[channel] ? [{ channel, text: h.brief.caption || '', media_ids: media.map(m => m.id) }] : []
    const post = sg.createPost(db, { brand_id: brandId, campaign_id: campaign?.id, title: h.brief.title, idea: briefText(h, workspace.brand(h.brandId)), variants, actor: 'person' })
    const receipt = { kind: 'post', id: post.id, localId: brandId, brandId: h.brandId }
    sg.setSetting(db, key, receipt)
    sg.setSetting(db, `iv-workspace-context:${post.id}`, { handoffId: h.id, brandId: h.brandId, brief: h.brief })
    return receipt
  })
}
