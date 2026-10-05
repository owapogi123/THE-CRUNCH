import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { motion, AnimatePresence, MotionConfig, useReducedMotion, type Variants } from 'framer-motion'
import { Search, Flame, Clock, ChevronDown, ChevronLeft, ChevronRight, MapPin, Star, X, MessageSquare, Send, CheckCircle, Menu, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useViewport } from '@/hooks/use-tablet'
import { api, resolveAssetUrl } from '@/lib/api'
import { fetchGeneralSettings, formatCurrencyAmount } from '@/lib/restaurantSettings'
import { useAuth } from '@/context/authcontext'

// ── Types & helpers ────────────────────────────────────────────────────────
const NAV_H = 64
const MAX_FB = 200
const SLIDE_MS = 1500 // time each hero slide stays on screen
const MAX_SLIDES = 8
const CATEGORIES = ['All', 'Chicken', 'Sides', 'Drinks', 'Combos'] as const
type Category = (typeof CATEGORIES)[number]

interface Product { id: number; name: string; category: Category; rating: number; badge: string; description: string; price: number; spicy: boolean; img: string }
interface Flavor { name: string; accent: string; desc: string; img: string }
interface MenuItem { name: string; price: number; tag?: string; img?: string }
interface MenuSection { id: string; title: string; subtext?: string; items: MenuItem[] }
interface Promo { id: string; title: string; subtitle?: string; description: string; img: string; badge?: string; validUntil?: string; discount?: string; highlight?: boolean }

const fmt = (v: number) => formatCurrencyAmount(v)

const normCat = (v: unknown): Category => {
  const r = String(v ?? '').toLowerCase()
  if (r.includes('drink') || r.includes('beverage') || r.includes('soda')) return 'Drinks'
  if (r.includes('side')) return 'Sides'
  if (r.includes('combo')) return 'Combos'
  if (r.includes('chicken') || r.includes('rice meal') || r.includes('menu food')) return 'Chicken'
  return 'All'
}

const mapProducts = (data: unknown[]): Product[] =>
  data
    .map((r: any) => ({
      id: Number(r?.id ?? r?.product_id ?? 0),
      name: String(r?.name ?? r?.product_name ?? '').trim(),
      category: normCat(r?.category),
      rating: Number(r?.rating ?? 0),
      badge: String(r?.badge ?? '').trim(),
      description: String(r?.description ?? '').trim(),
      price: Number(r?.price ?? 0),
      spicy: Boolean(r?.spicy),
      img: typeof (r?.image ?? r?.img) === 'string' && String(r?.image ?? r?.img).trim() ? resolveAssetUrl(String(r?.image ?? r?.img).trim()) : '',
    }))
    .filter(p => p.id > 0 && p.name)

const timeLeft = (d?: string) => {
  if (!d) return null
  const diff = new Date(d).getTime() - Date.now()
  if (diff <= 0) return null
  const days = Math.floor(diff / 86400000)
  if (days > 30) return null
  return days > 0 ? `${days}d left` : `${Math.floor(diff / 3600000)}h left`
}

// ── Motion presets ─────────────────────────────────────────────────────────
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const VP = { once: true, margin: '-60px' } as const
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE, delay: (i % 4) * 0.07 } }),
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.2 } },
}
const reveal = { variants: fadeUp, initial: 'hidden', whileInView: 'show', viewport: VP } as const
const heroIn = (delay: number) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: EASE, delay } })

