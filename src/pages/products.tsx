import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  motion, AnimatePresence, useScroll, useTransform, useInView, type Variants,
} from 'framer-motion'
import { Search, Flame, Crown, Clock, ChevronDown, Droplets, MapPin, Star, X, Tag, CalendarDays, MessageSquare, Send, CheckCircle } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'


// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const NAV_H    = 64
const BANNER_H = 42
const TAB_TOP  = NAV_H + BANNER_H

const CATEGORIES = ['All', 'Chicken', 'Sides', 'Drinks', 'Combos'] as const
type Category = typeof CATEGORIES[number]

const PLACEHOLDER = '/placeholder.jpg'
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface Product {
  id:          number
  name:        string
  menuName:    string
  category:    Category
  rating:      number
  badge:       string
  description: string
  price:       number
  spicy:       boolean
  img:         string
  isDrink?:    boolean
}

interface FlavorItem {
  name:   string
  accent: string
  desc:   string
  img:    string
}

interface MenuItem {
  name:   string
  price:  number
  tag?:   string
  note?:  string
  img?:   string
}

interface MenuSection {
  id:      string
  title:   string
  subtext?: string
  pills?:  { label: string; spicy: boolean }[]
  items:   MenuItem[]
  isDrink?: boolean
}

interface Promo {
  id:          string
  title:       string
  subtitle?:   string
  description: string
  img:         string
  badge?:      string
  badgeColor?: string
  eventDate?:  string
  validUntil?: string
  tag?:        string
  highlight?:  boolean
  discount?:   string
}

interface FeedbackPayload {
  product_id: number
  customer_user_id: number | null
  rating: number
  comment: string
}

// ─────────────────────────────────────────────
// Motion variants
// ─────────────────────────────────────────────
const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 40 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.09, duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  }),
}

const stagger: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06 } },
}

// ─────────────────────────────────────────────
// Badge config
// ─────────────────────────────────────────────
const BADGE_CONFIG: Record<string, { label: string; bg: string; textDark?: boolean }> = {
  'Bestseller': { label: 'Bestseller', bg: '#f5c842', textDark: true },
  'Hot':        { label: 'Hot',        bg: '#ef4444' },
  'New':        { label: 'New',        bg: '#8b5cf6' },
  'Fan Fave':   { label: 'Fan Fave',   bg: '#16a34a' },
  'Best Value': { label: 'Best Value', bg: '#0284c7' },
  'Must Try':   { label: 'Must Try',   bg: '#7c3aed' },
}

// ─────────────────────────────────────────────
// Promo helpers
// ─────────────────────────────────────────────
function getCountdown(dateStr: string): string | null {
  const target = new Date(dateStr)
  const now    = new Date()
  const diff   = target.getTime() - now.getTime()
  if (diff <= 0) return null
  const days  = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 30) return null
  if (days > 0)  return `${days}d ${hours}h left`
  return `${hours}h left`
}

function formatEventDate(dateStr: string): { day: string; month: string } {
  const d = new Date(dateStr)
  return {
    day:   String(d.getDate()).padStart(2, '0'),
    month: MONTH_LABELS[d.getMonth()],
  }
}

// ─────────────────────────────────────────────
// Skeleton loader
// ─────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div style={{
      borderRadius: 24, overflow: 'hidden',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{
        height: 240, background: 'rgba(255,255,255,0.05)',
        position: 'relative', overflow: 'hidden',
      }}>
        <motion.div
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.4 }}
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)',
          }}
        />
      </div>
      <div style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[80, 60, 100].map((w, i) => (
          <div key={i} style={{
            height: i === 0 ? 16 : 10, width: `${w}%`,
            borderRadius: 6, background: 'rgba(255,255,255,0.06)',
            position: 'relative', overflow: 'hidden',
          }}>
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15, repeatDelay: 0.4 }}
              style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.05),transparent)' }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Reveal wrapper
// ─────────────────────────────────────────────
function Reveal({ children, custom = 0, style = {} }: {
  children: React.ReactNode; custom?: number; style?: React.CSSProperties
}) {
  const ref      = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      custom={custom}
      style={style}
    >
      {children}
    </motion.div>
  )
}

// ─────────────────────────────────────────────
// Menu row
// ─────────────────────────────────────────────
function MenuRow({ item, index }: { item: MenuItem; index: number }) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError]   = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div style={{
        width: 50, height: 50, borderRadius: 12, overflow: 'hidden',
        flexShrink: 0, background: '#1a1208',
        border: '1px solid rgba(255,255,255,0.08)',
        position: 'relative',
      }}>
        {!imgLoaded && !imgError && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.05)' }}>
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent)' }}
            />
          </div>
        )}
        <img
          src={imgError ? PLACEHOLDER : (item.img || PLACEHOLDER)}
          alt={item.name}
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgError(true); setImgLoaded(true) }}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.3s',
          }}
        />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'rgba(240,237,232,0.72)', fontWeight: 400, lineHeight: 1.4 }}>
          {item.name}
        </span>
        {item.tag && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(245,200,66,0.12)', color: '#f5c842',
            letterSpacing: '0.07em', textTransform: 'uppercase',
            border: '1px solid rgba(245,200,66,0.2)', whiteSpace: 'nowrap',
          }}>
            {item.tag}
          </span>
        )}
        {item.note && (
          <span style={{ fontSize: 10, color: 'rgba(240,237,232,0.25)', fontStyle: 'italic' }}>
            {item.note}
          </span>
        )}
      </div>

      <span style={{ fontSize: 13.5, fontWeight: 700, color: '#f5c842', flexShrink: 0, marginLeft: 8 }}>
        ₱{item.price}
      </span>
    </motion.div>
  )
}

// ─────────────────────────────────────────────
// Progressive Image
// ─────────────────────────────────────────────
interface ProgressiveImageProps {
  src:             string
  alt:             string
  style?:          React.CSSProperties
  containerStyle?: React.CSSProperties
  parallaxScale?:  boolean
  isHovered?:      boolean
}

