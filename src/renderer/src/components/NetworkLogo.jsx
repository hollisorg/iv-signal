import { siFacebook, siInstagram, siX, siThreads, siTiktok, siYoutube, siPinterest, siGoogle } from 'simple-icons'

// Network marks from Simple Icons (CC0). LinkedIn isn't in that set, so it gets a plain "in" tile drawn here.
const ICONS = { facebook: siFacebook, instagram: siInstagram, x: siX, threads: siThreads, tiktok: siTiktok, youtube: siYoutube, pinterest: siPinterest, google: siGoogle }
const LINKEDIN = '#0A66C2'

export const networkColor = (channel) => (channel === 'linkedin' ? LINKEDIN : `#${ICONS[channel]?.hex || '444444'}`)

export default function NetworkLogo({ channel, size = 44, title }) {
  const icon = ICONS[channel]
  const bg = networkColor(channel)
  const dark = bg === '#000000'
  return (
    <span className={`net-logo ${dark ? 'is-dark' : ''}`} style={{ width: size, height: size, background: dark ? '#141414' : bg }} role="img" aria-label={title || channel}>
      {icon ? (
        <svg viewBox="0 0 24 24" width={size * 0.52} height={size * 0.52} aria-hidden="true"><path d={icon.path} fill="#fff" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} aria-hidden="true"><text x="12" y="17.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="16" fill="#fff">in</text></svg>
      )}
    </span>
  )
}