function Reveal({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={VP} transition={{ duration: 0.5, ease: EASE }}>
      {children}
    </motion.div>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
:root{--gold:#f5c842;--bg:#0b0a08;--card:#131110;--line:rgba(255,255,255,.08);--text:#f4f1ec;--muted:rgba(244,241,236,.58);--pad:clamp(16px,4vw,48px)}
body{background:var(--bg)}
.pc{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
.pc button{font-family:inherit}
.pc :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.wrap{max-width:1240px;margin:0 auto;padding:0 var(--pad);width:100%}
.nav{position:fixed;top:0;left:0;right:0;z-index:100;height:${NAV_H}px;display:flex;align-items:center;transition:background .25s,border-color .25s,box-shadow .25s;border-bottom:1px solid transparent}
.nav.on{background:rgba(11,10,8,.92);backdrop-filter:blur(16px);border-bottom-color:var(--line);box-shadow:0 8px 30px rgba(0,0,0,.35)}
.nav-in{display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{display:flex;align-items:center;gap:10px;background:none;border:0;cursor:pointer;color:var(--text);font-weight:800;font-size:18px;letter-spacing:-.02em}
.links{display:flex;align-items:center;gap:4px}
.link{background:none;border:0;color:var(--muted);font-size:14px;font-weight:500;padding:8px 14px;border-radius:8px;cursor:pointer;transition:color .15s,background .15s}
.link:hover{color:var(--text);background:rgba(255,255,255,.05)}
.btn{border:0;border-radius:10px;padding:9px 18px;font-size:13px;font-weight:600;cursor:pointer;transition:transform .15s,opacity .15s}
.btn:active{transform:scale(.97)}
.btn-gold{background:var(--gold);color:#15120a}
.btn-ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
.btn-ghost:hover{background:rgba(255,255,255,.05)}
.status{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--muted);padding:0 4px}
.dot{width:7px;height:7px;border-radius:50%}
.burger{display:none;background:none;border:0;color:var(--text);cursor:pointer;padding:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;transition:border-color .2s,box-shadow .2s;display:flex;flex-direction:column}
.card:hover{border-color:rgba(245,200,66,.35);box-shadow:0 14px 34px rgba(0,0,0,.35)}
.card:hover .thumb img.ld{transform:scale(1.05)}
.thumb{position:relative;aspect-ratio:4/3;background:#1a1712;overflow:hidden}
.thumb img{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .5s ease,transform .6s cubic-bezier(.22,1,.36,1)}
.thumb img.ld{opacity:1}
.chip{font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.06);color:var(--muted)}
.chip-gold{background:var(--gold);color:#15120a}
.tabs{position:sticky;top:${NAV_H}px;z-index:50;background:rgba(11,10,8,.94);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.tabs-in{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
.tabs-in::-webkit-scrollbar{display:none}
.tab{position:relative;background:none;border:0;padding:16px 14px;font-size:14px;font-weight:500;color:var(--muted);cursor:pointer;white-space:nowrap}
.tab.on{color:var(--gold);font-weight:600}
.h2{font-size:clamp(26px,3.6vw,38px);font-weight:800;letter-spacing:-.025em;line-height:1.1}
.sub{color:var(--muted);font-size:14px;line-height:1.6}
.section{margin-top:80px}
.skel{border-radius:16px;background:linear-gradient(90deg,#141210,#1c1915,#141210);background-size:200% 100%;animation:sh 1.4s infinite}
.fixed-btn{position:fixed;bottom:22px;right:22px;z-index:90}
.input{width:100%;font:inherit;font-size:14px;color:var(--text);background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:10px;padding:11px 14px;outline:none;transition:border-color .15s}
.input:focus{border-color:rgba(245,200,66,.5)}
.input option{color:#111}

/* Hero */
.hero{padding-top:calc(${NAV_H}px + clamp(28px,6vw,72px));padding-bottom:clamp(36px,6vw,56px);background:radial-gradient(ellipse at 20% 0%,rgba(245,200,66,.10),transparent 55%)}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:clamp(28px,5vw,64px);align-items:center}
.hero-grid.solo{grid-template-columns:minmax(0,1fr)}
.hero-title{font-size:clamp(42px,7.5vw,84px);font-weight:800;letter-spacing:-.035em;line-height:1}
.show-wrap{position:relative;width:100%}
.show-wrap::before{content:'';position:absolute;inset:6% -4% -6% 4%;border-radius:32px;background:radial-gradient(circle at 50% 50%,rgba(245,200,66,.18),transparent 70%);filter:blur(30px);z-index:0;pointer-events:none}
.show{position:relative;z-index:1;aspect-ratio:5/4;width:100%;border-radius:24px;overflow:hidden;background:#1a1712;border:1px solid rgba(255,255,255,.1);box-shadow:0 30px 70px -20px rgba(0,0,0,.75)}
.show-shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(11,10,8,.94) 0%,rgba(11,10,8,.4) 38%,transparent 64%);pointer-events:none}
.show-cap{position:absolute;left:0;right:0;bottom:0;padding:clamp(14px,2.4vw,24px);display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
.show-meta{min-width:0}
.show-name{font-size:clamp(17px,2.4vw,24px);font-weight:700;letter-spacing:-.01em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.show-price{font-size:clamp(15px,2vw,18px);font-weight:800;color:var(--gold);margin-top:2px}
.show-count{position:absolute;top:14px;right:14px;z-index:2;font-size:12px;font-weight:600;letter-spacing:.04em;padding:5px 11px;border-radius:999px;background:rgba(11,10,8,.55);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12);font-variant-numeric:tabular-nums}
.show-tag{position:absolute;top:14px;left:14px;z-index:2}
.show-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:2;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(11,10,8,.55);backdrop-filter:blur(8px);color:var(--text);display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .2s,background .2s}
.show-arrow:hover{background:rgba(11,10,8,.8)}
.show-arrow.l{left:12px}
.show-arrow.r{right:12px}
.show:hover .show-arrow,.show-arrow:focus-visible{opacity:1}
.show-dots{display:flex;gap:6px;margin-top:10px}
.show-dot{height:6px;width:6px;border-radius:999px;border:0;padding:0;background:rgba(255,255,255,.35);cursor:pointer;transition:width .3s,background .3s}
.show-dot.on{width:22px;background:var(--gold)}
.show-skel{aspect-ratio:5/4;width:100%;border-radius:24px}

.dot.live{animation:pulse 2s infinite}
@keyframes sh{to{background-position:-200% 0}}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%,100%{box-shadow:0 0 0 7px rgba(34,197,94,0)}}

@media(hover:none){.show-arrow{opacity:.85;width:32px;height:32px}}
@media(max-width:900px){
  .hero-grid{grid-template-columns:minmax(0,1fr)}
  .show,.show-skel{aspect-ratio:16/10}
  .show-wrap{max-width:640px}
}
@media(max-width:768px){.links,.status.hide-m{display:none}.burger{display:flex}}
@media(max-width:560px){
  .show,.show-skel{aspect-ratio:4/3;border-radius:18px}
  .show-wrap::before{filter:blur(22px)}
  .show-cap .btn{padding:8px 14px}
  .section{margin-top:64px}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`

const Skel = ({ h }: { h: number }) => <div className="skel" style={{ height: h }} />

function Photo({ src, alt }: { src?: string; alt: string }) {
  const [bad, setBad] = useState(false)
  const [loaded, setLoaded] = useState(false)
  if (!src || bad) return <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 12 }}>No image</div>
  return <img ref={el => { if (el?.complete && el.naturalWidth > 0 && !loaded) setLoaded(true) }} className={loaded ? 'ld' : undefined} src={src} alt={alt} loading="lazy" onLoad={() => setLoaded(true)} onError={() => setBad(true)} />
}

// ── Hero slideshow ─────────────────────────────────────────────────────────
function HeroSlideshow({ slides, onOrder }: { slides: Product[]; onOrder: () => void }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduceMotion = useReducedMotion()
  const count = slides.length
  const current = slides[Math.min(index, count - 1)]

  // Warm the browser cache so slides don't flash blank at 1.5s speed
  useEffect(() => {
    slides.forEach(s => { const im = new Image(); im.src = s.img })
  }, [slides])

  // Autoplay: pauses on hover/focus, and is off for people who prefer reduced motion
  useEffect(() => {
    if (count < 2 || paused || reduceMotion) return
    const id = setInterval(() => setIndex(i => (i + 1) % count), SLIDE_MS)
    return () => clearInterval(id)
  }, [count, paused, reduceMotion])

  // Keep the index valid if the product list changes
  useEffect(() => { if (index >= count) setIndex(0) }, [count, index])

  const go = (dir: 1 | -1) => setIndex(i => (i + dir + count) % count)

  return (
    <motion.div className="show-wrap" initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}>
      <div
        className="show"
        role="region"
        aria-roledescription="carousel"
        aria-label="Featured menu items"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={current.id}
            className="thumb"
            style={{ position: 'absolute', inset: 0, aspectRatio: 'auto' }}
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <Photo src={current.img} alt={current.name} />
          </motion.div>
        </AnimatePresence>

        <div className="show-shade" />
        {current.badge && <span className="chip chip-gold show-tag">{current.badge}</span>}
        <span className="show-count" aria-hidden="true">{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>

        {count > 1 && (
          <>
            <button className="show-arrow l" onClick={() => go(-1)} aria-label="Previous item"><ChevronLeft size={18} /></button>
            <button className="show-arrow r" onClick={() => go(1)} aria-label="Next item"><ChevronRight size={18} /></button>
          </>
        )}

        <div className="show-cap" aria-live="off">
          <motion.div key={current.id} className="show-meta" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <p className="show-name">{current.name}</p>
            <p className="show-price">{fmt(current.price)}</p>
            {count > 1 && (
              <div className="show-dots">
                {slides.map((s, n) => (
                  <button key={s.id} className={`show-dot${n === index ? ' on' : ''}`} onClick={() => setIndex(n)} aria-label={`Show ${s.name}`} aria-current={n === index} />
                ))}
              </div>
            )}
          </motion.div>
          <button className="btn btn-gold" style={{ flexShrink: 0 }} onClick={onOrder}>Order now</button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Cards ──────────────────────────────────────────────────────────────────
function ProductCard({ p, onOrder, i }: { p: Product; onOrder: () => void; i: number }) {
  return (
    <motion.article className="card" {...reveal} custom={i} exit="exit" layout="position" whileHover={{ y: -4 }}>
      <div className="thumb">
        <Photo src={p.img} alt={p.name} />
        {p.badge && <span className="chip chip-gold" style={{ position: 'absolute', top: 12, left: 12 }}>{p.badge}</span>}
        {p.spicy && <span style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,.6)', borderRadius: '50%', width: 28, height: 28, display: 'grid', placeItems: 'center' }} aria-label="Spicy"><Flame size={14} color="#ef4444" /></span>}
      </div>
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{p.name}</h3>
          {p.rating > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--gold)' }}><Star size={12} fill="currentColor" />{p.rating.toFixed(1)}</span>}
        </div>
        {p.description && <p className="sub" style={{ fontSize: 13, flex: 1 }}>{p.description}</p>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{fmt(p.price)}</span>
          <button className="btn btn-gold" onClick={onOrder}>Order</button>
        </div>
      </div>
    </motion.article>
  )
}

function PromoCard({ p, i }: { p: Promo; i: number }) {
  const left = timeLeft(p.validUntil)
  return (
    <motion.article className="card" {...reveal} custom={i} whileHover={{ y: -4 }}>
      <div className="thumb" style={{ aspectRatio: '16/9' }}>
        <Photo src={p.img ? resolveAssetUrl(p.img) : ''} alt={p.title} />
        {p.badge && <span className="chip chip-gold" style={{ position: 'absolute', top: 12, left: 12 }}>{p.badge}</span>}
        {p.discount && <span className="chip chip-gold" style={{ position: 'absolute', bottom: 12, right: 12, fontSize: 13 }}>{p.discount}</span>}
      </div>
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700 }}>{p.title}</h3>
        {p.subtitle && <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--gold)' }}>{p.subtitle}</p>}
        <p className="sub" style={{ fontSize: 13 }}>{p.description}</p>
        {left && <span className="chip" style={{ alignSelf: 'flex-start', marginTop: 4, color: '#f87171' }}>{left}</span>}
      </div>
    </motion.article>
  )
}

function FlavorCard({ f, open, onToggle, i }: { f: Flavor; open: boolean; onToggle: () => void; i: number }) {
  return (
    <motion.div
      {...reveal}
      custom={i}
      layout="position"
      whileHover={open ? undefined : { y: -2 }}
      style={{
        gridColumn: open ? 'span 2' : 'span 1',
        border: `1px solid ${open ? 'rgba(255,255,255,.18)' : 'var(--line)'}`,
        borderRadius: 12,
        background: 'var(--card)',
        overflow: 'hidden',
        boxShadow: open ? '0 10px 30px rgba(0,0,0,.35)' : 'none',
        transition: 'border-color .2s, box-shadow .2s',
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: open ? 'rgba(255,255,255,.03)' : 'transparent', color: 'var(--text)', border: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
      >
        {f.name}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE }} style={{ display: 'flex', color: 'var(--muted)' }}>
          <ChevronDown size={15} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ overflow: 'hidden', borderTop: '1px solid var(--line)' }}
          >
            <div className="thumb" style={{ aspectRatio: '16/9' }}><Photo src={f.img ? resolveAssetUrl(f.img) : ''} alt={f.name} /></div>
            {f.desc && <p className="sub" style={{ padding: 14, fontSize: 13 }}>{f.desc}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function MenuCard({ s, i }: { s: MenuSection; i: number }) {
  return (
    <motion.div className="card" style={{ padding: 22 }} {...reveal} custom={i} whileHover={{ y: -3 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700 }}>{s.title}</h3>
      {s.subtext && <p className="sub" style={{ fontSize: 12.5, marginTop: 4 }}>{s.subtext}</p>}
      <div style={{ marginTop: 12 }}>
        {s.items.map(it => (
          <div key={`${s.id}-${it.name}-${it.price}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            {it.img && <div className="thumb" style={{ width: 40, height: 40, aspectRatio: '1', borderRadius: 8, flexShrink: 0 }}><Photo src={resolveAssetUrl(it.img)} alt={it.name} /></div>}
            <span style={{ flex: 1, fontSize: 14 }}>{it.name} {it.tag && <span className="chip chip-gold" style={{ marginLeft: 6 }}>{it.tag}</span>}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--gold)' }}>{fmt(it.price)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ── Feedback ───────────────────────────────────────────────────────────────
function FeedbackModal({ onClose, options, userId }: { onClose: () => void; options: { id: number; name: string }[]; userId: number | null }) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [message, setMessage] = useState('')
  const [productId, setProductId] = useState<number | null>(options[0]?.id ?? null)
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [err, setErr] = useState('')
  const text = message.trim()
  const can = productId !== null && rating > 0 && text.length > 0 && text.length <= MAX_FB

  const submit = async () => {
    if (!can) return
    setStatus('sending'); setErr('')
    try {
      await api.post('/feedback', { product_id: productId, customer_user_id: userId, rating, comment: text })
      setStatus('done')
    } catch (e: any) {
      setErr(e?.message || 'Could not send your feedback. Try again.')
      setStatus('error')
    }
  }

  return (
    <>
      <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 900 }} />
      <motion.div role="dialog" aria-label="Send feedback" initial={{ opacity: 0, y: 24, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .98 }} transition={{ duration: .25, ease: EASE }}
        style={{ position: 'fixed', zIndex: 901, right: 16, bottom: 80, width: 'min(400px,calc(100vw - 32px))', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', background: '#15130f', border: '1px solid var(--line)', borderRadius: 16, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div><p style={{ fontSize: 17, fontWeight: 700 }}>Send feedback</p><p className="sub" style={{ fontSize: 12.5 }}>Tell us how we did.</p></div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', height: 28 }}><X size={18} /></button>
        </div>
        {status === 'done' ? (
          <div style={{ textAlign: 'center', padding: '20px 0', display: 'grid', gap: 10, justifyItems: 'center' }}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} style={{ display: 'flex' }}><CheckCircle size={38} color="#22c55e" /></motion.div>
            <p style={{ fontWeight: 700 }}>Feedback sent</p>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <p className="sub" style={{ fontSize: 12, marginBottom: 6 }}>Rating</p>
              <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map(n => (
                  <motion.button key={n} whileHover={{ scale: 1.15 }} whileTap={{ scale: .9 }} aria-label={`${n} star${n > 1 ? 's' : ''}`} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} style={{ background: 'none', border: 0, cursor: 'pointer', lineHeight: 0 }}>
                    <Star size={26} color={n <= (hover || rating) ? '#f5c842' : 'rgba(255,255,255,.25)'} fill={n <= (hover || rating) ? '#f5c842' : 'none'} />
                  </motion.button>
                ))}
              </div>
            </div>
            <div>
              <p className="sub" style={{ fontSize: 12, marginBottom: 6 }}>Product</p>
              <select className="input" value={productId ?? ''} onChange={e => setProductId(+e.target.value || null)} disabled={!options.length || status === 'sending'}>
                {options.length === 0 ? <option value="">No products available</option> : options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <p className="sub" style={{ fontSize: 12, marginBottom: 6 }}>Comment</p>
              <textarea className="input" rows={4} maxLength={MAX_FB} value={message} onChange={e => setMessage(e.target.value)} placeholder="What did you like or dislike?" style={{ resize: 'none' }} />
              <p className="sub" style={{ fontSize: 11, textAlign: 'right', marginTop: 2 }}>{message.length}/{MAX_FB}</p>
            </div>
            {status === 'error' && <p role="alert" style={{ fontSize: 12.5, color: '#f87171' }}>{err}</p>}
            <button className="btn btn-gold" onClick={submit} disabled={!can || status === 'sending'} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12, opacity: can ? 1 : .45, cursor: can ? 'pointer' : 'not-allowed' }}>
              <Send size={14} />{status === 'sending' ? 'Sending…' : 'Send feedback'}
            </button>
          </div>
        )}
      </motion.div>
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
interface ProductsProps { isAuthenticated?: boolean; onLogout?: () => void }

export default function Products({ isAuthenticated = false, onLogout }: ProductsProps) {
  const navigate = useNavigate()
  const { isPhone } = useViewport()
  const { user } = useAuth()

  const [products, setProducts] = useState<Product[]>([])
  const [flavors, setFlavors] = useState<Flavor[]>([])
  const [sections, setSections] = useState<MenuSection[]>([])
  const [promos, setPromos] = useState<Promo[]>([])
  const [loading, setLoading] = useState({ p: true, f: true, m: true, r: true })
  const [category, setCategory] = useState<Category>('All')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const userId = isAuthenticated && user && Number(user.userId) > 0 ? Number(user.userId) : null

  useEffect(() => { void fetchGeneralSettings() }, [])

  useEffect(() => {
    const el = document.createElement('style')
    el.id = 'products-css'
    el.innerHTML = CSS
    document.head.appendChild(el)
    return () => el.remove()
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const check = () => {
      const n = new Date(), d = n.getDay(), t = n.getHours() + n.getMinutes() / 60
      setIsOpen((d >= 1 && d <= 5 && t >= 10 && t < 22) || ((d === 0 || d === 6) && t >= 11 && t < 20.5))
    }
    check()
    const id = setInterval(check, 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = <T,>(url: string, key: 'p' | 'f' | 'm' | 'r', set: (d: T[]) => void, map?: (d: unknown[]) => T[]) =>
      api.get<unknown[]>(url)
        .then((d: unknown) => { if (!cancelled) { const r = Array.isArray(d) ? d : []; set(map ? map(r) : (r as T[])) } })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(s => ({ ...s, [key]: false })) })
    load<Product>('/api/products?item_type=menu_item', 'p', setProducts, mapProducts)
    load<Flavor>('/api/flavors', 'f', setFlavors)
    load<MenuSection>('/api/menu-sections', 'm', setSections)
    load<Promo>('/api/promos', 'r', setPromos)
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(
    () => products.filter(p => (category === 'All' || p.category === category) && p.name.toLowerCase().includes(search.toLowerCase())),
    [products, category, search]
  )
  const feedbackOptions = useMemo(() => products.map(p => ({ id: p.id, name: p.name })), [products])
  // Hero slides: menu items that have a photo
  const slides = useMemo(() => products.filter(p => p.img).slice(0, MAX_SLIDES), [products])
  const showHeroSlides = loading.p || slides.length > 0

  const goOrder = useCallback(() => navigate('/usersmenu?showOrderModal=true'), [navigate])
  const logout = useCallback(() => { onLogout?.(); navigate('/products') }, [onLogout, navigate])

  // Home: go to /products, or scroll back to the top if we're already here
  const goHome = useCallback(() => {
    setMenuOpen(false)
    if (window.location.pathname === '/products') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      navigate('/products')
    }
  }, [navigate])

  const navLinks = [
    { label: 'Home', action: goHome },
    { label: 'Menu', action: goOrder },
    { label: 'About', action: () => navigate('/aboutthecrunch') },
  ]
  const featured = promos.filter(p => p.highlight)
  const regular = promos.filter(p => !p.highlight)

  return (
    <MotionConfig reducedMotion="user">
    <div className="pc">
      {/* NAVBAR — fixed, always visible while scrolling */}
      <motion.header initial={{ y: -NAV_H, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: .5, ease: EASE }} className={`nav ${scrolled || menuOpen ? 'on' : ''}`}>
        <div className="wrap nav-in">
          <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">
            <img src="/img/logo24.png" alt="" width={32} height={32} style={{ objectFit: 'contain' }} />
            {!isPhone && <span>The <span style={{ color: 'var(--gold)' }}>Crunch</span></span>}
          </button>

          <nav className="links" aria-label="Main">
            <span className="status" title="Store hours: Mon–Fri 10 AM–10 PM, Sat–Sun 11 AM–8:30 PM">
              <span className={`dot${isOpen ? ' live' : ''}`} style={{ background: isOpen ? '#22c55e' : '#ef4444' }} />
              {isOpen ? 'Open now' : 'Closed'}
            </span>
            {navLinks.map(l => <button key={l.label} className="link" onClick={l.action}>{l.label}</button>)}
            <span style={{ width: 1, height: 18, background: 'var(--line)', margin: '0 8px' }} />
            {isAuthenticated ? (
              <>
                {user?.username && <span className="status"><User size={14} />{user.username}</span>}
                <button className="btn btn-gold" onClick={logout}>Log out</button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={() => navigate('/login')}>Log in</button>
                <button className="btn btn-gold" style={{ marginLeft: 8 }} onClick={() => navigate('/login?tab=signup')}>Sign up</button>
              </>
            )}
          </nav>

          <button className="burger" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu" aria-expanded={menuOpen}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .2 }}
              style={{ position: 'absolute', top: NAV_H, left: 0, right: 0, background: 'rgba(11,10,8,.98)', borderBottom: '1px solid var(--line)', padding: '8px var(--pad) 18px', display: 'grid', gap: 4 }}>
              {navLinks.map(l => <button key={l.label} className="link" style={{ textAlign: 'left', fontSize: 15 }} onClick={() => { l.action(); setMenuOpen(false) }}>{l.label}</button>)}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {isAuthenticated ? (
                  <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => { logout(); setMenuOpen(false) }}>Log out</button>
                ) : (
                  <>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { navigate('/login'); setMenuOpen(false) }}>Log in</button>
                    <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => { navigate('/login?tab=signup'); setMenuOpen(false) }}>Sign up</button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* HERO — text on the left, product slideshow on the right (stacked on tablet and mobile) */}
      <section className="hero">
        <div className={`wrap hero-grid${showHeroSlides ? '' : ' solo'}`}>
          <div>
            <motion.p {...heroIn(0.05)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}><MapPin size={14} color="var(--gold)" />The Crunch, Fairview</motion.p>
            <motion.h1 {...heroIn(0.12)} className="hero-title">Our menu</motion.h1>
            <motion.p {...heroIn(0.2)} className="sub" style={{ marginTop: 14, maxWidth: 440, fontSize: 15 }}>Fresh, hot, and made to order. Browse the full menu and order when you're ready.</motion.p>
            <motion.div {...heroIn(0.28)} style={{ position: 'relative', marginTop: 28, maxWidth: 'min(100%, 420px)' }}>
              <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input className="input" style={{ paddingLeft: 40, paddingRight: 38 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search the menu" aria-label="Search the menu" />
              {search && <button onClick={() => setSearch('')} aria-label="Clear search" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>}
            </motion.div>
          </div>

          {showHeroSlides && (loading.p ? <div className="skel show-skel" /> : <HeroSlideshow slides={slides} onOrder={goOrder} />)}
        </div>
      </section>

      {/* CATEGORY TABS */}
      <div className="tabs">
        <div className="wrap tabs-in" role="tablist">
          {CATEGORIES.map(c => (
            <button key={c} role="tab" aria-selected={category === c} className={`tab ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
              {c}
              {category === c && <motion.span layoutId="tab-underline" transition={{ type: 'spring', stiffness: 400, damping: 34 }} style={{ position: 'absolute', left: 10, right: 10, bottom: 0, height: 2, background: 'var(--gold)', borderRadius: 2 }} />}
            </button>
          ))}
        </div>
      </div>

      <main className="wrap" style={{ paddingTop: 40, paddingBottom: 100 }}>
        {/* Products */}
        {loading.p ? (
          <div className="grid">{Array.from({ length: 6 }).map((_, i) => <Skel key={i} h={380} />)}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: 18, fontWeight: 700 }}>No items found</p>
            <p className="sub" style={{ marginTop: 4 }}>Try a different search or category.</p>
            {search && <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => setSearch('')}>Clear search</button>}
          </div>
        ) : (
          <>
            <p className="sub" style={{ fontSize: 13, marginBottom: 16 }}>{filtered.length} item{filtered.length !== 1 ? 's' : ''}</p>
            <div className="grid"><AnimatePresence>{filtered.map((p, i) => <ProductCard key={p.id} p={p} onOrder={goOrder} i={i} />)}</AnimatePresence></div>
          </>
        )}

        {/* Promos */}
        {(loading.r || promos.length > 0) && (
          <section className="section">
            <Reveal>
              <h2 className="h2">Deals and promos</h2>
              <p className="sub" style={{ marginTop: 8, marginBottom: 28 }}>Current offers and limited-time specials.</p>
            </Reveal>
            {loading.r ? (
              <div className="grid">{Array.from({ length: 3 }).map((_, i) => <Skel key={i} h={280} />)}</div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,320px),1fr))' }}>
                {[...featured, ...regular].map((p, i) => <PromoCard key={p.id} p={p} i={i} />)}
              </div>
            )}
          </section>
        )}

        {/* Flavors */}
        {(loading.f || flavors.length > 0) && (
          <section className="section">
            <Reveal>
              <h2 className="h2">Signature flavors</h2>
              <p className="sub" style={{ marginTop: 8, marginBottom: 28 }}>Available on every chicken order. Tap a flavor to preview it.</p>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, alignItems: 'start' }}>
              {loading.f
                ? Array.from({ length: 6 }).map((_, i) => <Skel key={i} h={46} />)
                : flavors.map((f, i) => <FlavorCard key={f.name} i={i} f={f} open={expanded === f.name} onToggle={() => setExpanded(expanded === f.name ? null : f.name)} />)}
            </div>
          </section>
        )}

        {/* Full menu */}
        {(loading.m || sections.length > 0) && (
          <section className="section">
            <Reveal>
              <h2 className="h2">Full menu</h2>
              <p className="sub" style={{ marginTop: 8, marginBottom: 28 }}>Everything we serve, by section.</p>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,420px),1fr))', gap: 20 }}>
              {loading.m ? Array.from({ length: 4 }).map((_, i) => <Skel key={i} h={300} />) : sections.map((s, i) => <MenuCard key={s.id} s={s} i={i} />)}
            </div>
          </section>
        )}
      </main>

      {/* FOOTER */}
      <motion.footer initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: .6 }} style={{ borderTop: '1px solid var(--line)', padding: '40px 0 28px' }}>
        <div className="wrap">
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 28 }}>
            <div>
              <p style={{ fontWeight: 800, fontSize: 17 }}>The <span style={{ color: 'var(--gold)' }}>Crunch</span></p>
              <p className="sub" style={{ marginTop: 6, fontSize: 13 }}>6 Falcon St., cor Dahlia Fairview,<br />Quezon City, Philippines</p>
              <a href="https://www.google.com/maps/place/The+Crunch+-+Fairview+Branch/@14.7002687,121.0662915,21z" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 13, fontWeight: 600, color: 'var(--gold)', textDecoration: 'none' }}>
                <MapPin size={14} />View on Google Maps
              </a>
            </div>
            <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
              <p className="sub" style={{ fontSize: 12 }}>Follow us</p>
              <a className="link" style={{ padding: 0, textDecoration: 'none' }} href="https://www.instagram.com/thecrunchfairview" target="_blank" rel="noopener noreferrer">Instagram</a>
              <a className="link" style={{ padding: 0, textDecoration: 'none' }} href="https://www.facebook.com/thecrunchfairview" target="_blank" rel="noopener noreferrer">Facebook</a>
            </div>
            <div>
              <p className="sub" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={13} />Hours</p>
              <p className="sub" style={{ marginTop: 6, fontSize: 13 }}>Mon–Fri: 10 AM – 10 PM<br />Sat–Sun: 11 AM – 8:30 PM</p>
            </div>
          </div>
          <p className="sub" style={{ marginTop: 32, paddingTop: 18, borderTop: '1px solid var(--line)', fontSize: 12, textAlign: 'center' }}>© {new Date().getFullYear()} The Crunch Fairview. All rights reserved.</p>
        </div>
      </motion.footer>

      {/* FEEDBACK */}
      <AnimatePresence>{feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} options={feedbackOptions} userId={userId} />}</AnimatePresence>
      <motion.button className="btn btn-gold fixed-btn" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1, type: 'spring', stiffness: 260, damping: 20 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} style={{ display: 'flex', alignItems: 'center', gap: 7, borderRadius: 999, padding: '11px 18px', boxShadow: '0 6px 24px rgba(0,0,0,.4)' }} onClick={() => setFeedbackOpen(v => !v)}>
        <MessageSquare size={15} />{feedbackOpen ? 'Close' : 'Feedback'}
      </motion.button>
    </div>
    </MotionConfig>
  )
}