function ProgressiveImage({ src, alt, style, containerStyle, parallaxScale, isHovered }: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError]   = useState(false)
  const imgSrc              = error ? PLACEHOLDER : src

  return (
    <div style={{ position: 'relative', overflow: 'hidden', ...containerStyle }}>
      <AnimatePresence>
        {!loaded && (
          <motion.div
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1a1208 0%,#2a1f0e 100%)', zIndex: 1 }}
          >
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(245,200,66,0.06),transparent)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.img
        src={imgSrc}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => { setError(true); setLoaded(true) }}
        animate={parallaxScale ? { scale: isHovered ? 1.1 : 1 } : {}}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: 'block',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.5s, filter 0.4s',
          ...style,
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────
// Product Card
// ─────────────────────────────────────────────
interface ProductCardProps {
  product: Product
  index:   number
  onOrder: () => void
}

function ProductCard({ product: p, index, onOrder }: ProductCardProps) {
  const [hovered, setHovered] = useState(false)
  const badge   = BADGE_CONFIG[p.badge] ?? null
  const isDrink = !!p.isDrink

  return (
    <motion.article
      variants={fadeUp}
      custom={index}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ y: -8, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
      style={{
        borderRadius: 24, overflow: 'hidden',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${hovered
          ? (isDrink ? 'rgba(147,210,255,0.32)' : 'rgba(245,200,66,0.3)')
          : 'rgba(255,255,255,0.08)'}`,
        boxShadow: hovered
          ? '0 28px 64px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.07)'
          : '0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, zIndex: 3,
        background: hovered
          ? (isDrink
              ? 'linear-gradient(90deg,transparent,rgba(147,210,255,0.5),transparent)'
              : 'linear-gradient(90deg,transparent,rgba(245,200,66,0.5),transparent)')
          : 'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)',
        transition: 'background 0.35s',
      }} />

      {isDrink && (
        <div style={{
          position: 'absolute', top: 0, right: 0, zIndex: 4,
          background: 'rgba(99,179,237,0.18)', backdropFilter: 'blur(12px)',
          borderRadius: '0 24px 0 14px', padding: '5px 12px',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Droplets size={10} color="rgba(147,210,255,0.9)" />
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(147,210,255,0.9)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Fruit Soda
          </span>
        </div>
      )}

      <div style={{ position: 'relative', aspectRatio: '16/10', overflow: 'hidden', background: '#1a1208' }}>
        <ProgressiveImage
          src={p.img || PLACEHOLDER}
          alt={p.name}
          parallaxScale
          isHovered={hovered}
          containerStyle={{ width: '100%', height: '100%' }}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            filter: hovered ? 'brightness(1.12) saturate(1.3)' : 'brightness(0.9) saturate(1.05)',
          }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,transparent 40%,rgba(8,6,4,0.85))', pointerEvents: 'none' }} />

        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: isDrink
                  ? 'linear-gradient(135deg,rgba(99,179,237,0.08),transparent)'
                  : 'linear-gradient(135deg,rgba(245,200,66,0.09),transparent)',
              }}
            />
          )}
        </AnimatePresence>

        {badge && (
          <span style={{
            position: 'absolute', top: 14, left: 14, zIndex: 2,
            background: badge.bg, color: badge.textDark ? '#111' : '#fff',
            fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            boxShadow: `0 4px 16px ${badge.bg}55`,
          }}>
            {badge.label}
          </span>
        )}

        {p.spicy && (
          <motion.div
            animate={{ rotate: hovered ? [0, -12, 12, 0] : 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute', top: 14, right: 14, zIndex: 2,
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.32)',
              borderRadius: '50%', width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Flame size={14} color="#ef4444" />
          </motion.div>
        )}

        {p.rating > 0 && (
          <div style={{
            position: 'absolute', bottom: 12, left: 14, zIndex: 2,
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(245,200,66,0.2)', borderRadius: 999, padding: '3px 9px',
          }}>
            <Star size={10} color="#f5c842" fill="#f5c842" />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#f5c842' }}>{p.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      <div style={{ padding: '16px 18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f0ede8', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
            {p.name}
          </h3>
          <span style={{
            flexShrink: 0, fontSize: 10, fontWeight: 500, padding: '2px 9px', borderRadius: 999,
            background: 'rgba(255,255,255,0.05)', color: 'rgba(240,237,232,0.26)',
            border: '1px solid rgba(255,255,255,0.07)', marginTop: 2,
          }}>
            {p.category}
          </span>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'rgba(240,237,232,0.35)', lineHeight: 1.65, fontWeight: 300 }}>
          {p.description}
        </p>

        {isDrink && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {[{ s: '16oz', price: 50 }, { s: '22oz', price: 60 }].map(sz => (
              <span key={sz.s} style={{
                fontSize: 10.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                background: 'rgba(245,200,66,0.07)', color: '#f5c842', border: '1px solid rgba(245,200,66,0.16)',
              }}>
                {sz.s} — ₱{sz.price}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {!isDrink
            ? <span style={{ fontSize: 18, fontWeight: 800, color: '#f5c842' }}>₱{p.price}</span>
            : <div />
          }
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={(e) => { e.stopPropagation(); onOrder() }}
            style={{
              background: isDrink ? 'rgba(99,179,237,0.14)' : '#f5c842',
              color: isDrink ? '#93c5fd' : '#111',
              border: isDrink ? '1px solid rgba(99,179,237,0.28)' : 'none',
              borderRadius: 12, padding: '9px 22px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
              letterSpacing: '0.01em', whiteSpace: 'nowrap',
            }}
          >
            Order
          </motion.button>
        </div>
      </div>
    </motion.article>
  )
}

// ─────────────────────────────────────────────
// Full Menu Card
// ─────────────────────────────────────────────
interface FullMenuCardProps {
  section: MenuSection
  delay:   number
}

function FullMenuCard({ section, delay }: FullMenuCardProps) {
  const isDrink = !!section.isDrink

  const cardStyle: React.CSSProperties = isDrink
    ? {
        background: 'rgba(99,179,237,0.025)',
        border: '1px solid rgba(147,210,255,0.1)',
        boxShadow: 'inset 0 1px 0 rgba(147,210,255,0.07), 0 8px 40px rgba(0,0,0,0.4)',
      }
    : {}

  const shimmerColor = isDrink
    ? 'linear-gradient(90deg,transparent,rgba(147,210,255,0.25),transparent)'
    : 'linear-gradient(90deg,transparent,rgba(245,200,66,0.28),transparent)'

  const glowColor = isDrink
    ? 'radial-gradient(ellipse at top left,rgba(99,179,237,0.05) 0%,transparent 60%)'
    : 'radial-gradient(ellipse at top left,rgba(245,200,66,0.035) 0%,transparent 60%)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
      className="crunch-menu-card"
      style={cardStyle}
    >
      <div style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 1, background: shimmerColor }} />
      <div style={{ position: 'absolute', inset: 0, background: glowColor, pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        {isDrink && <Droplets size={16} color="#93c5fd" />}
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f0ede8', letterSpacing: '-0.01em' }}>
          {section.title}
        </h3>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      </div>

      {section.subtext && (
        <p style={{ fontSize: 11, color: 'rgba(240,237,232,0.24)', margin: '4px 0 14px', fontStyle: 'italic' }}>
          {section.subtext}
        </p>
      )}

      {section.pills && (
        <div style={{ display: 'flex', gap: 7, margin: '6px 0 14px', flexWrap: 'wrap' }}>
          {section.pills.map(opt => (
            <span key={opt.label} style={{
              fontSize: 10.5, fontWeight: 600, padding: '3px 11px', borderRadius: 999,
              background: opt.spicy ? 'rgba(239,68,68,0.09)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${opt.spicy ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.09)'}`,
              color: opt.spicy ? '#ef4444' : 'rgba(240,237,232,0.42)',
            }}>
              {opt.label}
            </span>
          ))}
        </div>
      )}

      {isDrink && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[{ label: '16oz', price: '₱50' }, { label: '22oz', price: '₱60' }].map(s => (
            <div key={s.label} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(99,179,237,0.08)', border: '1px solid rgba(147,210,255,0.16)',
              borderRadius: 999, padding: '4px 11px',
            }}>
              <Droplets size={10} color="#93c5fd" />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#93c5fd' }}>{s.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(240,237,232,0.45)' }}>{s.price}</span>
            </div>
          ))}
        </div>
      )}

      {section.items.map((item, idx) => (
        <MenuRow key={`${item.name}-${idx}`} item={item} index={idx} />
      ))}

      {isDrink && (
        <p style={{ fontSize: 10, color: 'rgba(240,237,232,0.18)', marginTop: 10, fontStyle: 'italic' }}>
          * Prices shown are for 16oz. 22oz is ₱60.
        </p>
      )}
    </motion.div>
  )
}

