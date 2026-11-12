import { useEffect,useLayoutEffect,useRef,useState } from 'react'
import { createPortal } from 'react-dom'
import { call,on } from '../api'
import { PLACES } from '../guides'
export default function GuideHost({go,notify,modalOpen}) {
  const [tour,setTour]=useState(null),[index,setIndex]=useState(0),[rect,setRect]=useState(null),[position,setPosition]=useState(null),[missing,setMissing]=useState(false)
  const card=useRef(null),target=useRef(null),previousFocus=useRef(null)
  const close=()=>{setTour(null);setRect(null);previousFocus.current?.isConnected&&previousFocus.current.focus({preventScroll:true})}
  useEffect(()=>{
    const open=payload=>{
      if(modalOpen){if(payload.requestId)call('uiGuideReady',{requestId:payload.requestId,error:'A setup dialog is open. Ask the person to finish or close it first.'});else notify('Finish or close the setup window, then start the guide.');return}
      const steps=(payload.steps||[payload.place]).filter(id=>PLACES[id]);if(!steps.length)return
      previousFocus.current=document.activeElement;setIndex(0);setTour({...payload,steps});setPosition(null)
    }
    const listener=e=>open(e.detail)
    window.addEventListener('iv:guide',listener);const off=on('ui:guide',open)
    return()=>{window.removeEventListener('iv:guide',listener);off()}
  },[modalOpen])
  const id=tour?.steps[index],step=PLACES[id]
  useEffect(()=>{
    if(!step)return
    setRect(null);setPosition(null);setMissing(false);target.current=null;go(step.page)
    let stopped=false,timer,frame;const began=Date.now()
    const seek=()=>{
      if(stopped)return
      const el=document.querySelector(step.selector)|| (step.fallback&&document.querySelector(step.fallback))
      if(el&&el.getBoundingClientRect().height>0){
        target.current=el;el.scrollIntoView({block:'center',behavior:'instant'})
        frame=requestAnimationFrame(()=>{if(stopped)return;card.current?.focus();if(tour.requestId)call('uiGuideReady',{requestId:tour.requestId,place:id,found:true}).catch(()=>{})})
      }else if(Date.now()-began<2500)timer=setTimeout(seek,75)
      else {setMissing(true);if(tour.requestId)call('uiGuideReady',{requestId:tour.requestId,place:id,found:false}).catch(()=>{})}
    }
    timer=setTimeout(seek,30)
    return()=>{stopped=true;clearTimeout(timer);cancelAnimationFrame(frame)}
  },[tour,index])
  useEffect(()=>{
    if(!tour)return;let raf
    const tick=()=>{const el=target.current;if(el?.isConnected){const r=el.getBoundingClientRect(),top=Math.max(44,r.top),bottom=Math.min(innerHeight-12,r.bottom);const next={left:Math.max(8,r.left-5),top:top-5,width:Math.min(innerWidth-16,r.width+10),height:Math.max(20,bottom-top+10)};setRect(old=>JSON.stringify(old)===JSON.stringify(next)?old:next)}raf=requestAnimationFrame(tick)}
    raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)
  },[tour,index])
  useLayoutEffect(()=>{
    if(!tour||!card.current)return
    const w=card.current.offsetWidth,h=card.current.offsetHeight
    let left=rect?rect.left:(innerWidth-w)/2,top=rect?rect.top+rect.height+14:(innerHeight-h)/2
    if(top+h>innerHeight-16)top=rect&&rect.top-h-14>48?rect.top-h-14:innerHeight-h-16
    setPosition({left:Math.max(12,Math.min(innerWidth-w-12,left)),top:Math.max(48,top)})
  },[rect,tour,index,missing])
  useEffect(()=>{
    if(!tour)return
    const key=e=>{if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='ArrowRight'){e.preventDefault();if(index<tour.steps.length-1)setIndex(index+1)}else if(e.key==='ArrowLeft'){e.preventDefault();setIndex(Math.max(0,index-1))}else if(e.key==='Tab'){const buttons=[...card.current.querySelectorAll('button:not(:disabled)')];const at=buttons.indexOf(document.activeElement);e.preventDefault();buttons[(at+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus()}}
    document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true)
  },[tour,index])
  if(!tour||!step)return null
  return createPortal(<div className="guide-host"><div className="guide-blocker" onClick={close}/>{rect&&<div className="guide-spot" style={rect}/>}<section className="guide-card" role="dialog" aria-modal="true" aria-label="How this works" ref={card} tabIndex={-1} style={position||{left:20,top:60,visibility:'hidden'}}><header><span className="eyebrow">{tour.requestId?'Your agent is showing you':`How this works / ${index+1} of ${tour.steps.length}`}</span><button className="icon-btn" aria-label="Close guide" onClick={close}>×</button></header><h2>{step.title}</h2><p>{tour.say||step.text}</p>{missing&&<p className="small dim">This part is not visible yet. Choose a business and outreach plan to get started.</p>}<footer><button className="btn btn-quiet" onClick={close}>Close</button><div>{index>0&&<button className="btn" onClick={()=>setIndex(index-1)}>Back</button>}<button className="btn primary" onClick={()=>index===tour.steps.length-1?close():setIndex(index+1)}>{index===tour.steps.length-1?'Got it':'Next →'}</button></div></footer></section></div>,document.body)
}
