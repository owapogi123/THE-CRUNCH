import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, useScroll, useTransform, useInView } from 'framer-motion'
import { Search, Flame, Crown, Clock, ChevronDown, Droplets, MapPin, Star, X, CalendarDays, MessageSquare, Send, CheckCircle } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

// ── Constants ──────────────────────────────────────────────────────────────
const NAV_H = 64
const BANNER_H = 40
const TAB_TOP = NAV_H + BANNER_H
const PLACEHOLDER = '/placeholder.jpg'
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CATEGORIES = ['All', 'Chicken', 'Sides', 'Drinks', 'Combos'] as const
type Category = typeof CATEGORIES[number]

const BADGE_CFG: Record<string, { bg: string; dark?: boolean }> = {
  Bestseller: { bg: '#f5c842', dark: true },
  Hot:        { bg: '#ef4444' },
  New:        { bg: '#8b5cf6' },
  'Fan Fave': { bg: '#16a34a' },
  'Best Value':{ bg: '#0284c7' },
  'Must Try': { bg: '#7c3aed' },
}

// ── Types ──────────────────────────────────────────────────────────────────
interface Product { id:number; name:string; menuName:string; category:Category; rating:number; badge:string; description:string; price:number; spicy:boolean; img:string; isDrink?:boolean }
interface FlavorItem { name:string; accent:string; desc:string; img:string }
interface MenuItem { name:string; price:number; tag?:string; note?:string; img?:string }
interface MenuSection { id:string; title:string; subtext?:string; pills?:{label:string;spicy:boolean}[]; items:MenuItem[]; isDrink?:boolean }
interface Promo { id:string; title:string; subtitle?:string; description:string; img:string; badge?:string; badgeColor?:string; eventDate?:string; validUntil?:string; tag?:string; highlight?:boolean; discount?:string }
interface FeedbackPayload { product_id:number; customer_user_id:number|null; rating:number; comment:string }
interface FeedbackProductOption { id:number; name:string }

// ── Helpers ────────────────────────────────────────────────────────────────
const getCountdown = (d: string) => {
  const diff = new Date(d).getTime() - Date.now()
  if (diff <= 0) return null
  const days = Math.floor(diff / 86400000)
  const hrs  = Math.floor((diff % 86400000) / 3600000)
  if (days > 30) return null
  return days > 0 ? `${days}d ${hrs}h left` : `${hrs}h left`
}
const fmtDate = (d: string) => {
  const dt = new Date(d)
  return { day: String(dt.getDate()).padStart(2,'0'), month: MONTH_LABELS[dt.getMonth()] }
}

// ── Global Styles ──────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  :root {
    --gold: #f5c842; --gold-dim: rgba(245,200,66,0.12); --gold-border: rgba(245,200,66,0.18);
    --bg: #080705; --surface: rgba(255,255,255,0.03); --border: rgba(255,255,255,0.07);
    --text: #f0ede8; --text-muted: rgba(240,237,232,0.38); --text-dim: rgba(240,237,232,0.18);
    --serif: 'Poppins', sans-serif;
    --sans: 'Poppins', sans-serif;
    --radius: 20px; --pad: clamp(16px,4vw,56px);
  }
  .g2 { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:20px; }
  .g2m { display:grid; grid-template-columns:repeat(2,1fr); gap:18px; }
  .gp  { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:18px; }
  .gf  { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
  @media(max-width:640px)  { .g2,.gp { grid-template-columns:1fr; gap:14px; } .gf { grid-template-columns:1fr 1fr; } }
  @media(max-width:860px)  { .g2m { grid-template-columns:1fr; } }
  @media(max-width:768px)  { .dn768 { display:none!important; } .df768 { display:flex!important; } }
  .tabs-row { display:flex; overflow-x:auto; scrollbar-width:none; }
  .tabs-row::-webkit-scrollbar { display:none; }
  .pad { padding-left:var(--pad); padding-right:var(--pad); max-width:1320px; margin:0 auto; width:100%; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.3} }
