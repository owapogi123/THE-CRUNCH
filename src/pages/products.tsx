import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import { Search, Star, Flame, Crown, Sparkles, Clock, ChevronRight, ChevronDown } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const NAV_H    = 68   // px  – nav bar height
const BANNER_H = 44   // px  – hours banner height
const TAB_TOP  = NAV_H + BANNER_H  // 112

const CATEGORIES = ['All', 'Chicken', 'Sides', 'Drinks', 'Combos']

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface Product {
  id: number
  name: string
  category: string
  rating: number
  badge: string
  description: string
  spicy: boolean
  img: string
}

interface MenuItem {
  name: string
  price: number
  tag?: string
  note?: string
}

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */
const STATIC_PRODUCTS: Product[] = [
  { id: 1, name: 'Whole Fried Chicken',              category: 'Chicken', rating: 4.9, badge: 'Bestseller', description: 'Our signature boneless fried chicken — ultra-crispy, juicy inside.',  spicy: false, img: 'https://bit.ly/4ckRqHY'   },
  { id: 2, name: 'Half Fried Chicken',               category: 'Chicken', rating: 4.8, badge: 'Hot',        description: 'All the crunch you love, with a fiery kick that lingers.',            spicy: true,  img: 'https://bit.ly/3P8sz0j'   },
  { id: 3, name: 'Crispy Chicken Shots with Drink',  category: 'Chicken', rating: 4.7, badge: 'New',        description: 'Tossed in rich garlic butter sauce. Dangerously good.',                spicy: false, img: 'https://bit.ly/40Z9n7T'  },
  { id: 4, name: 'Chicken Skin with Rice and Drink', category: 'Sides',   rating: 4.5, badge: '',           description: 'Creamy, crunchy, refreshing. The perfect sidekick.',                 spicy: false, img: 'https://bit.ly/3P6DcAK'  },
  { id: 5, name: '3pcs Fried Chicken with Rice',     category: 'Sides',   rating: 4.6, badge: 'Fan Fave',   description: 'Seasoned shoestring fries with our secret crunch dust.',              spicy: false, img: 'https://surl.li/wdwndi'  },
  { id: 6, name: '1pc Fried Chicken With Rice',      category: 'Drinks',  rating: 4.4, badge: '',           description: 'House-brewed milk tea, the perfect cool-down companion.',            spicy: false, img: 'https://surl.lt/rckddk'  },
  { id: 7, name: '2pcs Fried Chicken With Rice',     category: 'Combos',  rating: 4.9, badge: 'Best Value', description: 'Classic Crunch + Fries + Drink. The full experience.',               spicy: false, img: 'https://surl.li/dwocmt'  },
  { id: 8, name: 'Spicy Combo B',                    category: 'Combos',  rating: 4.8, badge: 'Hot Deal',   description: 'Spicy Crunch + Coleslaw + Iced Tea. Dare to combo.',                 spicy: true,  img: 'https://bit.ly/3P8sz0j'  },
]

const BADGE_CONFIG: Record<string, string> = {
  'Bestseller': 'linear-gradient(135deg,#f97316,#ea580c)',
  'Hot':        'linear-gradient(135deg,#ef4444,#dc2626)',
  'Hot Deal':   'linear-gradient(135deg,#ef4444,#dc2626)',
  'New':        'linear-gradient(135deg,#8b5cf6,#7c3aed)',
  'Fan Fave':   'linear-gradient(135deg,#16a34a,#15803d)',
  'Best Value': 'linear-gradient(135deg,#0284c7,#0369a1)',
}

const RICE_MEALS: MenuItem[] = [
  { name: '1 pc. Chicken',     price: 80  },
  { name: '2 pcs. Chicken',    price: 135 },
  { name: '3 pcs. Chicken',    price: 185, tag: 'Must Try' },
  { name: 'Chicken Skin',      price: 70  },
  { name: 'Chicken Shots',     price: 75  },
]

