import { useEffect, useRef, useState } from 'react'
import { ART } from '../art'

// Which motion each page's header plays. Decorative only: it never stands for posting or a connection.
const MOTION = { today: 'ripples', brand: 'orbits', create: 'network', approve: 'review', calendar: 'network', library: 'ripples', channels: 'ripples', settings: 'orbits' }

// Decorative motion never represents a post going out or a connection status.
export default function PageStage({ kind, title, kicker, subtitle, children }) {
  const ref = useRef(null)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  const [active, setActive] = useState(!document.hidden)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(ref.current)
    const onVisibility = () => setActive(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
  return <header ref={ref} className={`page-stage stage-${kind} ${paused || !visible || !active ? 'motion-paused' : ''}`} style={{ '--stage-art': `url("${ART[kind] || ART.today}")` }}>
    <div className="page-stage-art" aria-hidden="true" />
    <svg className="stage-motion" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {MOTION[kind] === 'review' ? <g className="motion-review">{[0, 1, 2].map(i => <g key={i} transform={`translate(${95 + i * 275} ${30 + i * 12})`}><rect width="100" height="145" rx="3" /><path d="M20 32h60 M20 48h45 M20 64h60 M20 80h32" /><path className="review-tick" d="m28 113 13 13 30-32" style={{ animationDelay: `${i * 1.5}s` }} /></g>)}</g>
      : MOTION[kind] === 'ripples' ? <g className="motion-ripples">{[0, 1, 2].map(i => <circle key={i} cx="400" cy="150" r="90" style={{ animationDelay: `${i * -3}s` }} />)}<path d="M80 210Q180 20 310 110 M490 190Q620 280 730 70" /></g>
      : MOTION[kind] === 'orbits' ? <g className="motion-orbits">{[0, 1, 2].map(i => <g key={i} className="motion-orbit" style={{ animationDirection: i % 2 ? 'reverse' : 'normal', animationDuration: `${45 + i * 15}s` }}><circle cx="400" cy="150" r={85 + i * 50} strokeDasharray={i === 1 ? '3 12' : 'none'} /><circle className="motion-node" cx={485 + i * 50} cy="150" r="4" /></g>)}</g>
      : <g className="motion-network"><path d="M-20 230 120 80 260 170 400 45 560 180 700 75 830 220 M120 80 160 280 400 45 620 285 700 75 M-20 230 260 170 560 180 830 220" />{[[120,80],[260,170],[400,45],[560,180],[700,75],[160,280],[620,285]].map(([x,y],i) => <circle className="motion-node" key={i} cx={x} cy={y} r="4" style={{ animationDelay: `${i * -.8}s` }} />)}</g>}
    </svg>
    <div className="page-stage-copy"><p className="eyebrow">{kicker}</p><h1>{title}</h1><p className="stage-subtitle">{subtitle}</p>{children}</div>
    <button className="stage-motion-control" aria-label={paused ? 'Play background animation' : 'Pause background animation'} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? '▶ Motion' : 'Ⅱ Motion'}</button>
  </header>
}

export function PageMetrics({ items }) {
  return <div className="page-metrics">{items.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
}