`

// ── Primitives ─────────────────────────────────────────────────────────────
const GoldLine = () => (
  <div style={{ width:32, height:1, background:'linear-gradient(90deg,var(--gold),transparent)', flexShrink:0 }} />
)

const EyebrowLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
    <GoldLine />
    <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.3em', textTransform:'uppercase', color:'var(--gold)', fontFamily:'var(--sans)' }}>
      {children}
    </span>
  </div>
)

const SectionTitle = ({ children, style={} }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <h2 style={{ fontFamily:'var(--serif)', fontSize:'clamp(32px,4vw,56px)', fontWeight:700, color:'var(--text)', letterSpacing:'-0.01em', lineHeight:1.05, ...style }}>
    {children}
  </h2>
)

function Shimmer({ style={} }: { style?: React.CSSProperties }) {
  return (
    <motion.div
      animate={{ x:['-100%','200%'] }}
      transition={{ duration:1.8, repeat:Infinity, ease:'easeInOut', repeatDelay:.5 }}
      style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,transparent,rgba(245,200,66,0.06),transparent)', ...style }}
    />
  )
}

function Skeleton({ style={} }: { style?: React.CSSProperties }) {
  return (
    <div style={{ borderRadius:'var(--radius)', background:'var(--surface)', border:'1px solid var(--border)', overflow:'hidden', position:'relative', ...style }}>
      <Shimmer />
    </div>
  )
}

function Reveal({ children, custom=0, style={} }: { children:React.ReactNode; custom?:number; style?:React.CSSProperties }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once:false, margin:'-80px', amount: 0 })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity:0, y:40 }}
      animate={inView ? { opacity:1, y:0 } : { opacity:0, y:40 }}
      transition={{ delay: inView ? custom*0.08 : 0, duration:0.65, ease:[0.22,1,0.36,1] }}
      style={style}
    >
      {children}
    </motion.div>
  )
}

// ── Image with loading state ───────────────────────────────────────────────
function Img({ src, alt, style={}, cover=true }: { src:string; alt:string; style?:React.CSSProperties; cover?:boolean }) {
  const [loaded, setLoaded] = useState(false)
  const [err, setErr]       = useState(false)
  return (
    <div style={{ position:'relative', width:'100%', height:'100%', overflow:'hidden' }}>
      {!loaded && <div style={{ position:'absolute', inset:0, background:'#100e0a' }}><Shimmer /></div>}
      <img src={err ? PLACEHOLDER : src} alt={alt} onLoad={() => setLoaded(true)} onError={() => { setErr(true); setLoaded(true) }}
        style={{ width:'100%', height:'100%', objectFit:cover?'cover':'contain', display:'block', opacity:loaded?1:0, transition:'opacity .5s', ...style }} />
    </div>
  )
}

// ── Product Card (glassmorphism) ───────────────────────────────────────────
function ProductCard({ product:p, index, onOrder }: { product:Product; index:number; onOrder:()=>void }) {
  const [hov, setHov] = useState(false)
  const ref = useRef(null)
  const inView = useInView(ref, { once:false, margin:'-60px', amount: 0 })
  const badge = BADGE_CFG[p.badge]
  const isDrink = !!p.isDrink
  const accent = isDrink ? 'rgba(99,179,237,' : 'rgba(245,200,66,'

  return (
    <motion.article
      ref={ref}
      initial={{ opacity:0, y:36 }}
      animate={inView ? { opacity:1, y:hov ? -6 : 0 } : { opacity:0, y:36 }}
      transition={{ delay: inView ? index*0.06 : 0, duration:0.6, ease:[0.22,1,0.36,1] }}
      onHoverStart={() => setHov(true)} onHoverEnd={() => setHov(false)}
      style={{
        borderRadius:24, overflow:'hidden', position:'relative',
        background:'rgba(12,10,7,0.7)',
        backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)',
        border:`1px solid ${hov ? `${accent}0.28)` : 'var(--border)'}`,
        boxShadow: hov ? `0 32px 64px rgba(0,0,0,0.7), 0 0 0 1px ${accent}0.12), inset 0 1px 0 ${accent}0.08)` : '0 4px 24px rgba(0,0,0,0.4)',
        transition:'border-color .3s, box-shadow .3s',
        cursor:'default',
      }}
    >
      {/* top shimmer line */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:1, zIndex:3,
        background: hov ? `linear-gradient(90deg,transparent,${accent}0.5),transparent)` : 'linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)',
        transition:'background .35s' }} />

      {/* Image */}
      <div style={{ position:'relative', aspectRatio:'4/3', overflow:'hidden' }}>
        <motion.div style={{ position:'absolute', inset:0 }} animate={{ scale: hov ? 1.06 : 1 }} transition={{ duration:.7, ease:[0.22,1,0.36,1] }}>
          <Img src={p.img || PLACEHOLDER} alt={p.name} />
        </motion.div>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom,transparent 45%,rgba(6,5,3,0.9))' }} />
        <AnimatePresence>
          {hov && <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{ position:'absolute', inset:0, background:`linear-gradient(135deg,${accent}0.1),transparent)` }} />}
        </AnimatePresence>

        {badge && <span style={{ position:'absolute', top:14, left:14, zIndex:2, background:badge.bg, color:badge.dark?'#111':'#fff', fontSize:9, fontWeight:700, padding:'3px 11px', borderRadius:999, letterSpacing:'0.06em', textTransform:'uppercase', boxShadow:`0 4px 14px ${badge.bg}55` }}>{p.badge}</span>}
        {p.spicy && (
          <motion.div animate={{ rotate: hov ? [0,-10,10,0] : 0 }} transition={{ duration:.4 }}
            style={{ position:'absolute', top:14, right:14, zIndex:2, background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'50%', width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Flame size={13} color="#ef4444" />
          </motion.div>
        )}
        {p.rating > 0 && (
          <div style={{ position:'absolute', bottom:12, left:14, zIndex:2, display:'flex', alignItems:'center', gap:4, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(10px)', border:'1px solid var(--gold-border)', borderRadius:999, padding:'3px 9px' }}>
            <Star size={9} color="var(--gold)" fill="var(--gold)" />
            <span style={{ fontSize:11, fontWeight:600, color:'var(--gold)', fontFamily:'var(--sans)' }}>{p.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding:'16px 20px 20px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:6 }}>
          <h3 style={{ fontFamily:'var(--serif)', fontSize:20, fontWeight:700, color:'var(--text)', lineHeight:1.2, letterSpacing:'-0.01em' }}>{p.name}</h3>
          <span style={{ fontSize:9, fontWeight:600, padding:'3px 9px', borderRadius:999, background:'var(--surface)', color:'var(--text-dim)', border:'1px solid var(--border)', whiteSpace:'nowrap', marginTop:3, fontFamily:'var(--sans)' }}>{p.category}</span>
        </div>
        <p style={{ fontSize:12.5, color:'var(--text-muted)', lineHeight:1.7, fontFamily:'var(--sans)', fontWeight:300, marginBottom:14 }}>{p.description}</p>

        {isDrink && (
          <div style={{ display:'flex', gap:6, marginBottom:14 }}>
            {[{s:'16oz',p:50},{s:'22oz',p:60}].map(sz => (
              <span key={sz.s} style={{ fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:999, background:'rgba(99,179,237,0.07)', color:'#93c5fd', border:'1px solid rgba(99,179,237,0.16)', fontFamily:'var(--sans)' }}>{sz.s} — ₱{sz.p}</span>
            ))}
          </div>
        )}

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          {!isDrink
            ? <span style={{ fontFamily:'var(--serif)', fontSize:24, fontWeight:700, color:'var(--gold)' }}>₱{p.price}</span>
            : <div />}
          <motion.button
            whileHover={{ scale:1.05 }} whileTap={{ scale:.95 }}
            onClick={(e) => { e.stopPropagation(); onOrder() }}
            style={{ background: isDrink ? 'rgba(99,179,237,0.1)' : 'var(--gold)', color: isDrink ? '#93c5fd' : '#111', border: isDrink ? '1px solid rgba(99,179,237,0.25)' : 'none', borderRadius:12, padding:'9px 22px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--sans)', letterSpacing:'0.03em' }}>
            Order
          </motion.button>
        </div>
      </div>
    </motion.article>
  )
}

// ── Menu Row ───────────────────────────────────────────────────────────────
function MenuRow({ item, index }: { item:MenuItem; index:number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once:false, margin:'-30px', amount: 0 })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity:0, x:-8 }}
      animate={inView ? { opacity:1, x:0 } : { opacity:0, x:-8 }}
      transition={{ delay: inView ? index*.04 : 0, duration:.4, ease:[0.22,1,0.36,1] }}
      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      {item.img && (
        <div style={{ width:46, height:46, borderRadius:10, overflow:'hidden', flexShrink:0, border:'1px solid var(--border)' }}>
          <Img src={item.img} alt={item.name} />
        </div>
      )}
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', minWidth:0 }}>
        <span style={{ fontSize:13, color:'var(--text-muted)', fontFamily:'var(--sans)', fontWeight:400 }}>{item.name}</span>
        {item.tag && <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:999, background:'var(--gold-dim)', color:'var(--gold)', border:'1px solid var(--gold-border)', letterSpacing:'0.07em', textTransform:'uppercase', fontFamily:'var(--sans)' }}>{item.tag}</span>}
      </div>
      <span style={{ fontSize:13.5, fontWeight:700, color:'var(--gold)', flexShrink:0, fontFamily:'var(--serif)' }}>₱{item.price}</span>
    </motion.div>
  )
}

// ── Full Menu Card ─────────────────────────────────────────────────────────
function MenuCard({ section, delay }: { section:MenuSection; delay:number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once:false, margin:'-60px', amount: 0 })
  const isDrink = !!section.isDrink
  return (
    <motion.div
      ref={ref}
      initial={{ opacity:0, y:24 }}
      animate={inView ? { opacity:1, y:0 } : { opacity:0, y:24 }}
      transition={{ duration:.6, delay: inView ? delay : 0 }}
      style={{ borderRadius:24, background: isDrink ? 'rgba(99,179,237,0.03)' : 'var(--surface)', border:`1px solid ${isDrink ? 'rgba(147,210,255,0.1)' : 'var(--border)'}`, padding:'clamp(18px,2.5vw,28px)', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:24, right:24, height:1, background: isDrink ? 'linear-gradient(90deg,transparent,rgba(147,210,255,0.25),transparent)' : 'linear-gradient(90deg,transparent,rgba(245,200,66,0.2),transparent)' }} />

      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
        {isDrink && <Droplets size={14} color="#93c5fd" />}
        <h3 style={{ fontFamily:'var(--serif)', fontSize:20, fontWeight:700, color:'var(--text)' }}>{section.title}</h3>
        <div style={{ flex:1, height:1, background:'var(--border)' }} />
      </div>

      {section.subtext && <p style={{ fontSize:11, color:'var(--text-dim)', marginBottom:12, fontStyle:'italic', fontFamily:'var(--sans)' }}>{section.subtext}</p>}

      {section.pills && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
          {section.pills.map(opt => (
            <span key={opt.label} style={{ fontSize:10.5, fontWeight:600, padding:'3px 10px', borderRadius:999, background: opt.spicy ? 'rgba(239,68,68,0.08)' : 'var(--surface)', border:`1px solid ${opt.spicy ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`, color: opt.spicy ? '#ef4444' : 'var(--text-muted)', fontFamily:'var(--sans)' }}>{opt.label}</span>
          ))}
        </div>
      )}

      {isDrink && (
        <div style={{ display:'flex', gap:6, marginBottom:12 }}>
          {[{l:'16oz',p:'₱50'},{l:'22oz',p:'₱60'}].map(s => (
            <div key={s.l} style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(99,179,237,0.07)', border:'1px solid rgba(147,210,255,0.15)', borderRadius:999, padding:'4px 10px' }}>
              <Droplets size={9} color="#93c5fd" />
              <span style={{ fontSize:11, fontWeight:600, color:'#93c5fd', fontFamily:'var(--sans)' }}>{s.l}</span>
              <span style={{ fontSize:11, color:'var(--text-dim)', fontFamily:'var(--sans)' }}>{s.p}</span>
            </div>
          ))}
        </div>
      )}

      {section.items.map((item, idx) => <MenuRow key={`${item.name}-${idx}`} item={item} index={idx} />)}
    </motion.div>
  )
}

// ── Flavor Card ────────────────────────────────────────────────────────────
function FlavorCard({ flavor, index, expanded, onToggle }: { flavor:FlavorItem; index:number; expanded:boolean; onToggle:()=>void }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once:false, margin:'-40px', amount: 0 })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity:0, y:16 }}
      animate={inView ? { opacity:1, y:0 } : { opacity:0, y:16 }}
      transition={{ delay: inView ? index*.05 : 0, duration:.45 }}
      style={{ gridColumn: expanded ? 'span 2' : 'span 1' }}>
      <motion.button onClick={onToggle} whileHover={{ scale:1.02 }} whileTap={{ scale:.97 }}
        style={{ width:'100%', background: expanded ? `${flavor.accent}14` : 'var(--surface)', border:`1.5px solid ${expanded ? flavor.accent : 'var(--border)'}`, borderRadius: expanded ? '14px 14px 0 0' : 14, padding:'13px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', fontFamily:'var(--sans)', boxShadow: expanded ? `0 0 24px ${flavor.accent}18` : 'none', transition:'all .25s' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{flavor.name}</span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration:.25 }}>
          <ChevronDown size={14} color={expanded ? flavor.accent : 'var(--text-dim)'} />
        </motion.div>
      </motion.button>
      <AnimatePresence>
        {expanded && (
          <motion.div key="exp" initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
            transition={{ duration:.35, ease:[0.22,1,0.36,1] }}
            style={{ overflow:'hidden', border:`1.5px solid ${flavor.accent}`, borderTop:'none', borderRadius:'0 0 14px 14px', background:'rgba(0,0,0,0.5)' }}>
            <div style={{ position:'relative', aspectRatio:'16/9', overflow:'hidden' }}>
              <Img src={flavor.img} alt={flavor.name} />
              <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,0.92),transparent 55%)' }} />
              <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'12px 16px' }}>
                <p style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700, color:'var(--text)', marginBottom:3 }}>{flavor.name}</p>
                <p style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.6, fontFamily:'var(--sans)', fontWeight:300 }}>{flavor.desc}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Promo Card ─────────────────────────────────────────────────────────────
function PromoCard({ promo, index, large=false }: { promo:Promo; index:number; large?:boolean }) {
  const [hov, setHov] = useState(false)
  const ref = useRef(null)
  const inView = useInView(ref, { once:false, margin:'-60px', amount: 0 })
  const accent = promo.badgeColor ?? 'var(--gold)'
  const evDate = promo.eventDate ? fmtDate(promo.eventDate) : null
  const countdown = promo.validUntil ? getCountdown(promo.validUntil) : null

  return (
    <motion.article
      ref={ref}
      initial={{ opacity:0, y:28 }}
      animate={inView ? { opacity:1, y:hov ? -5 : 0 } : { opacity:0, y:28 }}
      transition={{ delay: inView ? index*.07 : 0, duration:.55, ease:[0.22,1,0.36,1] }}
      onHoverStart={() => setHov(true)} onHoverEnd={() => setHov(false)}
      style={{ borderRadius:22, overflow:'hidden', background:'rgba(12,10,7,0.7)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:`1px solid ${hov ? `${accent}44` : 'var(--border)'}`, boxShadow: hov ? `0 24px 56px rgba(0,0,0,0.6)` : '0 4px 24px rgba(0,0,0,0.35)', cursor:'default', transition:'border-color .3s, box-shadow .3s', display:'flex', flexDirection:'column' }}>
      <div style={{ position:'relative', aspectRatio: large ? '21/9' : '16/9', overflow:'hidden', background:'#0a0806' }}>
        <motion.div style={{ position:'absolute', inset:0 }} animate={{ scale: hov ? 1.06 : 1 }} transition={{ duration:.7, ease:[0.22,1,0.36,1] }}>
          <Img src={promo.img || PLACEHOLDER} alt={promo.title} style={{ filter: hov ? 'brightness(1.08) saturate(1.2)' : 'brightness(.82)' }} />
        </motion.div>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom,transparent 35%,rgba(6,4,2,0.92))' }} />
        {evDate && (
          <div style={{ position:'absolute', top:14, left:14, zIndex:4, background:accent, borderRadius:10, padding:'5px 9px', textAlign:'center', minWidth:40 }}>
            <div style={{ fontSize:17, fontWeight:900, color:'#111', lineHeight:1, fontFamily:'var(--serif)' }}>{evDate.day}</div>
            <div style={{ fontSize:8, fontWeight:700, color:'#111', letterSpacing:'0.08em', textTransform:'uppercase', fontFamily:'var(--sans)' }}>{evDate.month}</div>
          </div>
        )}
        {promo.badge && (
          <span style={{ position:'absolute', top:14, right:14, zIndex:4, background:`${accent}22`, border:`1px solid ${accent}44`, backdropFilter:'blur(10px)', color:accent, fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:999, letterSpacing:'0.08em', textTransform:'uppercase', fontFamily:'var(--sans)' }}>{promo.badge}</span>
        )}
        {promo.discount && (
          <div style={{ position:'absolute', bottom:14, right:14, zIndex:4, background:accent, borderRadius:'50%', width:52, height:52, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 18px ${accent}55`, transform:'rotate(-12deg)' }}>
            <span style={{ fontSize:9, fontWeight:900, color:'#111', textAlign:'center', padding:'0 4px', fontFamily:'var(--sans)' }}>{promo.discount}</span>
          </div>
        )}
      </div>

      <div style={{ padding:'16px 18px 20px', flex:1, display:'flex', flexDirection:'column', gap:6 }}>
        {promo.tag && (
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <CalendarDays size={9} color={accent} />
            <span style={{ fontSize:9, fontWeight:700, color:accent, letterSpacing:'0.2em', textTransform:'uppercase', fontFamily:'var(--sans)' }}>{promo.tag}</span>
          </div>
        )}
        <h3 style={{ fontFamily:'var(--serif)', fontSize: large ? 22 : 17, fontWeight:700, color:'var(--text)', lineHeight:1.15 }}>{promo.title}</h3>
        {promo.subtitle && <p style={{ fontSize:12, fontWeight:500, color:accent, fontFamily:'var(--sans)' }}>{promo.subtitle}</p>}
        <p style={{ fontSize:12.5, color:'var(--text-muted)', lineHeight:1.65, fontFamily:'var(--sans)', fontWeight:300, flex:1 }}>{promo.description}</p>
        {countdown && (
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:4, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:999, padding:'4px 10px', alignSelf:'flex-start' }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:'#ef4444', animation:'pulse-dot 1.2s infinite' }} />
            <span style={{ fontSize:10, fontWeight:700, color:'#ef4444', fontFamily:'var(--sans)' }}>{countdown}</span>
          </div>
        )}
      </div>
    </motion.article>
  )
}