const SIDES: MenuItem[] = [
  { name: 'Kimchi',                       price: 45  },
  { name: 'Fishcake',                     price: 85  },
  { name: 'Tteokbokki',                   price: 85  },
  { name: 'Classic Chicken Skin Bucket',  price: 140, tag: 'Must Try' },
  { name: 'Flavored Chicken Skin Bucket', price: 140 },
  { name: 'Chicken Shots Bucket',         price: 160 },
  { name: 'Twister Fries',                price: 140, tag: 'Must Try' },
  { name: 'The Crunch Burger',            price: 80,  tag: 'Must Try', note: '+₱5 with cheese' },
]

const FRUIT_SODA: MenuItem[] = [
  { name: 'Strawberry',  price: 70 },
  { name: 'Green Apple', price: 70 },
  { name: 'Kiwi',        price: 70 },
  { name: 'Lychee',      price: 70 },
  { name: 'Mango',       price: 70 },
  { name: 'Blueberry',   price: 70 },
]

interface FlavorItem {
  name: string
  emoji: string
  color: string
  border: string
  accent: string
  desc: string
  img: string
}

const SIGNATURE_FLAVORS: FlavorItem[] = [
  {
    name: 'Classic',
    emoji: '',
    color: 'rgba(251,191,36,0.08)',
    border: 'rgba(251,191,36,0.2)',
    accent: '#fbbf24',
    desc: 'Golden, lightly seasoned, perfectly crispy — the OG.',
    img: 'https://url-shortener.me/HH43',
  },
  {
    name: 'Honey Garlic',
    emoji: '',
    color: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.2)',
    accent: '#f59e0b',
    desc: 'Sweet honey meets bold roasted garlic. Sticky & addictive.',
    img: 'https://url-shortener.me/HH3Z',
  },
  {
    name: 'Teriyaki',
    emoji: '',
    color: 'rgba(139,92,246,0.08)',
    border: 'rgba(139,92,246,0.2)',
    accent: '#8b5cf6',
    desc: 'Savory-sweet Japanese glaze with a glossy caramel finish.',
    img: 'https://url-shortener.me/HH44',
  },
  {
    name: 'Texas BBQ',
    emoji: '',
    color: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.2)',
    accent: '#ef4444',
    desc: 'Smoky, tangy, rich — slow-cooked BBQ vibes in every bite.',
    img: 'https://url-shortener.me/HH47',
  },
  {
    name: 'Garlic Parmesan',
    emoji: '',
    color: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.12)',
    accent: '#e5e7eb',
    desc: 'Creamy parmesan dusted over buttery garlic-coated chicken.',
    img: 'https://url-shortener.me/HH49',
  },
  {
    name: 'K-Style',
    emoji: '',
    color: 'rgba(249,115,22,0.08)',
    border: 'rgba(249,115,22,0.2)',
    accent: '#f97316',
    desc: 'Korean-inspired sweet chili glaze with a punchy depth.',
    img: 'https://url-shortener.me/HH4C',
  },
  {
    name: 'Spicy K-Style',
    emoji: '',
    color: 'rgba(220,38,38,0.08)',
    border: 'rgba(220,38,38,0.2)',
    accent: '#dc2626',
    desc: 'K-Style cranked up — fiery heat that builds with every piece.',
    img: 'https://url-shortener.me/HH4G',
  },
]

/* ─────────────────────────────────────────────
   SMALL COMPONENTS
───────────────────────────────────────────── */
function RatingStars({ rating }: { rating: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[1,2,3,4,5].map((s) => (
        <Star
          key={s} size={11}
          fill={s <= Math.round(rating) ? '#f97316' : 'transparent'}
          color={s <= Math.round(rating) ? '#f97316' : 'rgba(255,255,255,0.2)'}
        />
      ))}
      <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginLeft: 5 }}>{rating}</span>
    </div>
  )
}

