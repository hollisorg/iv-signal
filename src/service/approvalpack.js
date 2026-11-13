// A one-file approval pack: the posts a client should review, as a page they can open anywhere (email it, drop it in
// a chat). Each version shows the network, the planned time, the words and its pictures. The client replies with
// what they approve; the person approves in IV Signal. Nothing in the file calls home.
import { CHANNELS } from '../core/db.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const when = (iso, tz) => (iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(tz ? { timeZone: tz, timeZoneName: 'short' } : {}) }) : 'Any time')

// thumb(media) -> data URL or null (the caller makes small JPEGs).
export function approvalPackHtml({ brand, posts, note = '', from = '', timezone = '', thumb = () => null }) {
  const accent = /^#[0-9a-f]{6}$/i.test(brand.profile?.accent || '') ? brand.profile.accent : '#f44859'
  const made = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const cards = posts.map((p, i) => `
  <section class="post">
    <header><span class="n">${String(i + 1).padStart(2, '0')}</span><h2>${esc(p.title)}</h2>${p.campaign_name ? `<span class="tag">${esc(p.campaign_name)}</span>` : ''}</header>
    ${p.variants.filter((v) => v.status !== 'skipped').map((v) => `
    <article>
      <p class="meta"><b>${esc(CHANNELS[v.channel].name)}</b> · ${esc(when(v.planned_for, timezone))}</p>
      <p class="text">${esc(v.text).replace(/\n/g, '<br>')}</p>
      ${v.media.length ? `<div class="media">${v.media.map((m) => { const src = m.kind === 'image' ? thumb(m) : null; return src ? `<figure><img src="${src}" alt="${esc(m.alt_text || '')}"><figcaption>${esc(m.alt_text || m.name)}</figcaption></figure>` : `<figure class="file"><span>${m.kind === 'video' ? '▶ Video' : 'Picture'}</span><figcaption>${esc(m.name)}</figcaption></figure>` }).join('')}</div>` : ''}
    </article>`).join('')}
    <footer>To approve, reply with “Approve ${String(i + 1).padStart(2, '0')}”, or say what to change.</footer>
  </section>`).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(brand.name)}: posts for your approval</title>
<style>
:root{--accent:${accent}}*{box-sizing:border-box}body{margin:0;background:#f4f1ea;color:#1c1719;font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:40px 20px 80px}.top{border-bottom:3px solid var(--accent);padding-bottom:18px;margin-bottom:26px}
.top small{letter-spacing:.12em;text-transform:uppercase;color:#7a6c72;font-size:12px}.top h1{margin:6px 0 8px;font-size:34px;line-height:1.05}
.note{background:#fff;border-left:3px solid var(--accent);padding:12px 16px;margin:16px 0 0;white-space:pre-wrap}
.post{background:#fff;border:1px solid #e3ddd2;margin:0 0 22px;padding:20px}.post header{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.n{font-weight:800;color:var(--accent)}.post h2{margin:0;font-size:21px;flex:1}.tag{font-size:12px;background:#f4f1ea;padding:2px 8px}
article{border-top:1px solid #eee7dc;padding:14px 0 4px}.meta{margin:0 0 6px;font-size:13px;color:#5d5056}.text{margin:0 0 10px}
.media{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;width:180px}figure img{width:180px;height:180px;object-fit:cover;display:block;border:1px solid #e3ddd2}
figure.file span{display:grid;place-items:center;width:180px;height:100px;background:#f4f1ea;color:#5d5056}figcaption{font-size:12px;color:#7a6c72;margin-top:4px}
.post footer{margin-top:10px;font-size:13px;color:#5d5056;border-top:1px dashed #e3ddd2;padding-top:10px}.end{font-size:12px;color:#7a6c72;margin-top:30px}
@media print{body{background:#fff}.post{break-inside:avoid}}
</style></head><body><div class="wrap">
<div class="top"><small>${esc(brand.name)} · for your approval · ${esc(made)}</small><h1>${posts.length} post${posts.length === 1 ? '' : 's'} to review</h1>
${from ? `<div>From ${esc(from)}</div>` : ''}${note ? `<p class="note">${esc(note)}</p>` : ''}</div>
${cards}
<p class="end">Times are ${esc(timezone || 'local time')}. Nothing has been posted yet. Made with IV Signal.</p>
</div></body></html>`
}