// ── Star Rating ────────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value:number; onChange:(v:number)=>void }) {
  const [hov, setHov] = useState(0)
  return (
    <div style={{ display:'flex', gap:6 }}>
      {[1,2,3,4,5].map(n => {
        const active = n <= (hov || value)
        return (
          <motion.button key={n} whileHover={{ scale:1.2 }} whileTap={{ scale:.9 }}
            onMouseEnter={() => setHov(n)} onMouseLeave={() => setHov(0)} onClick={() => onChange(n)}
            style={{ background:'none', border:'none', padding:0, cursor:'pointer', lineHeight:0 }}>
            <Star size={26} fill={active ? 'var(--gold)' : 'none'} color={active ? 'var(--gold)' : 'var(--text-dim)'} style={{ transition:'fill .15s, color .15s' }} />
          </motion.button>
        )
      })}
    </div>
  )
}

// ── Feedback Modal ─────────────────────────────────────────────────────────
function FeedbackModal({ onClose, productOptions }: { onClose:()=>void; productOptions:FeedbackProductOption[] }) {
  const [rating, setRating]       = useState(0)
  const [message, setMessage]     = useState('')
  const [productId, setProductId] = useState<number|null>(productOptions[0]?.id ?? null)
  const [status, setStatus]       = useState<'idle'|'submitting'|'success'|'error'>('idle')
  const [errMsg, setErrMsg]       = useState('')
  const [focused, setFocused]     = useState<string|null>(null)

  useEffect(() => {
    setProductId(cur => (cur && productOptions.some(p => p.id === cur)) ? cur : (productOptions[0]?.id ?? null))
  }, [productOptions])

  const rawId = typeof window !== 'undefined' ? window.localStorage.getItem('userId') : null
  const userId = rawId && Number.isInteger(+rawId) && +rawId > 0 ? +rawId : null
  const canSubmit = productId !== null && rating > 0 && message.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit || productId === null) return
    setStatus('submitting'); setErrMsg('')
    try {
      const res = await fetch('/api/feedback', { method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ product_id:productId, customer_user_id:userId, rating, comment:message.trim() } satisfies FeedbackPayload) })
      if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.message || `Error ${res.status}`) }
      setStatus('success')
    } catch(e) {
      setErrMsg(e instanceof Error ? e.message : 'Could not submit. Please try again.')
      setStatus('error')
    }
  }

  const inp = (f: string): React.CSSProperties => ({
    fontFamily:'var(--sans)', fontSize:13, color:'var(--text)', background: focused===f ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
    border:`1px solid ${focused===f ? 'rgba(245,200,66,0.4)' : 'var(--border)'}`, borderRadius:10, padding:'10px 14px', width:'100%', outline:'none',
    boxSizing:'border-box', resize:'none' as const, transition:'border-color .2s, background .2s', boxShadow: focused===f ? '0 0 0 3px rgba(245,200,66,0.06)' : 'none',
  })

  return (
    <>
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} onClick={onClose}
        style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)', zIndex:900 }} />
      <motion.div initial={{ opacity:0, y:40, scale:.96 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:24, scale:.97 }}
        transition={{ type:'spring', damping:28, stiffness:260 }}
        style={{ position:'fixed', bottom:100, right:24, width:'min(400px,calc(100vw - 32px))', background:'rgba(14,11,8,0.97)', border:'1px solid var(--gold-border)', borderRadius:20, padding:26, zIndex:901, boxShadow:'0 32px 80px rgba(0,0,0,0.7)', backdropFilter:'blur(24px)' }}>
        <div style={{ position:'absolute', top:0, left:24, right:24, height:1, background:'linear-gradient(90deg,transparent,rgba(245,200,66,0.45),transparent)' }} />

        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <p style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700, color:'var(--text)' }}>Share your thoughts</p>
            <p style={{ fontFamily:'var(--sans)', fontSize:12, color:'var(--text-muted)', marginTop:3, fontWeight:300 }}>Help us improve The Crunch experience</p>
          </div>
          <motion.button whileHover={{ scale:1.1 }} whileTap={{ scale:.9 }} onClick={onClose}
            style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'50%', width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
            <X size={13} color="var(--text-muted)" />
          </motion.button>
        </div>

        <AnimatePresence mode="wait">
          {status === 'success' ? (
            <motion.div key="ok" initial={{ opacity:0, scale:.9 }} animate={{ opacity:1, scale:1 }}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:'20px 0', textAlign:'center' }}>
              <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:'spring', damping:14, stiffness:200, delay:.1 }}>
                <CheckCircle size={44} color="#22c55e" />
              </motion.div>
              <p style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700, color:'var(--text)' }}>Thank you!</p>
              <p style={{ fontFamily:'var(--sans)', fontSize:12, color:'var(--text-muted)', fontWeight:300 }}>Your feedback has been received.</p>
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:.97 }} onClick={onClose}
                style={{ marginTop:6, background:'var(--gold-dim)', border:'1px solid var(--gold-border)', borderRadius:10, padding:'9px 24px', fontSize:13, fontWeight:600, color:'var(--gold)', cursor:'pointer', fontFamily:'var(--sans)' }}>
                Close
              </motion.button>
            </motion.div>
          ) : (
            <motion.div key="form" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <p style={{ fontFamily:'var(--sans)', fontSize:10, fontWeight:600, color:'var(--text-dim)', marginBottom:8, letterSpacing:'0.12em', textTransform:'uppercase' }}>Rating</p>
                <StarRating value={rating} onChange={setRating} />
                {rating > 0 && <motion.p initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} style={{ fontFamily:'var(--sans)', fontSize:11, color:'var(--gold)', marginTop:5, fontWeight:500 }}>{['','Poor','Fair','Good','Great','Amazing!'][rating]}</motion.p>}
              </div>

              <div>
                <p style={{ fontFamily:'var(--sans)', fontSize:10, fontWeight:600, color:'var(--text-dim)', marginBottom:8, letterSpacing:'0.12em', textTransform:'uppercase' }}>Product</p>
                <select value={productId ?? ''} onChange={e => setProductId(+e.target.value || null)}
                  onFocus={() => setFocused('product')} onBlur={() => setFocused(null)}
                  style={inp('product')} disabled={productOptions.length === 0 || status === 'submitting'}>
                  {productOptions.length === 0
                    ? <option value="">No products available</option>
                    : productOptions.map(p => <option key={p.id} value={p.id} style={{ color:'#111' }}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <p style={{ fontFamily:'var(--sans)', fontSize:10, fontWeight:600, color:'var(--text-dim)', marginBottom:8, letterSpacing:'0.12em', textTransform:'uppercase' }}>Your Feedback</p>
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Tell us about your experience…" rows={4}
                  onFocus={() => setFocused('msg')} onBlur={() => setFocused(null)} style={inp('msg')} />
                <p style={{ fontFamily:'var(--sans)', fontSize:10, color:'var(--text-dim)', marginTop:3, textAlign:'right' }}>{message.length}/500</p>
              </div>

              <AnimatePresence>
                {status === 'error' && (
                  <motion.p initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                    style={{ fontFamily:'var(--sans)', fontSize:12, color:'#ef4444', background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.18)', borderRadius:8, padding:'7px 11px' }}>
                    {errMsg}
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.button whileHover={canSubmit ? { scale:1.02 } : {}} whileTap={canSubmit ? { scale:.97 } : {}}
                onClick={handleSubmit} disabled={!canSubmit || status === 'submitting'}
                style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, background: canSubmit ? 'var(--gold)' : 'rgba(245,200,66,0.12)', border:'none', borderRadius:12, padding:'12px', fontSize:13, fontWeight:700, color: canSubmit ? '#111' : 'rgba(245,200,66,0.3)', cursor: canSubmit ? 'pointer' : 'default', fontFamily:'var(--sans)', transition:'background .2s, color .2s' }}>
                {status === 'submitting'
                  ? <span style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(17,17,17,0.3)', borderTopColor:'#111', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
                  : <Send size={14} />}
                {status === 'submitting' ? 'Sending…' : 'Submit'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}

// ── Feedback Button ────────────────────────────────────────────────────────
function FeedbackButton() {
  const [open, setOpen]         = useState(false)
  const [products, setProducts] = useState<FeedbackProductOption[]>([])

  useEffect(() => {
    fetch('/api/products').then(r => r.ok ? r.json() : []).then((data: unknown[]) => {
      if (!Array.isArray(data)) return
      setProducts(data.filter((d: any) => Number.isInteger(d.id) && typeof d.name === 'string').map((d: any) => ({ id:+d.id, name:String(d.name).trim() })))
    }).catch(() => {})
  }, [])

  return (
    <>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
      <AnimatePresence>
        {open && <FeedbackModal onClose={() => setOpen(false)} productOptions={products} />}
      </AnimatePresence>
      <motion.button initial={{ scale:0, opacity:0 }} animate={{ scale:1, opacity:1 }} transition={{ delay:1.2, type:'spring', damping:18, stiffness:260 }}
        whileHover={{ scale:1.08 }} whileTap={{ scale:.93 }} onClick={() => setOpen(v => !v)}
        style={{ position:'fixed', bottom:28, right:24, zIndex:800, display:'flex', alignItems:'center', gap:8, background:'var(--gold)', border:'none', borderRadius:999, padding:'11px 20px', fontSize:12, fontWeight:700, color:'#111', cursor:'pointer', fontFamily:'var(--sans)', boxShadow:'0 8px 28px rgba(245,200,66,0.3)', letterSpacing:'0.03em' }}>
        <MessageSquare size={15} />
        {open ? 'Close' : 'Feedback'}
      </motion.button>
    </>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
interface ProductsProps { isAuthenticated?: boolean; onLogout?: () => void }

export default function Products({ isAuthenticated=false, onLogout }: ProductsProps) {
  const navigate = useNavigate()

  const [products,     setProducts]     = useState<Product[]>([])
  const [flavors,      setFlavors]      = useState<FlavorItem[]>([])
  const [menuSections, setMenuSections] = useState<MenuSection[]>([])
  const [promos,       setPromos]       = useState<Promo[]>([])

  const [loadingP, setLoadingP] = useState(true)
  const [loadingF, setLoadingF] = useState(true)
  const [loadingM, setLoadingM] = useState(true)
  const [loadingR, setLoadingR] = useState(true)

  const [category,       setCategory]       = useState<Category>('All')
  const [search,         setSearch]         = useState('')
  const [isOpen,         setIsOpen]         = useState(false)
  const [expandedFlavor, setExpandedFlavor] = useState<string|null>(null)
  const [mobileOpen,     setMobileOpen]     = useState(false)
  const [searchFocused,  setSearchFocused]  = useState(false)

  const { scrollY } = useScroll()
  const heroY = useTransform(scrollY, [0,600], [0,100])
  const heroO = useTransform(scrollY, [0,400], [1,0.3])

  // business hours
  useEffect(() => {
    const check = () => {
      const now = new Date(), day = now.getDay(), t = now.getHours() + now.getMinutes()/60
      setIsOpen((day >= 1 && day <= 5 && t >= 10 && t < 22) || ((day===0||day===6) && t >= 11 && t < 20.5))
    }
    check(); const id = setInterval(check, 60000); return () => clearInterval(id)
  }, [])

  // inject styles
  useEffect(() => {
    const el = document.createElement('style'); el.id = 'crunch-lux'
    if (!document.getElementById('crunch-lux')) { el.innerHTML = STYLES; document.head.appendChild(el) }
    return () => { document.getElementById('crunch-lux')?.remove() }
  }, [])

  // fetch helper
  const fetchData = <T,>(url: string, set: (d:T[])=>void, setLoading: (v:boolean)=>void) => {
    let cancelled = false
    setLoading(true)
    fetch(url).then(r => { if(!r.ok) throw new Error(); return r.json() })
      .then((d:T[]) => { if(!cancelled) { set(Array.isArray(d)?d:[]); setLoading(false) } })
      .catch(() => { if(!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }

  useEffect(() => fetchData<Product>('/api/products', setProducts, setLoadingP), [])
  useEffect(() => fetchData<FlavorItem>('/api/flavors', setFlavors, setLoadingF), [])
  useEffect(() => fetchData<MenuSection>('/api/menu-sections', setMenuSections, setLoadingM), [])
  useEffect(() => fetchData<Promo>('/api/promos', setPromos, setLoadingR), [])

  const filtered = products.filter(p =>
    (category==='All' || p.category===category) && p.name.toLowerCase().includes(search.toLowerCase())
  )
  const topPick = filtered.find(p => p.badge==='Bestseller') ?? filtered[0] ?? null

  const handleOrder  = useCallback(() => navigate('/usersmenu?showOrderModal=true'), [navigate])
  const handleLogout = useCallback(() => { onLogout?.(); navigate('/products') }, [onLogout, navigate])

  const navLinks = [
    { label:'Home',  action: () => navigate('/') },
    { label:'Menu',  action: handleOrder },
    { label:'About', action: () => navigate('/aboutthecrunch') },
  ]

  return (
    <div style={{ fontFamily:'var(--sans)', background:'var(--bg)', minHeight:'100vh', color:'var(--text)', position:'relative' }}>
      {/* Ambient */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, overflow:'hidden' }}>
        <div style={{ position:'absolute', top:'-5%', left:'10%', width:'min(600px,70vw)', height:'min(600px,70vw)', borderRadius:'50%', background:'radial-gradient(circle,rgba(245,200,66,0.055) 0%,transparent 65%)' }} />
        <div style={{ position:'absolute', bottom:'-5%', right:'5%', width:'min(500px,60vw)', height:'min(500px,60vw)', borderRadius:'50%', background:'radial-gradient(circle,rgba(245,200,66,0.04) 0%,transparent 65%)' }} />
      </div>

      {/* ── Nav ── */}
      <motion.header initial={{ y:-80, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ duration:.7, ease:[0.22,1,0.36,1] }}
        style={{ position:'sticky', top:0, zIndex:200, height:NAV_H, background:'rgba(8,7,5,0.92)', backdropFilter:'blur(28px)', WebkitBackdropFilter:'blur(28px)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center' }}>
        <div className="pad" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button onClick={() => window.scrollTo({ top:0, behavior:'smooth' })} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
            <span style={{ fontFamily:'var(--serif)', fontWeight:700, fontSize:22, color:'var(--text)', letterSpacing:'-0.02em' }}>
              The <span style={{ color:'var(--gold)' }}>Crunch</span>
            </span>
          </button>

          <nav className="dn768" style={{ display:'flex', gap:4, alignItems:'center' }}>
            {navLinks.map(({ label, action }) => (
              <button key={label} onClick={action}
                style={{ color:'var(--text-muted)', fontSize:13, fontWeight:500, padding:'7px 14px', borderRadius:10, background:'none', border:'none', cursor:'pointer', fontFamily:'var(--sans)', transition:'color .2s, background .2s' }}
                onMouseEnter={e => { e.currentTarget.style.color='var(--text)'; e.currentTarget.style.background='var(--surface)' }}
                onMouseLeave={e => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background='transparent' }}>
                {label}
              </button>
            ))}
            <div style={{ width:1, height:16, background:'var(--border)', margin:'0 6px' }} />
            {isAuthenticated ? (
              <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:.97 }} onClick={handleLogout}
                style={{ background:'var(--gold)', border:'none', borderRadius:10, padding:'8px 20px', fontSize:12, fontWeight:700, color:'#111', cursor:'pointer', fontFamily:'var(--sans)' }}>
                Log Out
              </motion.button>
            ) : (
              <>
                <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:.97 }} onClick={() => navigate('/login')}
                  style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'7px 16px', fontSize:12, fontWeight:600, color:'var(--text)', cursor:'pointer', fontFamily:'var(--sans)' }}>
                  Log In
                </motion.button>
                <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:.97 }} onClick={() => navigate('/login?tab=signup')}
                  style={{ background:'var(--gold)', border:'none', borderRadius:10, padding:'8px 20px', fontSize:12, fontWeight:700, color:'#111', cursor:'pointer', fontFamily:'var(--sans)' }}>
                  Sign Up
                </motion.button>
              </>
            )}
          </nav>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen(v => !v)} className="df768"
            style={{ display:'none', background:'none', border:'none', cursor:'pointer', color:'var(--text)', padding:8, borderRadius:10, alignItems:'center', justifyContent:'center' }}>
            {mobileOpen ? <X size={20} /> : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="4" width="16" height="2" rx="1" fill="#f0ede8"/>
                <rect x="2" y="9" width="12" height="2" rx="1" fill="rgba(240,237,232,0.5)"/>
                <rect x="2" y="14" width="16" height="2" rx="1" fill="#f0ede8"/>
              </svg>
            )}
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
              transition={{ duration:.3, ease:[0.22,1,0.36,1] }}
              style={{ position:'absolute', top:NAV_H, left:0, right:0, background:'rgba(10,8,5,0.97)', backdropFilter:'blur(24px)', borderBottom:'1px solid var(--border)', overflow:'hidden', zIndex:300, display:'flex', flexDirection:'column', padding:'10px 20px 18px', gap:4 }}>
              {navLinks.map(({ label, action }) => (
                <button key={label} onClick={() => { action(); setMobileOpen(false) }}
                  style={{ background:'none', border:'none', textAlign:'left', padding:'11px 8px', fontSize:15, fontWeight:500, color:'var(--text-muted)', cursor:'pointer', fontFamily:'var(--sans)', borderRadius:10 }}>
                  {label}
                </button>
              ))}
              <div style={{ height:1, background:'var(--border)', margin:'6px 0' }} />
              <div style={{ display:'flex', gap:10 }}>
                {isAuthenticated ? (
                  <button onClick={() => { handleLogout(); setMobileOpen(false) }}
                    style={{ flex:1, background:'var(--gold)', border:'none', borderRadius:12, padding:'12px', fontSize:13, fontWeight:700, color:'#111', cursor:'pointer', fontFamily:'var(--sans)' }}>
                    Log Out
                  </button>
                ) : (
                  <>
                    <button onClick={() => { navigate('/login'); setMobileOpen(false) }}
                      style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px', fontSize:13, fontWeight:600, color:'var(--text)', cursor:'pointer', fontFamily:'var(--sans)' }}>
                      Log In
                    </button>
                    <button onClick={() => { navigate('/login?tab=signup'); setMobileOpen(false) }}
                      style={{ flex:1, background:'var(--gold)', border:'none', borderRadius:12, padding:'12px', fontSize:13, fontWeight:700, color:'#111', cursor:'pointer', fontFamily:'var(--sans)' }}>
                      Sign Up
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* ── Banner ── */}
      <div style={{ position:'sticky', top:NAV_H, zIndex:190, height:BANNER_H, background:'rgba(10,8,5,0.95)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(245,200,66,0.07)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:14, flexWrap:'wrap', padding:'0 16px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, background: isOpen ? 'rgba(34,197,94,0.09)' : 'rgba(239,68,68,0.09)', border:`1px solid ${isOpen ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius:999, padding:'3px 11px' }}>
            <motion.div animate={{ scale:[1,1.5,1] }} transition={{ duration:1.8, repeat:Infinity }}
              style={{ width:5, height:5, borderRadius:'50%', background: isOpen ? '#22c55e' : '#ef4444' }} />
            <span style={{ fontSize:10, fontWeight:700, color: isOpen ? '#22c55e' : '#ef4444', letterSpacing:'0.07em', textTransform:'uppercase', fontFamily:'var(--sans)' }}>
              {isOpen ? 'Open Now' : 'Closed'}
            </span>
          </div>
          <div style={{ width:1, height:10, background:'var(--border)' }} />
          <Clock size={10} color="var(--gold)" />
          {[
            { label:'Mon – Fri', hours:'10 AM – 10 PM' },
            { label:'Sat – Sun', hours:'11 AM – 8:30 PM' },
          ].map(({ label, hours }) => (
            <span key={label} style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap', fontFamily:'var(--sans)' }}>
              <span style={{ color:'var(--text)', fontWeight:600 }}>{label}</span> {hours}
            </span>
          ))}
        </div>
      </div>

      {/* ── Hero ── */}
      <div style={{ position:'relative', minHeight:'88vh', display:'flex', alignItems:'center', overflow:'hidden' }}>
        {/* background texture */}
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 30% 50%,rgba(245,200,66,0.07) 0%,transparent 55%), radial-gradient(ellipse at 80% 20%,rgba(245,200,66,0.04) 0%,transparent 45%)', zIndex:0 }} />
        <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 79px,rgba(255,255,255,0.015) 80px),repeating-linear-gradient(90deg,transparent,transparent 79px,rgba(255,255,255,0.015) 80px)', zIndex:0 }} />

        <motion.div className="pad" style={{ y:heroY, opacity:heroO, position:'relative', zIndex:1, paddingTop:80, paddingBottom:80 }}>
          <motion.div initial={{ opacity:0, x:-16 }} animate={{ opacity:1, x:0 }} transition={{ delay:.3, duration:.6 }}>
            <EyebrowLabel>The Crunch Fairview</EyebrowLabel>
          </motion.div>

          <motion.h1 initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }} transition={{ delay:.45, duration:.85, ease:[0.22,1,0.36,1] }}
            style={{ fontFamily:'var(--serif)', fontSize:'clamp(60px,11vw,130px)', fontWeight:700, color:'var(--text)', margin:'0 0 24px', lineHeight:.9, letterSpacing:'-0.025em' }}>
            Our<br /><em style={{ color:'var(--gold)', fontStyle:'italic' }}>Menu.</em>
          </motion.h1>

          <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.65 }}
            style={{ color:'var(--text-muted)', fontSize:'clamp(13px,1.4vw,15px)', maxWidth:340, lineHeight:1.9, fontWeight:300, marginBottom:40 }}>
            Fresh, hot, and fan-favorite — discover what makes The Crunch unforgettable.
          </motion.p>

          {/* Search */}
          <motion.div initial={{ opacity:0, scale:.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:.55 }}
            style={{ position:'relative', width:'min(340px,100%)' }}>
            <Search size={13} style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', color: searchFocused ? 'rgba(245,200,66,0.6)' : 'var(--text-dim)', pointerEvents:'none', zIndex:1, transition:'color .2s' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search the menu…"
              onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
              style={{ width:'100%', padding:'13px 44px 13px 44px', borderRadius:14, border:`1px solid ${searchFocused ? 'rgba(245,200,66,0.35)' : 'var(--border)'}`, fontSize:13.5, outline:'none', background: searchFocused ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)', backdropFilter:'blur(16px)', boxSizing:'border-box' as const, fontFamily:'var(--sans)', color:'var(--text)', transition:'border-color .2s, background .2s', boxShadow: searchFocused ? '0 0 0 3px rgba(245,200,66,0.06)' : 'none' }} />
            {search && (
              <button onClick={() => setSearch('')} style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-dim)', display:'flex', alignItems:'center' }}>
                <X size={13} />
              </button>
            )}
          </motion.div>
        </motion.div>

        {/* Decorative gold line */}
        <motion.div initial={{ scaleX:0 }} animate={{ scaleX:1 }} transition={{ delay:1, duration:1.2, ease:[0.22,1,0.36,1] }}
          style={{ position:'absolute', bottom:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,rgba(245,200,66,0.25) 30%,rgba(245,200,66,0.25) 70%,transparent)', transformOrigin:'left', zIndex:1 }} />
      </div>

      {/* ── Category Tabs ── */}
      <div style={{ position:'sticky', top:TAB_TOP, zIndex:180, background:'rgba(8,7,5,0.96)', backdropFilter:'blur(24px)', borderBottom:'1px solid var(--border)' }}>
        <div className="pad tabs-row">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              style={{ position:'relative', padding:'14px 18px', border:'none', background:'none', cursor:'pointer', fontWeight: category===cat ? 600 : 400, fontSize:13, fontFamily:'var(--sans)', whiteSpace:'nowrap', color: category===cat ? 'var(--gold)' : 'var(--text-dim)', transition:'color .2s', display:'flex', alignItems:'center', gap:5 }}>
              {cat==='Drinks' && <Droplets size={11} color={category===cat ? 'var(--gold)' : 'var(--text-dim)'} />}
              {cat}
              {category===cat && <motion.div layoutId="tab" style={{ position:'absolute', bottom:0, left:8, right:8, height:2, background:'var(--gold)', borderRadius:'2px 2px 0 0' }} />}
            </button>
          ))}
        </div>
      </div>

      {/* Drink notice */}
      <AnimatePresence>
        {category==='Drinks' && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
            style={{ overflow:'hidden', background:'rgba(245,200,66,0.03)', borderBottom:'1px solid rgba(245,200,66,0.07)' }}>
            <div className="pad" style={{ paddingTop:10, paddingBottom:10, display:'flex', alignItems:'center', gap:10 }}>
              <Droplets size={12} color="var(--gold)" />
              <span style={{ fontSize:12, color:'var(--text-muted)', fontFamily:'var(--sans)' }}>
                Fruit Soda available in <strong style={{ color:'var(--gold)' }}>16oz (₱50)</strong> and <strong style={{ color:'var(--gold)' }}>22oz (₱60)</strong>.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content ── */}
      <div className="pad" style={{ paddingTop:56, paddingBottom:96, position:'relative', zIndex:1 }}>

        {/* Featured card */}
        {!search && !loadingP && topPick && (
          <Reveal style={{ marginBottom:72 }}>
            <motion.div whileHover="hovered"
              style={{ borderRadius:28, overflow:'hidden', position:'relative', cursor:'pointer', background:'#0a0806', aspectRatio:'21/9', minHeight:260, maxHeight:440 }}>
              <motion.div variants={{ hovered:{ scale:1.04 } }} transition={{ duration:.7, ease:[0.22,1,0.36,1] }} style={{ position:'absolute', inset:0 }}>
                <Img src={topPick.img || PLACEHOLDER} alt={topPick.name} style={{ filter:'brightness(0.72) saturate(1.1)' }} />
              </motion.div>
              <div style={{ position:'absolute', inset:0, background:'linear-gradient(105deg,rgba(6,5,3,0.94) 0%,rgba(6,5,3,0.45) 50%,rgba(6,5,3,0.1) 100%)' }} />

              {/* Top pick badge */}
              <div style={{ position:'absolute', top:28, left:32 }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'var(--gold-dim)', border:'1px solid var(--gold-border)', borderRadius:999, padding:'6px 16px', backdropFilter:'blur(12px)' }}>
                  <Crown size={10} color="var(--gold)" />
                  <span style={{ fontSize:9, fontWeight:700, color:'var(--gold)', letterSpacing:'0.15em', textTransform:'uppercase', fontFamily:'var(--sans)' }}>Top Pick</span>
                </div>
              </div>

              <div style={{ position:'absolute', bottom:'clamp(20px,4vw,36px)', left:'clamp(20px,3vw,36px)', right:'clamp(20px,3vw,36px)' }}>
                <motion.h2 variants={{ hovered:{ x:6 } }} transition={{ duration:.3 }}
                  style={{ fontFamily:'var(--serif)', margin:'0 0 8px', fontSize:'clamp(24px,4vw,56px)', fontWeight:700, color:'var(--text)', lineHeight:1.05, letterSpacing:'-0.02em' }}>
                  {topPick.name}
                </motion.h2>
                <p style={{ margin:'0 0 18px', fontSize:'clamp(12px,1.1vw,14px)', color:'var(--text-muted)', maxWidth:460, lineHeight:1.8, fontFamily:'var(--sans)', fontWeight:300 }}>
                  {topPick.description}
                </p>
                <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                  <span style={{ color:'var(--text-dim)', fontSize:12, fontFamily:'var(--sans)' }}>{topPick.category}</span>
                  <span style={{ fontFamily:'var(--serif)', fontSize:'clamp(20px,2.5vw,28px)', fontWeight:700, color:'var(--gold)' }}>₱{topPick.price}</span>
                  <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:.96 }} onClick={handleOrder}
                    style={{ marginLeft:'auto', background:'var(--gold)', border:'none', borderRadius:13, padding:'clamp(10px,1.2vw,13px) clamp(20px,2vw,32px)', fontSize:12, fontWeight:700, color:'#111', cursor:'pointer', fontFamily:'var(--sans)', letterSpacing:'0.03em' }}>
                    Order Now
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </Reveal>
        )}

        {/* Item count */}
        {!loadingP && (
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:32 }}>
            <GoldLine />
            <span style={{ fontSize:10, fontWeight:600, color:'var(--text-dim)', letterSpacing:'0.22em', textTransform:'uppercase', whiteSpace:'nowrap', fontFamily:'var(--sans)' }}>
              {filtered.length} item{filtered.length !== 1 ? 's' : ''}
            </span>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
          </div>
        )}

        {/* Product grid */}
        {loadingP ? (
          <div className="g2">
            {Array.from({ length:6 }).map((_,i) => <Skeleton key={i} style={{ height:420 }} />)}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <div key={category+search} className="g2">
              {filtered.map((p,i) => <ProductCard key={p.id} product={p} index={i} onOrder={handleOrder} />)}
            </div>
          </AnimatePresence>
        )}

        {/* Empty */}
        {!loadingP && filtered.length === 0 && (
          <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} style={{ textAlign:'center', padding:'80px 0' }}>
            <div style={{ fontSize:48, marginBottom:14 }}>🍗</div>
            <p style={{ fontFamily:'var(--serif)', fontSize:22, fontWeight:700, color:'var(--text-muted)', marginBottom:6 }}>Nothing found</p>
            <p style={{ fontSize:13, color:'var(--text-dim)', fontFamily:'var(--sans)', fontWeight:300 }}>Try a different search or category</p>
            {search && (
              <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:.96 }} onClick={() => setSearch('')}
                style={{ marginTop:18, background:'var(--gold-dim)', border:'1px solid var(--gold-border)', borderRadius:12, padding:'9px 22px', fontSize:12, fontWeight:600, color:'var(--gold)', cursor:'pointer', fontFamily:'var(--sans)' }}>
                Clear search
              </motion.button>
            )}
          </motion.div>
        )}

        {/* ── Promos ── */}
        <Reveal style={{ marginTop:100 }}>
          <EyebrowLabel>Year-Round Events</EyebrowLabel>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:16, marginBottom:44 }}>
            <SectionTitle>Deals &amp; <em style={{ color:'var(--gold)', fontStyle:'italic' }}>Promos</em></SectionTitle>
            <p style={{ fontSize:13, color:'var(--text-muted)', fontFamily:'var(--sans)', fontWeight:300, maxWidth:240, lineHeight:1.7 }}>
              Holiday specials, payday bundles, and limited-time flavors.
            </p>
          </div>

          {loadingR ? (
            <div className="gp">{Array.from({ length:4 }).map((_,i) => <Skeleton key={i} style={{ aspectRatio:'16/9' }} />)}</div>
          ) : promos.length === 0 ? (
            <p style={{ textAlign:'center', padding:'60px 0', color:'var(--text-dim)', fontFamily:'var(--sans)', fontSize:14, fontWeight:300 }}>No active promos right now — check back soon! 🍗</p>
          ) : (
            <>
              {promos.filter(p=>p.highlight).length > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,520px),1fr))', gap:20, marginBottom:20 }}>
                  {promos.filter(p=>p.highlight).map((p,i) => <PromoCard key={p.id} promo={p} index={i} large />)}
                </div>
              )}
              {promos.filter(p=>!p.highlight).length > 0 && (
                <div className="gp">
                  {promos.filter(p=>!p.highlight).map((p,i) => <PromoCard key={p.id} promo={p} index={promos.filter(x=>x.highlight).length+i} />)}
                </div>
              )}
            </>
          )}
        </Reveal>

        {/* ── Flavors ── */}
        {(loadingF || flavors.length > 0) && (
          <Reveal style={{ marginTop:100 }}>
            <EyebrowLabel>Available in every chicken</EyebrowLabel>
            <SectionTitle style={{ marginBottom:8 }}>Signature <em style={{ color:'var(--gold)', fontStyle:'italic' }}>Flavors</em></SectionTitle>
            <p style={{ fontSize:13, color:'var(--text-muted)', maxWidth:380, marginBottom:36, fontWeight:300, lineHeight:1.8, fontFamily:'var(--sans)' }}>
              Tap any flavor to preview it.
            </p>
            {loadingF ? (
              <div className="gf">{Array.from({ length:6 }).map((_,i) => <Skeleton key={i} style={{ height:50, borderRadius:14 }} />)}</div>
            ) : (
              <div className="gf">
                {flavors.map((f,i) => (
                  <FlavorCard key={f.name} flavor={f} index={i} expanded={expandedFlavor===f.name} onToggle={() => setExpandedFlavor(expandedFlavor===f.name ? null : f.name)} />
                ))}
              </div>
            )}
          </Reveal>
        )}

        {/* ── Full Menu ── */}
        {(loadingM || menuSections.length > 0) && (
          <Reveal style={{ marginTop:100 }}>
            <EyebrowLabel>Full Menu</EyebrowLabel>
            <SectionTitle style={{ marginBottom:44 }}>Everything <em style={{ color:'var(--gold)', fontStyle:'italic' }}>We Offer</em></SectionTitle>
            {loadingM ? (
              <div className="g2m">{Array.from({ length:4 }).map((_,i) => <Skeleton key={i} style={{ height:320 }} />)}</div>
            ) : (
              <div className="g2m">
                {menuSections.map((s,i) => <MenuCard key={s.id} section={s} delay={i*.07} />)}
              </div>
            )}
          </Reveal>
        )}
      </div>

      {/* ── Footer ── */}
      <footer style={{ borderTop:'1px solid var(--border)', padding:'clamp(36px,6vw,52px) 0 36px', position:'relative', zIndex:1 }}>
        <div className="pad">
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:32, marginBottom:40 }}>
            <div>
              <button onClick={() => window.scrollTo({ top:0, behavior:'smooth' })} style={{ background:'none', border:'none', cursor:'pointer', padding:0, marginBottom:12, display:'block' }}>
                <span style={{ fontFamily:'var(--serif)', fontWeight:700, fontSize:18, color:'var(--text)' }}>The <span style={{ color:'var(--gold)' }}>Crunch</span></span>
              </button>
              <p style={{ fontSize:13, color:'var(--text-dim)', marginBottom:14, lineHeight:1.7, maxWidth:200, fontWeight:300, fontFamily:'var(--sans)' }}>
                6 Falcon St., cor Dahlia Fairview,<br />Quezon City, Philippines
              </p>
              <motion.a href="https://www.google.com/maps/place/The+Crunch+-+Fairview+Branch/@14.7002687,121.0662915,21z" target="_blank" rel="noopener noreferrer"
                whileHover={{ scale:1.03 }} whileTap={{ scale:.97 }}
                style={{ display:'inline-flex', alignItems:'center', gap:7, background:'var(--gold-dim)', border:'1px solid var(--gold-border)', borderRadius:10, padding:'7px 13px', textDecoration:'none' }}>
                <MapPin size={12} color="var(--gold)" />
                <span style={{ fontSize:12, fontWeight:600, color:'var(--gold)', fontFamily:'var(--sans)' }}>View on Google Maps</span>
              </motion.a>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <span style={{ fontSize:9, fontWeight:700, color:'var(--text-dim)', letterSpacing:'0.14em', textTransform:'uppercase', fontFamily:'var(--sans)' }}>Follow Us</span>
              {[{ label:'Instagram', href:'https://www.instagram.com/thecrunchfairview' }, { label:'Facebook', href:'https://www.facebook.com/thecrunchfairview' }].map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily:'var(--serif)', fontSize:16, fontWeight:600, color:'var(--text-muted)', textDecoration:'none', transition:'color .2s' }}
                  onMouseEnter={e => e.currentTarget.style.color='var(--gold)'}
                  onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          <div style={{ paddingTop:20, borderTop:'1px solid rgba(255,255,255,0.04)', textAlign:'center' }}>
            <span style={{ fontSize:11, color:'var(--text-dim)', fontWeight:300, fontFamily:'var(--sans)' }}>
              © {new Date().getFullYear()} The Crunch Fairview. All rights reserved.
            </span>
          </div>
        </div>
      </footer>

      <FeedbackButton />
    </div>
  )
}