// ─────────────────────────────────────────────
// Flavor Card
// ─────────────────────────────────────────────
function FlavorCard({ flavor, index, expanded, onToggle }: {
  flavor:   FlavorItem
  index:    number
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.055, duration: 0.45 }}
      style={{ gridColumn: expanded ? 'span 2' : 'span 1' }}
    >
      <motion.button
        onClick={onToggle}
        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        style={{
          width: '100%',
          background: expanded ? `${flavor.accent}18` : 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: `1.5px solid ${expanded ? flavor.accent : 'rgba(255,255,255,0.09)'}`,
          borderRadius: expanded ? '16px 16px 0 0' : 16,
          padding: '15px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
          transition: 'all 0.25s',
          boxShadow: expanded ? `0 0 28px ${flavor.accent}18` : 'none',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f0ede8', letterSpacing: '-0.01em' }}>
          {flavor.name}
        </span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown size={14} color={expanded ? flavor.accent : 'rgba(240,237,232,0.28)'} />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{
              overflow: 'hidden',
              border: `1.5px solid ${flavor.accent}`, borderTop: 'none',
              borderRadius: '0 0 16px 16px',
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)',
            }}
          >
            <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden' }}>
              <ProgressiveImage
                src={flavor.img}
                alt={flavor.name}
                containerStyle={{ width: '100%', height: '100%' }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.88) saturate(1.2)' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.1) 55%,transparent 100%)' }} />
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg,${flavor.accent}14,transparent 60%)` }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#f0ede8' }}>{flavor.name}</span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '3px 8px',
                    borderRadius: 999, background: flavor.accent,
                    color: ['#fbbf24','#f59e0b'].includes(flavor.accent) ? '#111' : '#fff',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    Flavor
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(240,237,232,0.55)', lineHeight: 1.6, fontWeight: 300 }}>
                  {flavor.desc}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─────────────────────────────────────────────
// Promo Card
// ─────────────────────────────────────────────
function PromoCard({ promo, index, large = false }: {
  promo:  Promo
  index:  number
  large?: boolean
}) {
  const [hovered,   setHovered]   = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError,  setImgError]  = useState(false)

  const accentColor  = promo.badgeColor ?? '#f5c842'
  const eventDateObj = promo.eventDate ? formatEventDate(promo.eventDate) : null
  const countdown    = promo.validUntil ? getCountdown(promo.validUntil) : null
  const imgSrc       = imgError ? PLACEHOLDER : (promo.img || PLACEHOLDER)

  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ y: -6, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
      style={{
        borderRadius: 22,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.025)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${hovered ? `${accentColor}44` : 'rgba(255,255,255,0.07)'}`,
        boxShadow: hovered
          ? `0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px ${accentColor}22`
          : '0 4px 24px rgba(0,0,0,0.35)',
        cursor: 'default',
        position: 'relative',
        transition: 'border-color 0.3s, box-shadow 0.3s',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 20, right: 20, height: 1, zIndex: 3,
        background: hovered
          ? `linear-gradient(90deg,transparent,${accentColor}66,transparent)`
          : 'linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent)',
        transition: 'background 0.35s',
      }} />

      <div style={{
        position: 'relative',
        aspectRatio: large ? '21/9' : '16/9',
        overflow: 'hidden',
        background: '#0f0d0a',
        flexShrink: 0,
      }}>
        {!imgLoaded && !imgError && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1a1208,#2a1f0e)', zIndex: 1 }}>
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg,transparent,${accentColor}0a,transparent)` }}
            />
          </div>
        )}
        <motion.img
          src={imgSrc}
          alt={promo.title}
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgError(true); setImgLoaded(true) }}
          animate={{ scale: hovered ? 1.07 : 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.5s',
            filter: hovered ? 'brightness(1.1) saturate(1.2)' : 'brightness(0.82) saturate(1.05)',
          }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,transparent 35%,rgba(8,6,4,0.92))' }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg,${accentColor}10,transparent 55%)` }} />

        {eventDateObj && (
          <div style={{
            position: 'absolute', top: 14, left: 14, zIndex: 4,
            background: accentColor,
            borderRadius: 12,
            padding: '6px 10px',
            textAlign: 'center',
            boxShadow: `0 4px 16px ${accentColor}55`,
            minWidth: 42,
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#111', lineHeight: 1 }}>
              {eventDateObj.day}
            </div>
            <div style={{ fontSize: 8.5, fontWeight: 700, color: '#111', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {eventDateObj.month}
            </div>
          </div>
        )}

        {promo.badge && (
          <span style={{
            position: 'absolute', top: 14, right: 14, zIndex: 4,
            background: `${accentColor}22`,
            border: `1px solid ${accentColor}44`,
            backdropFilter: 'blur(10px)',
            color: accentColor,
            fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {promo.badge}
          </span>
        )}

        {promo.discount && (
          <motion.div
            animate={{ rotate: hovered ? [0, -5, 5, 0] : -12 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute', bottom: 14, right: 14, zIndex: 4,
              background: accentColor,
              borderRadius: '50%',
              width: 56, height: 56,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 20px ${accentColor}55`,
              transform: 'rotate(-12deg)',
            }}
          >
            <span style={{
              fontSize: promo.discount.length > 6 ? 8 : 10,
              fontWeight: 900, color: '#111', lineHeight: 1.1,
              textAlign: 'center', padding: '0 5px',
            }}>
              {promo.discount}
            </span>
          </motion.div>
        )}
      </div>

      <div style={{ padding: '16px 18px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {promo.tag && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarDays size={10} color={accentColor} />
            <span style={{
              fontSize: 9, fontWeight: 700, color: accentColor,
              letterSpacing: '0.2em', textTransform: 'uppercase',
            }}>
              {promo.tag}
            </span>
          </div>
        )}

        <h3 style={{
          margin: 0,
          fontSize: large ? 20 : 15,
          fontWeight: 800, color: '#f0ede8',
          lineHeight: 1.2, letterSpacing: '-0.02em',
        }}>
          {promo.title}
        </h3>

        {promo.subtitle && (
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: accentColor, opacity: 0.85 }}>
            {promo.subtitle}
          </p>
        )}

        <p style={{
          margin: 0,
          fontSize: 12.5, color: 'rgba(240,237,232,0.38)',
          lineHeight: 1.65, fontWeight: 300,
          flex: 1,
        }}>
          {promo.description}
        </p>

        {countdown && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 4,
            background: 'rgba(239,68,68,0.09)',
            border: '1px solid rgba(239,68,68,0.22)',
            borderRadius: 999, padding: '4px 11px',
            alignSelf: 'flex-start',
          }}>
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }}
            />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#ef4444' }}>{countdown}</span>
          </div>
        )}
      </div>
    </motion.article>
  )
}

// ─────────────────────────────────────────────
// Promo Section
// ─────────────────────────────────────────────
function PromoSection({ promos, loading }: { promos: Promo[]; loading: boolean }) {
  const pinned = promos.filter(p => p.highlight)
  const rest   = promos.filter(p => !p.highlight)

  return (
    <Reveal style={{ marginTop: 100 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 28, height: 1, background: '#f5c842' }} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#f5c842' }}>
          Year-Round Events
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 44 }}>
        <h2
          className="crunch-section-title"
          style={{ fontWeight: 800, color: '#f0ede8', margin: 0, letterSpacing: '-0.02em' }}
        >
          Deals &amp; <em style={{ color: '#f5c842', fontStyle: 'italic' }}>Promos</em>
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.3)', margin: 0, fontWeight: 300, maxWidth: 260, lineHeight: 1.65 }}>
          Holiday specials, payday bundles, and limited-time flavors — all year long.
        </p>
      </div>

      {loading ? (
        <div className="crunch-promo-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                borderRadius: 22, overflow: 'hidden',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                aspectRatio: '16/9',
                position: 'relative',
              }}
            >
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
                style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(245,200,66,0.05),transparent)' }}
              />
            </div>
          ))}
        </div>
      ) : promos.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 0',
          color: 'rgba(240,237,232,0.22)', fontSize: 14, fontWeight: 300,
        }}>
          No active promos right now — check back soon! 🍗
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,540px),1fr))',
              gap: 20,
              marginBottom: rest.length > 0 ? 20 : 0,
            }}>
              {pinned.map((p, i) => (
                <PromoCard key={p.id} promo={p} index={i} large />
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <div className="crunch-promo-grid">
              {rest.map((p, i) => (
                <PromoCard key={p.id} promo={p} index={pinned.length + i} />
              ))}
            </div>
          )}
        </>
      )}
    </Reveal>
  )
}

// ─────────────────────────────────────────────
// Star Rating (Feedback)
// ─────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= (hovered || value)
        return (
          <motion.button
            key={n}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(n)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}
          >
            <Star
              size={28}
              fill={active ? '#f5c842' : 'none'}
              color={active ? '#f5c842' : 'rgba(240,237,232,0.25)'}
              style={{ transition: 'fill 0.15s, color 0.15s' }}
            />
          </motion.button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// Feedback Modal
// ─────────────────────────────────────────────
interface FeedbackProductOption {
  id: number
  name: string
}

function FeedbackModal({
  onClose,
  productOptions,
}: {
  onClose: () => void
  productOptions: FeedbackProductOption[]
}) {
  const [rating,   setRating]   = useState(0)
  const [message,  setMessage]  = useState('')
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    productOptions[0]?.id ?? null,
  )
  const [status,   setStatus]   = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [focused,  setFocused]  = useState<string | null>(null)

  useEffect(() => {
    if (productOptions.length === 0) {
      setSelectedProductId(null)
      return
    }

    setSelectedProductId((current) => {
      if (current && productOptions.some((product) => product.id === current)) {
        return current
      }
      return productOptions[0].id
    })
  }, [productOptions])

  const customerUserIdRaw =
    typeof window !== 'undefined' ? window.localStorage.getItem('userId') : null
  const customerUserId = customerUserIdRaw ? Number(customerUserIdRaw) : null
  const normalizedCustomerUserId =
    customerUserId !== null && Number.isInteger(customerUserId) && customerUserId > 0
      ? customerUserId
      : null

  const canSubmit =
    selectedProductId !== null && rating > 0 && message.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    const productId = selectedProductId
    if (productId === null) return
    setStatus('submitting')
    setErrorMsg('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          customer_user_id: normalizedCustomerUserId,
          rating,
          comment: message.trim(),
        } satisfies FeedbackPayload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.message || `Server error ${res.status}`)
      }
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not submit. Please try again.')
      setStatus('error')
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    fontFamily: "'Poppins', sans-serif",
    fontSize: 13,
    color: '#f0ede8',
    background: focused === field ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${focused === field ? 'rgba(245,200,66,0.45)' : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 10,
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'none' as const,
    transition: 'border-color 0.2s, background 0.2s',
    boxShadow: focused === field ? '0 0 0 3px rgba(245,200,66,0.07)' : 'none',
  })

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          zIndex: 900,
        }}
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        style={{
          position: 'fixed', bottom: 100, right: 24,
          width: 'min(420px, calc(100vw - 32px))',
          background: 'rgba(20,17,13,0.97)',
          border: '1px solid rgba(245,200,66,0.18)',
          borderRadius: 20, padding: 28,
          zIndex: 901,
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {/* Shimmer accent line */}
        <div style={{
          position: 'absolute', top: 0, left: 24, right: 24, height: 1,
          background: 'linear-gradient(90deg,transparent,rgba(245,200,66,0.5),transparent)',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 16, fontWeight: 700, color: '#f0ede8', margin: 0, letterSpacing: '-0.01em' }}>
              Share your thoughts
            </p>
            <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 12, color: 'rgba(240,237,232,0.35)', margin: '4px 0 0', fontWeight: 300 }}>
              Help us improve The Crunch experience
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '50%', width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={14} color="rgba(240,237,232,0.6)" />
          </motion.button>
        </div>

        <AnimatePresence mode="wait">
          {status === 'success' ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0', textAlign: 'center' }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 200, delay: 0.1 }}
              >
                <CheckCircle size={48} color="#22c55e" />
              </motion.div>
              <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 15, fontWeight: 700, color: '#f0ede8', margin: 0 }}>
                Thank you!
              </p>
              <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 13, color: 'rgba(240,237,232,0.4)', margin: 0, fontWeight: 300 }}>
                Your feedback has been received.
              </p>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={onClose}
                style={{
                  marginTop: 8, background: 'rgba(245,200,66,0.1)', border: '1px solid rgba(245,200,66,0.25)',
                  borderRadius: 10, padding: '9px 24px', fontSize: 13, fontWeight: 600, color: '#f5c842',
                  cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                }}
              >
                Close
              </motion.button>
            </motion.div>
          ) : (
            <motion.div key="form" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Star rating */}
              <div>
                <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 11, fontWeight: 600, color: 'rgba(240,237,232,0.35)', margin: '0 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Overall Rating
                </p>
                <StarRating value={rating} onChange={setRating} />
                {rating > 0 && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    style={{ fontFamily: "'Poppins', sans-serif", fontSize: 11, color: '#f5c842', margin: '6px 0 0', fontWeight: 500 }}
                  >
                    {['', 'Poor', 'Fair', 'Good', 'Great', 'Amazing!'][rating]}
                  </motion.p>
                )}
              </div>

              {/* Product */}
              <div>
                <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 11, fontWeight: 600, color: 'rgba(240,237,232,0.35)', margin: '0 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Product
                </p>
                <select
                  value={selectedProductId ?? ''}
                  onChange={(e) => setSelectedProductId(Number(e.target.value) || null)}
                  onFocus={() => setFocused('product')}
                  onBlur={() => setFocused(null)}
                  style={inputStyle('product')}
                  disabled={productOptions.length === 0 || status === 'submitting'}
                >
                  {productOptions.length === 0 ? (
                    <option value="">No products available</option>
                  ) : (
                    productOptions.map((product) => (
                      <option key={product.id} value={product.id} style={{ color: '#111' }}>
                        {product.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Message */}
              <div>
                <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 11, fontWeight: 600, color: 'rgba(240,237,232,0.35)', margin: '0 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Your Feedback
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your experience…"
                  rows={4}
                  onFocus={() => setFocused('message')}
                  onBlur={() => setFocused(null)}
                  style={inputStyle('message')}
                />
                <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 10, color: 'rgba(240,237,232,0.2)', margin: '4px 0 0', textAlign: 'right' }}>
                  {message.length} / 500
                </p>
              </div>

              {/* Error */}
              <AnimatePresence>
                {status === 'error' && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{
                      fontFamily: "'Poppins', sans-serif", fontSize: 12, color: '#ef4444', margin: 0,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: 8, padding: '8px 12px',
                    }}
                  >
                    {errorMsg}
                  </motion.p>
                )}
              </AnimatePresence>
              {productOptions.length === 0 && (
                <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 12, color: '#fbbf24', margin: 0 }}>
                  Feedback is temporarily unavailable because no products could be loaded.
                </p>
              )}

              {/* Submit */}
              <motion.button
                whileHover={canSubmit ? { scale: 1.02 } : {}}
                whileTap={canSubmit ? { scale: 0.97 } : {}}
                onClick={handleSubmit}
                disabled={!canSubmit || status === 'submitting'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: canSubmit ? '#f5c842' : 'rgba(245,200,66,0.15)',
                  border: 'none', borderRadius: 12, padding: '12px',
                  fontSize: 14, fontWeight: 700,
                  color: canSubmit ? '#111' : 'rgba(245,200,66,0.35)',
                  cursor: canSubmit ? 'pointer' : 'default',
                  fontFamily: "'Poppins', sans-serif",
                  transition: 'background 0.2s, color 0.2s',
                }}
              >
                {status === 'submitting' ? (
                  <span style={{
                    display: 'inline-block', width: 14, height: 14,
                    border: '2px solid rgba(17,17,17,0.4)', borderTopColor: '#111',
                    borderRadius: '50%', animation: 'crunch-spin 0.7s linear infinite',
                  }} />
                ) : (
                  <Send size={15} />
                )}
                {status === 'submitting' ? 'Sending…' : 'Submit Feedback'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}

// ─────────────────────────────────────────────
// Feedback Button (floating trigger)
// ─────────────────────────────────────────────
function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [productOptions, setProductOptions] = useState<FeedbackProductOption[]>([])

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const res = await fetch('/api/products')
        if (!res.ok) throw new Error(`Server error ${res.status}`)
        const data = (await res.json()) as Array<{ id?: number; name?: string }>
        const nextOptions = Array.isArray(data)
          ? data
              .filter((item) => Number.isInteger(item.id) && typeof item.name === 'string' && item.name.trim().length > 0)
              .map((item) => ({ id: Number(item.id), name: String(item.name).trim() }))
          : []
        setProductOptions(nextOptions)
      } catch {
        setProductOptions([])
      }
    }

    void loadProducts()
  }, [])

  return (
    <>
      <style>{`@keyframes crunch-spin { to { transform: rotate(360deg); } }`}</style>

      <AnimatePresence>
        {open && (
          <FeedbackModal
            onClose={() => setOpen(false)}
            productOptions={productOptions}
          />
        )}
      </AnimatePresence>

      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.2, type: 'spring', damping: 18, stiffness: 260 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.93 }}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'fixed', bottom: 28, right: 24, zIndex: 800,
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#f5c842', border: 'none', borderRadius: 999,
          padding: '12px 20px', fontSize: 13, fontWeight: 700, color: '#111',
          cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
          boxShadow: '0 8px 32px rgba(245,200,66,0.35)', letterSpacing: '0.01em',
        }}
      >
        <MessageSquare size={16} />
        {open ? 'Close' : 'Feedback'}
      </motion.button>
    </>
  )
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
interface ProductsProps {
  isAuthenticated?: boolean
  onLogout?:        () => void
}

export default function Products({ isAuthenticated = false, onLogout }: ProductsProps) {
  const navigate = useNavigate()

  // ── State ──
  const [products, setProducts]               = useState<Product[]>([])
  const [flavors, setFlavors]                 = useState<FlavorItem[]>([])
  const [menuSections, setMenuSections]       = useState<MenuSection[]>([])
  const [promos, setPromos]                   = useState<Promo[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadingFlavors, setLoadingFlavors]   = useState(true)
  const [loadingMenu, setLoadingMenu]         = useState(true)
  const [loadingPromos, setLoadingPromos]     = useState(true)
  const [category, setCategory]               = useState<Category>('All')
  const [search, setSearch]                   = useState('')
  const [isOpen, setIsOpen]                   = useState(false)
  const [expandedFlavor, setExpandedFlavor]   = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen]   = useState(false)
  const [searchFocused, setSearchFocused]     = useState(false)

  // ── Refs ──
  const heroRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)

  // ── Scroll parallax ──
  const { scrollY } = useScroll()
  const heroY        = useTransform(scrollY, [0, 500], [0, 80])
  const heroOpacity  = useTransform(scrollY, [0, 400], [1, 0.35])

  // ── Business hours ──
  useEffect(() => {
    const check = () => {
      const now = new Date()
      const day = now.getDay()
      const t   = now.getHours() + now.getMinutes() / 60
      setIsOpen(
        (day >= 1 && day <= 5 && t >= 10 && t < 22) ||
        ((day === 0 || day === 6) && t >= 11 && t < 20.5)
      )
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [])

  // ── Inject styles once ──
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'crunch-styles'
    if (!document.getElementById('crunch-styles')) {
      style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        .crunch-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        @media (max-width: 640px) { .crunch-grid { grid-template-columns: 1fr; gap: 14px; } }
        @media (min-width: 641px) and (max-width: 900px) { .crunch-grid { grid-template-columns: repeat(2,1fr); gap: 16px; } }

        .crunch-menu-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 18px;
          margin-bottom: 18px;
        }
        @media (max-width: 860px) { .crunch-menu-grid { grid-template-columns: 1fr; } }

        .crunch-promo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 18px;
        }
        @media (max-width: 640px) { .crunch-promo-grid { grid-template-columns: 1fr; gap: 14px; } }
        @media (min-width: 641px) and (max-width: 900px) { .crunch-promo-grid { grid-template-columns: repeat(2,1fr); gap: 16px; } }

        .crunch-nav-links { display: flex; gap: 4px; align-items: center; }
        @media (max-width: 768px) { .crunch-nav-links { display: none; } .crunch-mobile-menu-btn { display: flex !important; } }

        .crunch-hero-row { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 32px; }
        @media (max-width: 640px) { .crunch-hero-row { flex-direction: column; align-items: flex-start; } .crunch-hero-search { width: 100% !important; } }

        .crunch-flavors-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
        @media (max-width: 480px) { .crunch-flavors-grid { grid-template-columns: 1fr 1fr; } }

        .crunch-footer-row { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 32px; margin-bottom: 40px; }

        .crunch-banner-inner { display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap; overflow: hidden; padding: 0 16px; }
        @media (max-width: 600px) { .crunch-banner-inner { gap: 8px; } .crunch-banner-hours { display: none; } }

        .crunch-hero-title { font-size: clamp(48px, 8vw, 100px); }
        .crunch-section-title { font-size: clamp(26px, 4vw, 48px); }
        .crunch-pad { padding: 0 clamp(16px, 4vw, 56px); }
        .crunch-hero-pad { padding: clamp(60px,9vw,100px) clamp(16px,4vw,56px) clamp(48px,7vw,72px); }

        .crunch-featured-card { border-radius: 28px; overflow: hidden; position: relative; cursor: pointer; background: #0a0806; aspect-ratio: 21/9; min-height: 280px; max-height: 480px; }
        @media (max-width: 640px) { .crunch-featured-card { aspect-ratio: 16/10; max-height: 300px; min-height: 220px; } }

        .crunch-featured-content { position: absolute; bottom: 36px; left: 36px; right: 36px; }
        @media (max-width: 640px) { .crunch-featured-content { bottom: 20px; left: 20px; right: 20px; } }

        .crunch-tabs-scroll { display: flex; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .crunch-tabs-scroll::-webkit-scrollbar { display: none; }

        .crunch-menu-card {
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          padding: clamp(20px,3vw,32px) clamp(16px,2.5vw,28px);
          position: relative;
          overflow: hidden;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 40px rgba(0,0,0,0.4);
        }
      `
      document.head.appendChild(style)
    }
    return () => {
      const el = document.getElementById('crunch-styles')
      if (el) el.remove()
    }
  }, [])

  // ── Fetch products ──
  useEffect(() => {
    let cancelled = false
    setLoadingProducts(true)
    fetch('/api/products')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() })
      .then((data: Product[]) => { if (!cancelled) { setProducts(Array.isArray(data) ? data : []); setLoadingProducts(false) } })
      .catch(() => { if (!cancelled) setLoadingProducts(false) })
    return () => { cancelled = true }
  }, [])

  // ── Fetch flavors ──
  useEffect(() => {
    let cancelled = false
    setLoadingFlavors(true)
    fetch('/api/flavors')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() })
      .then((data: FlavorItem[]) => { if (!cancelled) { setFlavors(Array.isArray(data) ? data : []); setLoadingFlavors(false) } })
      .catch(() => { if (!cancelled) setLoadingFlavors(false) })
    return () => { cancelled = true }
  }, [])

  // ── Fetch menu sections ──
  useEffect(() => {
    let cancelled = false
    setLoadingMenu(true)
    fetch('/api/menu-sections')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() })
      .then((data: MenuSection[]) => { if (!cancelled) { setMenuSections(Array.isArray(data) ? data : []); setLoadingMenu(false) } })
      .catch(() => { if (!cancelled) setLoadingMenu(false) })
    return () => { cancelled = true }
  }, [])

  // ── Fetch promos ──
  useEffect(() => {
    let cancelled = false
    setLoadingPromos(true)
    fetch('/api/promos')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json() })
      .then((data: Promo[]) => { if (!cancelled) { setPromos(Array.isArray(data) ? data : []); setLoadingPromos(false) } })
      .catch(() => { if (!cancelled) setLoadingPromos(false) })
    return () => { cancelled = true }
  }, [])

  // ── Filtered products ──
  const filtered = products.filter(p =>
    (category === 'All' || p.category === category) &&
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const topPick = filtered.find(p => p.badge === 'Bestseller') ?? filtered[0] ?? null

  const handleOrder = useCallback(() => {
    navigate('/usersmenu?showOrderModal=true')
  }, [navigate])

  const handleLogout = useCallback(() => {
    if (onLogout) onLogout()
    navigate('/products')
  }, [onLogout, navigate])

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: '#0e0c0a', minHeight: '100vh', color: '#f0ede8', position: 'relative' }}>

      {/* Ambient glows */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '5%', width: 'min(700px,80vw)', height: 'min(700px,80vw)', borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,200,66,0.065) 0%,transparent 65%)' }} />
        <div style={{ position: 'absolute', top: '40%', right: '-5%', width: 'min(500px,60vw)', height: 'min(500px,60vw)', borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,200,66,0.04) 0%,transparent 65%)' }} />
        <div style={{ position: 'absolute', bottom: '-5%', left: '25%', width: 'min(600px,70vw)', height: 'min(600px,70vw)', borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,200,66,0.045) 0%,transparent 65%)' }} />
      </div>

      {/* ── Nav ── */}
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'sticky', top: 0, zIndex: 200, height: NAV_H,
          background: 'rgba(14,12,10,0.9)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center',
        }}
      >
        <div className="crunch-pad" style={{ maxWidth: 1320, margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 20, color: '#f0ede8', letterSpacing: '-0.02em' }}>
              The <span style={{ color: '#f5c842' }}>Crunch</span>
            </span>
          </button>

          <nav className="crunch-nav-links">
            {[
              { label: 'Home',  to: '/' },
              { label: 'About', to: '/aboutthecrunch' },
            ].map(({ label, to }) => (
              <Link key={label} to={to}
                style={{ color: 'rgba(240,237,232,0.42)', fontSize: 13.5, textDecoration: 'none', fontWeight: 500, padding: '7px 14px', borderRadius: 10, transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f0ede8'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(240,237,232,0.42)'; e.currentTarget.style.background = 'transparent' }}
              >
                {label}
              </Link>
            ))}
            <button onClick={handleOrder}
              style={{ color: 'rgba(240,237,232,0.42)', fontSize: 13.5, fontWeight: 500, padding: '7px 14px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f0ede8'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(240,237,232,0.42)'; e.currentTarget.style.background = 'transparent' }}
            >
              Menu
            </button>

            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)', margin: '0 6px' }} />

            {isAuthenticated ? (
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleLogout}
                style={{ background: '#f5c842', border: 'none', borderRadius: 10, padding: '9px 22px', fontSize: 13, fontWeight: 700, color: '#111', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                Log Out
              </motion.button>
            ) : (
              <>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/login')}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 600, color: '#f0ede8', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                  Log In
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/login?tab=signup')}
                  style={{ background: '#f5c842', border: 'none', borderRadius: 10, padding: '9px 22px', fontSize: 13, fontWeight: 700, color: '#111', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                  Sign Up
                </motion.button>
              </>
            )}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="crunch-mobile-menu-btn"
            onClick={() => setMobileMenuOpen(v => !v)}
            style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: '#f0ede8', padding: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen
              ? <X size={22} color="#f0ede8" />
              : (
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="2" y="5" width="18" height="2" rx="1" fill="#f0ede8"/>
                  <rect x="2" y="10" width="14" height="2" rx="1" fill="rgba(240,237,232,0.6)"/>
                  <rect x="2" y="15" width="18" height="2" rx="1" fill="#f0ede8"/>
                </svg>
              )
            }
          </button>
        </div>

        {/* Mobile dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute', top: NAV_H, left: 0, right: 0,
                background: 'rgba(14,12,10,0.97)', backdropFilter: 'blur(28px)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden', zIndex: 300,
                display: 'flex', flexDirection: 'column',
                padding: '12px 20px 20px', gap: 4,
              }}
            >
              {[
                { label: 'Home',  action: () => { navigate('/'); setMobileMenuOpen(false) } },
                { label: 'Menu',  action: () => { handleOrder(); setMobileMenuOpen(false) } },
                { label: 'About', action: () => { navigate('/aboutthecrunch'); setMobileMenuOpen(false) } },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                  style={{ background: 'none', border: 'none', textAlign: 'left', padding: '12px 8px', fontSize: 15, fontWeight: 500, color: 'rgba(240,237,232,0.7)', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", borderRadius: 10, transition: 'color 0.2s' }}>
                  {item.label}
                </button>
              ))}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '8px 0' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                {isAuthenticated ? (
                  <button onClick={() => { handleLogout(); setMobileMenuOpen(false) }}
                    style={{ flex: 1, background: '#f5c842', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, color: '#111', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    Log Out
                  </button>
                ) : (
                  <>
                    <button onClick={() => { navigate('/login'); setMobileMenuOpen(false) }}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 600, color: '#f0ede8', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                      Log In
                    </button>
                    <button onClick={() => { navigate('/login?tab=signup'); setMobileMenuOpen(false) }}
                      style={{ flex: 1, background: '#f5c842', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, color: '#111', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                      Sign Up
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* ── Status Banner ── */}
      <div style={{
        position: 'sticky', top: NAV_H, zIndex: 190, height: BANNER_H,
        background: 'rgba(16,13,9,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(245,200,66,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        <motion.div
          animate={{ x: ['-120%', '220%'] }}
          transition={{ duration: 4.5, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
          style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', background: 'linear-gradient(90deg,transparent,rgba(245,200,66,0.05),transparent)', pointerEvents: 'none' }}
        />
        <div className="crunch-banner-inner">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: isOpen ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${isOpen ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'}`,
            borderRadius: 999, padding: '4px 12px', flexShrink: 0,
          }}>
            <motion.div
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: isOpen ? '#22c55e' : '#ef4444' }}
            />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: isOpen ? '#22c55e' : '#ef4444', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              {isOpen ? 'Open Now' : 'Closed'}
            </span>
          </div>
          <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
          <Clock size={11} color="#f5c842" style={{ flexShrink: 0 }} />
          <span className="crunch-banner-hours" style={{ fontSize: 11.5, color: 'rgba(240,237,232,0.38)', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#f0ede8', fontWeight: 600 }}>Mon – Fri</span>&nbsp;&nbsp;10 AM – 10 PM
          </span>
          <span className="crunch-banner-hours" style={{ fontSize: 11.5, color: 'rgba(240,237,232,0.38)', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#f0ede8', fontWeight: 600 }}>Sat – Sun</span>&nbsp;&nbsp;11 AM – 8:30 PM
          </span>
        </div>
      </div>

      {/* ── Hero ── */}
      <div ref={heroRef} className="crunch-hero-pad" style={{ position: 'relative', overflow: 'hidden' }}>
        <motion.div style={{ maxWidth: 1320, margin: '0 auto', y: heroY, opacity: heroOpacity }}>
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 28, height: 1, background: '#f5c842' }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#f5c842' }}>
                The Crunch Fairview
              </span>
            </div>
          </motion.div>

          <div className="crunch-hero-row">
            <div>
              <motion.h1
                initial={{ opacity: 0, y: 36 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                className="crunch-hero-title"
                style={{ fontWeight: 900, color: '#f0ede8', margin: 0, lineHeight: 0.93, letterSpacing: '-0.03em' }}
              >
                Our<br /><em style={{ color: '#f5c842', fontStyle: 'italic' }}>Menu.</em>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}
                style={{ color: 'rgba(240,237,232,0.4)', fontSize: 'clamp(13px,1.5vw,15.5px)', margin: '20px 0 0', maxWidth: 380, lineHeight: 1.85, fontWeight: 300 }}
              >
                Fresh, hot, and fan-favorite — discover what makes The Crunch unforgettable.
              </motion.p>
            </div>

            {/* Search */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className="crunch-hero-search"
              style={{ position: 'relative', width: 320 }}
            >
              <Search size={14} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: searchFocused ? 'rgba(245,200,66,0.6)' : 'rgba(240,237,232,0.22)', pointerEvents: 'none', zIndex: 1, transition: 'color 0.2s' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search the menu..."
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={{
                  width: '100%', padding: '13px 16px 13px 46px', borderRadius: 16,
                  border: `1px solid ${searchFocused ? 'rgba(245,200,66,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  fontSize: 14, outline: 'none',
                  background: searchFocused ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
                  backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                  boxSizing: 'border-box' as const, fontFamily: "'Poppins', sans-serif",
                  color: '#f0ede8', transition: 'border-color 0.2s, background 0.2s',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,237,232,0.3)', padding: 2, display: 'flex', alignItems: 'center' }}
                >
                  <X size={14} />
                </button>
              )}
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* ── Category Tabs ── */}
      <div
        ref={tabsRef}
        style={{
          position: 'sticky', top: TAB_TOP, zIndex: 180,
          background: 'rgba(14,12,10,0.95)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="crunch-pad crunch-tabs-scroll" style={{ maxWidth: 1320, margin: '0 auto' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                position: 'relative', padding: '15px 20px',
                border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: category === cat ? 700 : 400,
                fontSize: 13.5, fontFamily: "'Poppins', sans-serif",
                whiteSpace: 'nowrap',
                color: category === cat ? '#f5c842' : 'rgba(240,237,232,0.32)',
                transition: 'color 0.2s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {cat === 'Drinks' && <Droplets size={12} color={category === cat ? '#f5c842' : 'rgba(240,237,232,0.28)'} />}
              {cat}
              {category === cat && (
                <motion.div
                  layoutId="tabIndicator"
                  style={{ position: 'absolute', bottom: 0, left: 10, right: 10, height: 2, background: '#f5c842', borderRadius: '2px 2px 0 0' }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Drinks notice */}
      <AnimatePresence>
        {category === 'Drinks' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden', background: 'rgba(245,200,66,0.04)', borderBottom: '1px solid rgba(245,200,66,0.08)' }}
          >
            <div className="crunch-pad" style={{ maxWidth: 1320, margin: '0 auto', padding: '11px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Droplets size={13} color="#f5c842" />
              <span style={{ fontSize: 12, color: 'rgba(240,237,232,0.5)' }}>
                Fruit Soda available in <strong style={{ color: '#f5c842' }}>16oz (₱50)</strong> and <strong style={{ color: '#f5c842' }}>22oz (₱60)</strong>. Tap <strong style={{ color: '#f0ede8' }}>Order</strong> to proceed.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      <div className="crunch-pad" style={{ maxWidth: 1320, margin: '0 auto', paddingTop: 56, paddingBottom: 96, position: 'relative', zIndex: 1 }}>

        {/* Featured Hero Card */}
        {!search && !loadingProducts && topPick && (
          <Reveal style={{ marginBottom: 72 }}>
            <motion.div whileHover="hovered" className="crunch-featured-card">
              <ProgressiveImage
                src={topPick.img || PLACEHOLDER}
                alt={topPick.name}
                containerStyle={{ position: 'absolute', inset: 0 }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.78) saturate(1.15)' }}
                parallaxScale
                isHovered={false}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(110deg,rgba(8,6,4,0.93) 0%,rgba(8,6,4,0.5) 46%,rgba(8,6,4,0.1) 100%)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(245,200,66,0.1) 0%,transparent 50%)' }} />

              <div style={{ position: 'absolute', top: 24, left: 32 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'rgba(245,200,66,0.12)', border: '1px solid rgba(245,200,66,0.28)',
                  borderRadius: 999, padding: '6px 16px', backdropFilter: 'blur(12px)',
                }}>
                  <Crown size={11} color="#f5c842" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#f5c842', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Top Pick</span>
                </div>
              </div>

              <div className="crunch-featured-content">
                <motion.h2
                  variants={{ hovered: { x: 5 } }}
                  transition={{ duration: 0.3 }}
                  style={{ margin: '0 0 8px', fontSize: 'clamp(22px,3.5vw,50px)', fontWeight: 800, color: '#f0ede8', lineHeight: 1.08, letterSpacing: '-0.02em' }}
                >
                  {topPick.name}
                </motion.h2>
                <p style={{ margin: '0 0 18px', fontSize: 'clamp(12px,1.2vw,14.5px)', color: 'rgba(240,237,232,0.5)', maxWidth: 480, lineHeight: 1.75, fontWeight: 300 }}>
                  {topPick.description}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ color: 'rgba(240,237,232,0.35)', fontSize: 13 }}>{topPick.category}</span>
                  <span style={{ fontSize: 'clamp(18px,2vw,24px)', fontWeight: 800, color: '#f5c842' }}>₱{topPick.price}</span>
                  <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    onClick={handleOrder}
                    style={{ marginLeft: 'auto', background: '#f5c842', border: 'none', borderRadius: 13, padding: 'clamp(10px,1.2vw,13px) clamp(20px,2vw,32px)', fontSize: 13, fontWeight: 700, color: '#111', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}
                  >
                    Order Now
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </Reveal>
        )}

        {/* Count label */}
        {!loadingProducts && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
            <div style={{ width: 22, height: 1, background: '#f5c842', flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(240,237,232,0.2)', letterSpacing: '0.2em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              {filtered.length} item{filtered.length !== 1 ? 's' : ''}
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
          </div>
        )}

        {/* Product Grid */}
        {loadingProducts ? (
          <div className="crunch-grid">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={category + search}
              className="crunch-grid"
              variants={stagger}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
            >
              {filtered.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} onOrder={handleOrder} />
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Empty state */}
        {!loadingProducts && filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            style={{ textAlign: 'center', padding: 'clamp(60px,12vw,120px) 0' }}
          >
            <div style={{ fontSize: 52, marginBottom: 16 }}>🍗</div>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'rgba(240,237,232,0.36)', margin: '0 0 8px' }}>Nothing found</p>
            <p style={{ fontSize: 14, color: 'rgba(240,237,232,0.18)', fontWeight: 300 }}>Try a different search or category</p>
            {search && (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={() => setSearch('')}
                style={{ marginTop: 20, background: 'rgba(245,200,66,0.1)', border: '1px solid rgba(245,200,66,0.25)', borderRadius: 12, padding: '10px 24px', fontSize: 13, fontWeight: 600, color: '#f5c842', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}
              >
                Clear search
              </motion.button>
            )}
          </motion.div>
        )}

        {/* ── Deals & Promos ── */}
        <PromoSection promos={promos} loading={loadingPromos} />

        {/* ── Signature Flavors ── */}
        {(loadingFlavors || flavors.length > 0) && (
          <Reveal style={{ marginTop: 100 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 28, height: 1, background: '#f5c842' }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#f5c842' }}>
                Available in every chicken
              </span>
            </div>
            <h2 className="crunch-section-title" style={{ fontWeight: 800, color: '#f0ede8', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Signature <em style={{ color: '#f5c842', fontStyle: 'italic' }}>Flavors</em>
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(240,237,232,0.34)', maxWidth: 400, margin: '0 0 36px', fontWeight: 300, lineHeight: 1.7 }}>
              Tap any flavor to preview it. Pick your favorite before ordering.
            </p>

            {loadingFlavors ? (
              <div className="crunch-flavors-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ height: 52, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.09)', position: 'relative', overflow: 'hidden' }}>
                    <motion.div animate={{ x: ['-100%', '200%'] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.1 }}
                      style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.05),transparent)' }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="crunch-flavors-grid">
                {flavors.map((f, i) => (
                  <FlavorCard
                    key={f.name}
                    flavor={f}
                    index={i}
                    expanded={expandedFlavor === f.name}
                    onToggle={() => setExpandedFlavor(expandedFlavor === f.name ? null : f.name)}
                  />
                ))}
              </div>
            )}
          </Reveal>
        )}

        {/* ── Full Menu ── */}
        {(loadingMenu || menuSections.length > 0) && (
          <Reveal style={{ marginTop: 100 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 28, height: 1, background: '#f5c842' }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#f5c842' }}>Full Menu</span>
            </div>
            <h2 className="crunch-section-title" style={{ fontWeight: 800, color: '#f0ede8', margin: '0 0 44px', letterSpacing: '-0.02em' }}>
              Everything <em style={{ color: '#f5c842', fontStyle: 'italic' }}>We Offer</em>
            </h2>

            {loadingMenu ? (
              <div className="crunch-menu-grid">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ height: 320, borderRadius: 24, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
                    <motion.div animate={{ x: ['-100%', '200%'] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                      style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)' }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="crunch-menu-grid">
                {menuSections.map((section, i) => (
                  <FullMenuCard key={section.id} section={section} delay={i * 0.07} />
                ))}
              </div>
            )}
          </Reveal>
        )}
      </div>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: 'clamp(36px,6vw,52px) 0 36px', position: 'relative', zIndex: 1 }}>
        <div className="crunch-pad" style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div className="crunch-footer-row">
            <div>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12, display: 'block' }}
              >
                <span style={{ fontWeight: 800, fontSize: 17, color: '#f0ede8', letterSpacing: '-0.02em' }}>
                  The <span style={{ color: '#f5c842' }}>Crunch</span>
                </span>
              </button>
              <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.26)', margin: '0 0 14px', lineHeight: 1.65, maxWidth: 220, fontWeight: 300 }}>
                6 Falcon St., cor Dahlia Fairview,<br />Quezon City, Philippines
              </p>
              <motion.a
                href="https://www.google.com/maps/place/The+Crunch+-+Fairview+Branch/@14.7002687,121.0662915,21z"
                target="_blank" rel="noopener noreferrer"
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(245,200,66,0.07)', border: '1px solid rgba(245,200,66,0.16)', borderRadius: 10, padding: '7px 13px', textDecoration: 'none', transition: 'background 0.2s, border-color 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(245,200,66,0.13)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(245,200,66,0.07)' }}
              >
                <MapPin size={13} color="#f5c842" />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#f5c842' }}>View on Google Maps</span>
              </motion.a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(240,237,232,0.18)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Follow Us</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Instagram', href: 'https://www.instagram.com/thecrunchfairview' },
                  { label: 'Facebook',  href: 'https://www.facebook.com/thecrunchfairview' },
                ].map(s => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 14, fontWeight: 500, color: 'rgba(240,237,232,0.38)', textDecoration: 'none', transition: 'color 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f5c842' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(240,237,232,0.38)' }}>
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div style={{ paddingTop: 22, borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
            <span style={{ fontSize: 11.5, color: 'rgba(240,237,232,0.14)', fontWeight: 300 }}>
              © {new Date().getFullYear()} The Crunch Fairview. All rights reserved.
            </span>
          </div>
        </div>
      </footer>

      {/* ── Feedback Button (floating) ── */}
      <FeedbackButton />

    </div>
  )
}
