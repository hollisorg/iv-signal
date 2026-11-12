import { ART } from '../art'

// A brand's look: its own cover and logo if the person added them, else IV Signal's art and the brand's initials.
export const brandCover = (brand) => brand?.art?.cover || ART.today
export function BrandMark({ brand, large = false }) {
  const initials = (brand?.name || 'Your brand').split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase()
  return <span className={`brand-mark ${large ? 'large' : ''}`} style={{ '--brand-color': brand?.profile?.accent || '#f19dac' }}>{brand?.art?.logo ? <img src={brand.art.logo} alt="" /> : <span>{initials}</span>}</span>
}
export function BrandPreview({ brand }) {
  return <div className="brand-preview" style={{ backgroundImage: `linear-gradient(0deg,#100c0ef5,transparent),url("${brandCover(brand)}")` }}><BrandMark brand={brand} large /><div><span className="eyebrow">Your brand</span><h3>{brand?.name || 'Your brand, right here.'}</h3><p>{brand?.profile?.offer || 'Everything it says, in one place.'}</p></div></div>
}