function FloatingOrbs() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-10%', left: '15%',   width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle,rgba(249,115,22,0.07) 0%,transparent 65%)' }} />
      <div style={{ position: 'absolute', top: '40%',  right: '-5%',  width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle,rgba(234,88,12,0.05)  0%,transparent 65%)' }} />
      <div style={{ position: 'absolute', bottom:'-10%',left: '35%',  width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle,rgba(249,115,22,0.06) 0%,transparent 65%)' }} />
    </div>
  )
}

function MenuRow({ item, index }: { item: MenuItem; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{item.name}</span>
        {item.tag && (
          <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
            {item.tag}
          </span>
        )}
        {item.note && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' as const }}>{item.note}</span>
        )}
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#f97316', flexShrink: 0, marginLeft: 16 }}>₱{item.price}</span>
    </motion.div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
      <h3 style={{ margin: 0, fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
        {children}
      </h3>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
    </div>
  )
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */
export default function Products() {
  const navigate = useNavigate()

  const [products, setProducts]   = useState<Product[]>(STATIC_PRODUCTS)
  const [category, setCategory]   = useState('All')
  const [search, setSearch]       = useState('')
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [isOpen, setIsOpen]             = useState(false)
  const [expandedFlavor, setExpandedFlavor] = useState<string | null>(null)

  const heroRef             = useRef<HTMLDivElement>(null)
  const { scrollY }         = useScroll()
  const heroY               = useTransform(scrollY, [0, 400], [0, 60])
  const heroOpacity         = useTransform(scrollY, [0, 350], [1, 0.5])

  /* Check opening hours */
  useEffect(() => {
    const check = () => {
      const now  = new Date()
      const day  = now.getDay()
      const h    = now.getHours()
      const m    = now.getMinutes()
      const t    = h + m / 60
      const wday = day >= 1 && day <= 5
      const wend = day === 0 || day === 6
      setIsOpen((wday && t >= 10 && t < 22) || (wend && t >= 11 && t < 20.5))
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [])

  /* Fetch products from API (fallback to static) */
  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((data: Product[]) => { if (data?.length) setProducts(data) })
      .catch(() => {})
  }, [])

  const filtered = products.filter((p) => {
    const matchCat    = category === 'All' || p.category === category
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const topPick = filtered.find((p) => p.badge === 'Bestseller') ?? filtered[0]

  /* ── shared button style ── */
  const orderBtn: React.CSSProperties = {
    background:   'linear-gradient(135deg,#f97316,#ea580c)',
    border:       'none',
    borderRadius: 30,
    padding:      '10px 24px',
    fontSize:     13,
    fontWeight:   700,
    color:        '#fff',
    cursor:       'pointer',
    fontFamily:   'inherit',
    whiteSpace:   'nowrap',
    boxShadow:    '0 4px 16px rgba(249,115,22,0.35)',
    letterSpacing:'0.01em',
  }

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <div style={{ fontFamily: "'DM Sans','Poppins',sans-serif", background: '#0a0a0a', minHeight: '100vh', position: 'relative' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Playfair+Display:wght@700;800;900&display=swap" rel="stylesheet" />
      <FloatingOrbs />

      {/* ══════════════════ NAV ══════════════════ */}
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0,   opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22,1,0.36,1] }}
        style={{
          position: 'sticky', top: 0, zIndex: 200,
          height: NAV_H,
          background: 'rgba(10,10,10,0.92)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center',
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#f97316,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(249,115,22,0.4)', flexShrink: 0 }}>
              <Flame size={18} color="#fff" />
            </div>
            <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 800, fontSize: 20, color: '#fff', letterSpacing: '-0.02em' }}>
              The <span style={{ color: '#f97316' }}>Crunch</span>
            </span>
          </Link>

          {/* Nav links */}
          <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {(['Home','Menu','About'] as const).map((item, i) => (
              <Link
                key={item}
                to={['/','/usersmenu','/aboutthecrunch'][i]}
                style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, textDecoration: 'none', fontWeight: 500, padding: '8px 16px', borderRadius: 10, transition: 'all 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color='#fff'; e.currentTarget.style.background='rgba(255,255,255,0.07)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color='rgba(255,255,255,0.5)'; e.currentTarget.style.background='transparent' }}
              >{item}</Link>
            ))}

            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 6px' }} />

            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/login')}
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.11)', borderRadius: 10, padding: '8px 20px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              Log In
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/login')}
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', border: 'none', borderRadius: 10, padding: '9px 22px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(249,115,22,0.4)' }}>
              Sign Up
            </motion.button>
          </nav>
        </div>
      </motion.header>

      {/* ══════════════════ HOURS BANNER ══════════════════ */}
      <div
        style={{
          position: 'sticky',
          top: NAV_H,
          zIndex: 190,
          height: BANNER_H,
          background: 'rgba(18,10,4,0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(249,115,22,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, flexWrap: 'wrap',
          overflow: 'hidden',
          padding: '0 40px',
        }}
      >
        {/* shimmer sweep */}
        <motion.div
          animate={{ x: ['-120%','220%'] }}
          transition={{ duration: 4, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
          style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', background: 'linear-gradient(90deg,transparent,rgba(249,115,22,0.07),transparent)', pointerEvents: 'none' }}
        />

        {/* Open / Closed pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: isOpen ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${isOpen ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`, borderRadius: 30, padding: '4px 14px', flexShrink: 0 }}>
          <motion.div
            animate={{ scale: [1,1.4,1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            style={{ width: 7, height: 7, borderRadius: '50%', background: isOpen ? '#22c55e' : '#ef4444' }}
          />
          <span style={{ fontSize: 11, fontWeight: 700, color: isOpen ? '#22c55e' : '#ef4444', letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>
            {isOpen ? 'Open Now' : 'Closed'}
          </span>
        </div>

        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
        <Clock size={13} color="#f97316" style={{ flexShrink: 0 }} />

        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 500, whiteSpace: 'nowrap' as const }}>
          <span style={{ color: '#fff', fontWeight: 700 }}>Mon – Fri</span>
          {'\u00A0\u00A0'}10:00 AM – 10:00 PM
        </span>

        <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(249,115,22,0.6)', flexShrink: 0 }} />

        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 500, whiteSpace: 'nowrap' as const }}>
          <span style={{ color: '#fff', fontWeight: 700 }}>Sat – Sun</span>
          {'\u00A0\u00A0'}11:00 AM – 8:30 PM
        </span>
      </div>

      {/* ══════════════════ HERO ══════════════════ */}
      <div ref={heroRef} style={{ position: 'relative', overflow: 'hidden', padding: '88px 40px 64px' }}>
        <motion.div style={{ maxWidth: 1280, margin: '0 auto', y: heroY, opacity: heroOpacity }}>

          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.22)', borderRadius: 30, padding: '6px 16px', marginBottom: 28 }}
          >
            <Sparkles size={13} color="#f97316" />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>The Crunch Fairview</span>
          </motion.div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 40 }}>
            <div>
              <motion.h1
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.22,1,0.36,1] }}
                style={{ fontFamily: "'Playfair Display',serif", fontSize: 'clamp(52px,7vw,96px)', fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.0, letterSpacing: '-0.03em' }}
              >
                Our<br />
                <span style={{ WebkitTextStroke: '2px #f97316', color: 'transparent' }}>Products</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, margin: '20px 0 0', maxWidth: 400, lineHeight: 1.75 }}
              >
                Fresh, hot, and fan-favorite — discover what makes The Crunch unforgettable.
              </motion.p>
            </div>

            {/* Search */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }}
              style={{ position: 'relative', width: 340 }}
            >
              <Search size={15} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.28)', zIndex: 1, pointerEvents: 'none' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the menu..."
                style={{ width: '100%', padding: '14px 18px 14px 46px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.09)', fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', boxSizing: 'border-box', fontFamily: 'inherit', color: '#fff', transition: 'border-color 0.2s,background 0.2s' }}
                onFocus={(e) => { e.target.style.borderColor='rgba(249,115,22,0.45)'; e.target.style.background='rgba(255,255,255,0.08)' }}
                onBlur={(e)  => { e.target.style.borderColor='rgba(255,255,255,0.09)'; e.target.style.background='rgba(255,255,255,0.05)' }}
              />
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* ══════════════════ CATEGORY TABS ══════════════════ */}
      <div style={{
        position: 'sticky',
        top: TAB_TOP,   // 68 + 44 = 112
        zIndex: 180,
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', display: 'flex', gap: 2, overflowX: 'auto' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{ position: 'relative', padding: '17px 24px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', whiteSpace: 'nowrap', color: category === cat ? '#f97316' : 'rgba(255,255,255,0.35)', transition: 'color 0.2s' }}
            >
              {cat}
              {category === cat && (
                <motion.div
                  layoutId="tabIndicator"
                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#f97316,#ea580c)', borderRadius: '2px 2px 0 0' }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════ MAIN CONTENT ══════════════════ */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '60px 40px 100px', position: 'relative', zIndex: 1 }}>

        {/* TOP PICK banner */}
        {!search && topPick && (
          <motion.div
            initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22,1,0.36,1] }}
            style={{ marginBottom: 72, borderRadius: 32, overflow: 'hidden', position: 'relative', height: 440, cursor: 'pointer' }}
            whileHover="hovered"
          >
            <motion.img
              src={topPick.img} alt={topPick.name}
              variants={{ hovered: { scale: 1.05 } }} transition={{ duration: 0.7 }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(1.1) saturate(1.25) contrast(1.05)' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,rgba(0,0,0,0.9) 0%,rgba(0,0,0,0.5) 45%,rgba(0,0,0,0.05) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(249,115,22,0.15) 0%,transparent 50%)' }} />

            <div style={{ position: 'absolute', top: 40, left: 48 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 30, padding: '6px 16px' }}>
                <Crown size={12} color="#f97316" />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#f97316', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>Top Pick</span>
              </div>
            </div>

            <div style={{ position: 'absolute', bottom: 52, left: 52, right: 52 }}>
              <motion.h2
                variants={{ hovered: { x: 6 } }} transition={{ duration: 0.3 }}
                style={{ fontFamily: "'Playfair Display',serif", margin: '0 0 10px', fontSize: 'clamp(30px,4vw,56px)', fontWeight: 900, color: '#fff', lineHeight: 1.05, letterSpacing: '-0.025em' }}
              >
                {topPick.name}
              </motion.h2>
              <p style={{ margin: '0 0 22px', fontSize: 15, color: 'rgba(255,255,255,0.6)', maxWidth: 500, lineHeight: 1.7 }}>
                {topPick.description}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <RatingStars rating={topPick.rating} />
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{topPick.category}</span>
                <motion.button
                  whileHover={{ scale: 1.04, boxShadow: '0 12px 36px rgba(249,115,22,0.55)' }}
                  whileTap={{ scale: 0.96 }}
                  style={{ ...orderBtn, marginLeft: 'auto', padding: '12px 28px', fontSize: 14 }}
                >
                  Order Now
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Item count row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
        </div>

        {/* ── PRODUCT GRID ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={category + search}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 22 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          >
            {filtered.map((p, i) => {
              const badgeBg = BADGE_CONFIG[p.badge] ?? null
              const isHov   = hoveredId === p.id
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.055, duration: 0.5, ease: [0.22,1,0.36,1] }}
                  onHoverStart={() => setHoveredId(p.id)}
                  onHoverEnd={()   => setHoveredId(null)}
                  whileHover={{ y: -10 }}
                  style={{
                    background:   'rgba(255,255,255,0.04)',
                    borderRadius: 24,
                    overflow:     'hidden',
                    border:       `1.5px solid ${isHov ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.07)'}`,
                    boxShadow:    isHov ? '0 24px 60px rgba(0,0,0,0.6),0 0 0 1px rgba(249,115,22,0.1)' : 'none',
                    cursor:       'pointer',
                    transition:   'border-color 0.3s,box-shadow 0.3s',
                  }}
                >
                  {/* Image */}
                  <div style={{ position: 'relative', height: 240, overflow: 'hidden', background: '#1a1008' }}>
                    <motion.img
                      src={p.img} alt={p.name}
                      animate={{ scale: isHov ? 1.08 : 1 }}
                      transition={{ duration: 0.55, ease: [0.22,1,0.36,1] }}
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        filter: isHov
                          ? 'brightness(1.15) saturate(1.4) contrast(1.08)'
                          : 'brightness(1.05) saturate(1.2) contrast(1.04)',
                        transition: 'filter 0.4s ease',
                      }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,transparent 45%,rgba(0,0,0,0.72))' }} />
                    {isHov && (
                      <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(249,115,22,0.08),transparent)' }}
                      />
                    )}

                    {/* Badge */}
                    {badgeBg && (
                      <span style={{ position: 'absolute', top: 14, left: 14, background: badgeBg, color: '#fff', fontSize: 10, fontWeight: 800, padding: '5px 12px', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase' as const, boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }}>
                        {p.badge}
                      </span>
                    )}

                    {/* Spicy indicator */}
                    {p.spicy && (
                      <motion.div
                        animate={{ rotate: isHov ? [0,-12,12,0] : 0 }} transition={{ duration: 0.45 }}
                        style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}
                      >
                        <Flame size={15} color="#ef4444" />
                      </motion.div>
                    )}

                    {/* Rating pill */}
                    <div style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', borderRadius: 30, padding: '5px 11px', display: 'flex', alignItems: 'center', gap: 5, border: '1px solid rgba(255,255,255,0.07)' }}>
                      <Star size={11} fill="#f97316" color="#f97316" />
                      <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{p.rating}</span>
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ padding: '20px 22px 22px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.35, letterSpacing: '-0.01em' }}>{p.name}</h3>
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.07)', marginTop: 2 }}>
                        {p.category}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 18px', fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.65 }}>{p.description}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <RatingStars rating={p.rating} />
                      <motion.button
                        whileHover={{ scale: 1.05, boxShadow: '0 6px 24px rgba(249,115,22,0.5)' }}
                        whileTap={{ scale: 0.95 }}
                        style={orderBtn}
                      >
                        Order
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        </AnimatePresence>

        {/* Empty state */}
        {filtered.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', padding: '120px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🍗</div>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 8px' }}>Nothing found</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.25)' }}>Try a different search or category</p>
          </motion.div>
        )}

        {/* ══════════════════ SIGNATURE FLAVORS ══════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.22,1,0.36,1] }}
          style={{ marginTop: 96 }}
        >
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 30, padding: '6px 16px', marginBottom: 20 }}>
              <Sparkles size={13} color="#f97316" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Available in every chicken</span>
            </div>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 'clamp(32px,4vw,52px)', fontWeight: 900, color: '#fff', margin: '0 0 12px', letterSpacing: '-0.02em' }}>
              Signature <span style={{ WebkitTextStroke: '1.5px #f97316', color: 'transparent' }}>Flavors</span>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)', maxWidth: 420, margin: '0 auto' }}>
              Click any flavor to see what it looks like. Pick your favorite.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(175px,1fr))', gap: 12 }}>
            {SIGNATURE_FLAVORS.map((f, i) => {
              const isExpanded = expandedFlavor === f.name
              return (
                <motion.div
                  key={f.name}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.45 }}
                  style={{ gridColumn: isExpanded ? 'span 2' : 'span 1' }}
                >
                  {/* Card button */}
                  <motion.button
                    onClick={() => setExpandedFlavor(isExpanded ? null : f.name)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      width: '100%',
                      background: isExpanded
                        ? `linear-gradient(135deg, ${f.color}, rgba(0,0,0,0.3))`
                        : f.color,
                      border: `1px solid ${isExpanded ? f.accent : f.border}`,
                      borderRadius: isExpanded ? '20px 20px 0 0' : 20,
                      padding: '18px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all 0.25s',
                      boxShadow: isExpanded ? `0 0 24px ${f.accent}22` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 26, lineHeight: 1 }}>{f.emoji}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{f.name}</span>
                    </div>
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <ChevronDown size={16} color={isExpanded ? f.accent : 'rgba(255,255,255,0.35)'} />
                    </motion.div>
                  </motion.button>

                  {/* Dropdown preview */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        key="preview"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.35, ease: [0.22,1,0.36,1] }}
                        style={{
                          overflow: 'hidden',
                          border: `1px solid ${f.accent}`,
                          borderTop: 'none',
                          borderRadius: '0 0 20px 20px',
                          background: 'rgba(10,8,5,0.97)',
                        }}
                      >
                        <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
                          <img
                            src={f.img}
                            alt={f.name}
                            style={{
                              width: '100%', height: '100%', objectFit: 'cover',
                              filter: 'brightness(0.9) saturate(1.3) contrast(1.05)',
                            }}
                          />
                          {/* gradient scrim */}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,8,5,0.95) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)' }} />
                          {/* accent color tint */}
                          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${f.accent}18, transparent 60%)` }} />

                          {/* Flavor name overlay */}
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 22 }}>{f.emoji}</span>
                              <span style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{f.name}</span>
                              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: f.accent, color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                                Flavor
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>{f.desc}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* ══════════════════ FULL MENU ══════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.22,1,0.36,1] }}
          style={{ marginTop: 96 }}
        >
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 30, padding: '6px 16px', marginBottom: 20 }}>
              <ChevronRight size={13} color="#f97316" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Full Menu</span>
            </div>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 'clamp(32px,4vw,52px)', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
              Everything <span style={{ WebkitTextStroke: '1.5px #f97316', color: 'transparent' }}>We Offer</span>
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 28 }}>
            {/* Rice Meals */}
            <motion.div
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5 }}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.07)', borderRadius: 24, padding: '32px 28px' }}
            >
              <SectionLabel>Rice Meals</SectionLabel>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '0 0 16px', fontStyle: 'italic' as const, letterSpacing: '0.04em' }}>Choice of Original or Spicy</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {['Original','Spicy 🔥'].map((opt) => (
                  <span key={opt} style={{ fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 20, background: opt === 'Spicy 🔥' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.07)', border: `1px solid ${opt === 'Spicy 🔥' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`, color: opt === 'Spicy 🔥' ? '#ef4444' : 'rgba(255,255,255,0.6)' }}>
                    {opt}
                  </span>
                ))}
              </div>
              {RICE_MEALS.map((item, i) => <MenuRow key={item.name} item={item} index={i} />)}
            </motion.div>

            {/* Sides */}
            <motion.div
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.07)', borderRadius: 24, padding: '32px 28px' }}
            >
              <SectionLabel>Sides</SectionLabel>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '0 0 20px', fontStyle: 'italic' as const, letterSpacing: '0.04em' }}>Perfect add-ons to any meal</p>
              {SIDES.map((item, i) => <MenuRow key={item.name} item={item} index={i} />)}
            </motion.div>

            {/* Fruit Soda */}
            <motion.div
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.2 }}
              style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.07)', borderRadius: 24, padding: '32px 28px' }}
            >
              <SectionLabel>Fruit Soda</SectionLabel>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '0 0 20px', fontStyle: 'italic' as const, letterSpacing: '0.04em' }}>All flavors — ₱70 each</p>
              {FRUIT_SODA.map((item, i) => <MenuRow key={item.name} item={item} index={i} />)}
            </motion.div>
          </div>
        </motion.div>

      </div>{/* end main content */}
    </div>
  )
} 