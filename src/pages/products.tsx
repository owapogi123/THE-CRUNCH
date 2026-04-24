import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useScroll, useTransform, useInView, type Variants } from 'framer-motion'
import { Search, Star, Flame, Crown, Clock, ChevronDown, Droplets } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

const NAV_H    = 68
const BANNER_H = 44
const TAB_TOP  = NAV_H + BANNER_H

const CATEGORIES = ['All', 'Chicken', 'Sides', 'Drinks', 'Combos'] as const
type Category = typeof CATEGORIES[number]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 48 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.11, duration: 0.75, ease: [0.22, 1, 0.36, 1] },
  }),
}

const SP  = { type: 'spring' as const, stiffness: 340, damping: 30 }
const SPG = { type: 'spring' as const, stiffness: 200, damping: 24 }

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

interface MenuItem   { name: string; price: number; tag?: string; note?: string; img?: string }
interface FlavorItem { name: string; accent: string; desc: string; img: string }

const PLACEHOLDER = 'https://placehold.co/600x400/1a1208/f5c842?text=Coming+Soon'

const STATIC_PRODUCTS: Product[] = [
  { id: 1,  name: 'Whole Chicken',               menuName: 'Whole Crispy Fried Chicken',          category: 'Chicken', rating: 4.9, badge: 'Bestseller', description: '12 pcs | Perfect for 4–6 pax. Choice of 2 Flavors.',            price: 598, spicy: false, img: 'https://bit.ly/4ckRqHY' },
  { id: 2,  name: 'Half Chicken',                menuName: 'Half Crispy Fried Chicken',           category: 'Chicken', rating: 4.8, badge: 'Hot',        description: '6 pcs | Perfect for 2–3 pax. Choice of 1 Flavor.',             price: 328, spicy: true,  img: 'https://bit.ly/3P8sz0j' },
  { id: 3,  name: 'Chicken Shots w/ Rice',       menuName: 'Crispy Chicken Shots with Drink',     category: 'Chicken', rating: 4.7, badge: 'New',        description: 'Crispy bite-sized chicken shots served with rice.',             price: 88,  spicy: false, img: 'https://bit.ly/40Z9n7T' },
  { id: 4,  name: 'Chicken Skin w/ Rice',        menuName: 'Chicken Skin with Rice and Drink',    category: 'Chicken', rating: 4.5, badge: '',           description: 'Ultra-crispy chicken skin served with steamed rice.',           price: 78,  spicy: false, img: 'https://bit.ly/3P6DcAK' },
  { id: 5,  name: '2 pcs. Chicken w/ Rice',      menuName: '2 pcs. Chicken With Rice and Drink',  category: 'Chicken', rating: 4.6, badge: 'Fan Fave',   description: '2 pieces of crispy fried chicken with steamed rice.',           price: 148, spicy: false, img: 'https://bit.ly/4r5rfZI' },
  { id: 6,  name: '3 pcs. Chicken w/ Rice',      menuName: '3 pcs. Chicken With Rice and Drink',  category: 'Chicken', rating: 4.8, badge: 'Bestseller', description: '3 pieces of crispy fried chicken with steamed rice.',           price: 188, spicy: false, img: 'https://tinyurl.com/zt8x3j3j' },
  { id: 7,  name: '1 pc. Chicken w/ Rice',       menuName: '1 pc. Chicken',                      category: 'Chicken', rating: 4.5, badge: '',           description: 'Solo rice meal. Choice of Original or Spicy.',                 price: 80,  spicy: false, img: 'https://bit.ly/4r5rfZI' },
  { id: 10, name: 'Chicken Skin Bucket',         menuName: 'Classic Chicken Skin Bucket',         category: 'Sides',   rating: 4.7, badge: 'Must Try',   description: 'BBQ, Sour Cream, or Cheese — choose your favorite.',           price: 140, spicy: false, img: 'https://bit.ly/3P6DcAK' },
  { id: 11, name: 'Chicken Shots Bucket',        menuName: 'Chicken Shots Bucket',                category: 'Sides',   rating: 4.6, badge: '',           description: 'A full bucket of our bite-sized crispy chicken shots.',         price: 160, spicy: false, img: 'https://bit.ly/40Z9n7T' },
  { id: 12, name: 'Twister Fries',               menuName: 'Twister Fries',                       category: 'Sides',   rating: 4.8, badge: 'Must Try',   description: 'Seasoned spiral-cut fries — crispy, seasoned, and addictive.', price: 140, spicy: false, img: 'https://i.pinimg.com/736x/e1/fe/5d/e1fe5d75042f22074b9ec16f1db491f4.jpg' },
  { id: 13, name: 'Regular Fries',               menuName: 'Regular Fries',                       category: 'Sides',   rating: 4.4, badge: '',           description: 'Classic golden fries, perfectly salted and crispy.',            price: 69,  spicy: false, img: 'https://i.pinimg.com/1200x/95/02/12/9502126d74d78185aca0697e53c91197.jpg' },
  { id: 14, name: 'Tteokbokki',                  menuName: 'Tteokbokki',                          category: 'Sides',   rating: 4.5, badge: '',           description: 'Chewy Korean rice cakes in a spicy-sweet sauce.',              price: 85,  spicy: true,  img: 'https://bit.ly/3MMEeRT' },
  { id: 15, name: 'Fishcake',                    menuName: 'Fishcake',                            category: 'Sides',   rating: 4.6, badge: 'Bestseller', description: 'Savory fishcake slices — the perfect crowd-pleasing add-on.',  price: 85,  spicy: false, img: 'https://bit.ly/4s9ZvUC' },
  { id: 16, name: 'Kimchi',                      menuName: 'Kimchi',                              category: 'Sides',   rating: 4.3, badge: '',           description: 'Traditional fermented kimchi. Tangy, spicy, and punchy.',      price: 45,  spicy: true,  img: 'https://bit.ly/47bPoX5' },
  { id: 17, name: 'The Crunch Burger w/ Cheese', menuName: 'The Crunch Burger with Cheese',       category: 'Sides',   rating: 4.7, badge: 'Must Try',   description: 'Crispy chicken on a toasted bun, topped with melted cheese.',  price: 85,  spicy: false, img: 'https://i.pinimg.com/736x/d4/38/09/d4380931a50783483fc53d55209245e1.jpg' },
  { id: 18, name: 'The Crunch Burger',           menuName: 'The Crunch Burger',                   category: 'Sides',   rating: 4.6, badge: 'Must Try',   description: 'Crispy chicken on a toasted bun with fresh lettuce & tangy sauce. +₱5 with cheese.', price: 80, spicy: false, img: 'https://i.pinimg.com/736x/d4/38/09/d4380931a50783483fc53d55209245e1.jpg' },
  { id: 19, name: 'Crispy Potato Chips',         menuName: 'Crispy Potato Chips',                 category: 'Sides',   rating: 4.5, badge: '',           description: 'Evenly seasoned — rich, savory, and impossible to put down.',  price: 69,  spicy: false, img: 'https://i.pinimg.com/736x/a4/a5/cd/a4a5cd6b777e7bb789ee02288b6eb4d2.jpg' },
  { id: 20, name: 'Kiwi Fruit Soda',             menuName: 'Kiwi Fruit Soda',                     category: 'Drinks',  rating: 4.8, badge: 'Bestseller', description: 'Bright, citrusy kiwi soda. Bestselling flavor.',               price: 50,  spicy: false, img: 'https://tinyurl.com/56rwyuj8',  isDrink: true },
  { id: 21, name: 'Lychee Fruit Soda',           menuName: 'Lychee Fruit Soda',                   category: 'Drinks',  rating: 4.6, badge: '',           description: 'Floral, delicate lychee — light and perfectly sweet.',         price: 50,  spicy: false, img: 'https://tinyurl.com/yu5uz739',  isDrink: true },
  { id: 22, name: 'Green Apple Fruit Soda',      menuName: 'Green Apple Fruit Soda',              category: 'Drinks',  rating: 4.5, badge: '',           description: 'Tangy green apple soda — sweet, sour, and refreshing.',        price: 50,  spicy: false, img: 'https://tinyurl.com/mrydynur',  isDrink: true },
  { id: 23, name: 'Blueberry Fruit Soda',        menuName: 'Blueberry Fruit Soda',                category: 'Drinks',  rating: 4.5, badge: '',           description: 'Rich and berry-forward blueberry soda. Deep, sweet flavor.',   price: 50,  spicy: false, img: 'https://shorturl.at/PbnDy',    isDrink: true },
  { id: 24, name: 'Strawberry Fruit Soda',       menuName: 'Strawberry Fruit Soda',               category: 'Drinks',  rating: 4.6, badge: '',           description: 'Bright strawberry soda. Sweet, vibrant, crowd-pleasing.',      price: 50,  spicy: false, img: 'https://tinyurl.com/3ccde5sv', isDrink: true },
  { id: 25, name: 'Mango Fruit Soda',            menuName: 'Mango Fruit Soda',                    category: 'Drinks',  rating: 4.7, badge: '',           description: 'Tropical mango fizz — juicy, golden, and summer-ready.',       price: 50,  spicy: false, img: 'https://tinyurl.com/mrya39cc', isDrink: true },
  { id: 26, name: 'Kiwi Ice Blended',            menuName: 'Kiwi Ice Blended',                    category: 'Drinks',  rating: 4.7, badge: '',           description: 'Chilled to perfection — bright, citrusy, slightly creamy.',    price: 79,  spicy: false, img: 'https://tinyurl.com/56rwyuj8', isDrink: true },
  { id: 30, name: '2 pcs. Chicken w/ Rice & Drink', menuName: '2 pcs. Chicken With Rice and Drink', category: 'Combos', rating: 4.8, badge: 'Best Value', description: '2 pcs. crispy chicken + steamed rice + fruit soda.', price: 188, spicy: false, img: 'https://bit.ly/4r5rfZI' },
  { id: 31, name: '3 pcs. Chicken w/ Rice & Drink', menuName: '3 pcs. Chicken With Rice and Drink', category: 'Combos', rating: 4.9, badge: 'Best Value', description: '3 pcs. crispy chicken + steamed rice + fruit soda.', price: 228, spicy: false, img: 'https://tinyurl.com/zt8x3j3j' },
  { id: 32, name: 'Chicken Shots w/ Rice & Drink',  menuName: 'Crispy Chicken Shots with Drink',    category: 'Combos', rating: 4.7, badge: 'Fan Fave',   description: 'Crispy chicken shots + steamed rice + fruit soda.',  price: 128, spicy: false, img: 'https://bit.ly/40Z9n7T' },
  { id: 33, name: 'Chicken Skin w/ Rice & Drink',   menuName: 'Chicken Skin with Rice and Drink',   category: 'Combos', rating: 4.5, badge: '',           description: 'Crispy chicken skin + steamed rice + fruit soda.',   price: 118, spicy: false, img: 'https://bit.ly/3P6DcAK' },
]

const BADGE_CONFIG: Record<string, { label: string; bg: string; textDark?: boolean }> = {
  'Bestseller': { label: 'Bestseller', bg: '#f5c842', textDark: true },
  'Hot':        { label: 'Hot',        bg: '#ef4444' },
  'New':        { label: 'New',        bg: '#8b5cf6' },
  'Fan Fave':   { label: 'Fan Fave',   bg: '#16a34a' },
  'Best Value': { label: 'Best Value', bg: '#0284c7' },
  'Must Try':   { label: 'Must Try',   bg: '#7c3aed' },
}

const SIGNATURE_FLAVORS: FlavorItem[] = [
  { name: 'Classic',         accent: '#fbbf24', desc: 'Golden, lightly seasoned, perfectly crispy — the OG.',          img: 'https://url-shortener.me/HH43' },
  { name: 'Honey Garlic',    accent: '#f59e0b', desc: 'Sweet honey meets bold roasted garlic. Sticky & addictive.',    img: 'https://url-shortener.me/HH3Z' },
  { name: 'Teriyaki',        accent: '#8b5cf6', desc: 'Savory-sweet Japanese glaze with a glossy caramel finish.',     img: 'https://url-shortener.me/HH44' },
  { name: 'Texas BBQ',       accent: '#ef4444', desc: 'Smoky, tangy, rich — slow-cooked BBQ vibes in every bite.',     img: 'https://url-shortener.me/HH47' },
  { name: 'Garlic Parmesan', accent: '#9ca3af', desc: 'Creamy parmesan dusted over buttery garlic-coated chicken.',    img: 'https://url-shortener.me/HH49' },
  { name: 'K-Style',         accent: '#f97316', desc: 'Korean-inspired sweet chili glaze with a punchy depth.',        img: 'https://url-shortener.me/HH4C' },
  { name: 'Spicy K-Style',   accent: '#dc2626', desc: 'K-Style cranked up — fiery heat that builds with every piece.', img: 'https://url-shortener.me/HH4G' },
]

function getIsAuthenticated(): boolean {
  const token = localStorage.getItem('authToken')
  const flag  = localStorage.getItem('isAuthenticated') === 'true'
  if (!token || !flag) {
    localStorage.removeItem('authToken')
    localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('userName')
    localStorage.removeItem('userRole')
    localStorage.removeItem('userId')
    return false
  }
  return true
}

function Reveal({ children, custom = 0, style = {} }: { children: React.ReactNode; custom?: number; style?: React.CSSProperties }) {
  const ref      = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-72px' })
  return (
    <motion.div ref={ref} variants={fadeUp} initial="hidden" animate={isInView ? 'visible' : 'hidden'} custom={custom} style={style}>
      {children}
    </motion.div>
  )
}

interface MenuItem { name: string; price: number; tag?: string; note?: string; img?: string }

function MenuRow({ item, index }: { item: MenuItem; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
      transition={{ delay: index * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div style={{ width: 46, height: 46, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#1a1208', border: '1px solid rgba(255,255,255,0.07)' }}>
        <img src={item.img || PLACEHOLDER} alt={item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER }} />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ fontSize: 13.5, color: 'rgba(240,237,232,0.72)', fontWeight: 400 }}>{item.name}</span>
        {item.tag && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,200,66,0.15)', color: '#f5c842', letterSpacing: '0.08em', textTransform: 'uppercase', border: '1px solid rgba(245,200,66,0.25)', whiteSpace: 'nowrap' }}>
            {item.tag}
          </span>
        )}
        {item.note && <span style={{ fontSize: 10, color: 'rgba(240,237,232,0.28)', fontStyle: 'italic' }}>{item.note}</span>}
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#f5c842', flexShrink: 0, marginLeft: 8 }}>₱{item.price}</span>
    </motion.div>
  )
}

function menuCardProps(delay = 0) {
  return {
    initial: { opacity: 0, y: 24 } as const,
    whileInView: { opacity: 1, y: 0 } as const,
    viewport: { once: true },
    transition: { duration: 0.6, delay },
    style: {
      background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 28, padding: '32px 28px',
      position: 'relative' as const, overflow: 'hidden',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 40px rgba(0,0,0,0.4)',
    },
  }
}

// ── Static menu data (display-only, no ordering logic) ──────────────────────

const WHOLE_HALF: MenuItem[] = [
  { name: 'Whole Chicken (12 pcs | 4–6 pax)', price: 598, tag: 'Choice of 2 Flavors', img: 'https://bit.ly/4ckRqHY' },
  { name: 'Half Chicken (6 pcs | 2–3 pax)',   price: 328, note: 'Choice of 1 Flavor',  img: 'https://bit.ly/3P8sz0j' },
]

const RICE_MEALS: MenuItem[] = [
  { name: '1 pc. Chicken w/ Rice',          price: 80,                     img: 'https://bit.ly/4r5rfZI' },
  { name: '2 pcs. Chicken w/ Rice',         price: 148,                    img: 'https://bit.ly/4r5rfZI' },
  { name: '3 pcs. Chicken w/ Rice',         price: 188, tag: 'Must Try',   img: 'https://tinyurl.com/zt8x3j3j' },
  { name: 'Chicken Shots w/ Rice',          price: 88,                     img: 'https://bit.ly/40Z9n7T' },
  { name: 'Chicken Skin w/ Rice',           price: 78,                     img: 'https://bit.ly/3P6DcAK' },
  { name: '2 pcs. Chicken w/ Rice & Drink', price: 188, tag: 'Bestseller', img: 'https://bit.ly/4r5rfZI' },
  { name: '3 pcs. Chicken w/ Rice & Drink', price: 228, tag: 'Bestseller', img: 'https://tinyurl.com/zt8x3j3j' },
  { name: 'Chicken Shots w/ Rice & Drink',  price: 128,                    img: 'https://bit.ly/40Z9n7T' },
  { name: 'Chicken Skin w/ Rice & Drink',   price: 118,                    img: 'https://bit.ly/3P6DcAK' },
]

const SIDES_LIST: MenuItem[] = [
  { name: 'Classic Chicken Skin Bucket',   price: 140, tag: 'Must Try',   img: 'https://bit.ly/3P6DcAK' },
  { name: 'Flavored Chicken Skin Bucket',  price: 140,                    img: 'https://bit.ly/3P6DcAK' },
  { name: 'Chicken Shots Bucket',          price: 160,                    img: 'https://bit.ly/40Z9n7T' },
  { name: 'Twister Fries',                price: 140, tag: 'Must Try',   img: 'https://i.pinimg.com/736x/e1/fe/5d/e1fe5d75042f22074b9ec16f1db491f4.jpg' },
  { name: 'Regular Fries',                price: 69,                     img: 'https://i.pinimg.com/1200x/95/02/12/9502126d74d78185aca0697e53c91197.jpg' },
  { name: 'Crispy Potato Chips',          price: 69,                     img: 'https://i.pinimg.com/736x/a4/a5/cd/a4a5cd6b777e7bb789ee02288b6eb4d2.jpg' },
  { name: 'Tteokbokki',                   price: 85,                     img: 'https://bit.ly/3MMEeRT' },
  { name: 'Fishcake',                     price: 85,  tag: 'Bestseller', img: 'https://bit.ly/4s9ZvUC' },
  { name: 'Kimchi',                        price: 45,                     img: 'https://bit.ly/47bPoX5' },
  { name: 'The Crunch Burger',             price: 80,  tag: 'Must Try',   img: 'https://i.pinimg.com/736x/d4/38/09/d4380931a50783483fc53d55209245e1.jpg', note: '+₱5 with cheese' },
  { name: 'The Crunch Burger w/ Cheese',  price: 85,  tag: 'Must Try',   img: 'https://i.pinimg.com/736x/d4/38/09/d4380931a50783483fc53d55209245e1.jpg' },
]

const FRUIT_SODA: MenuItem[] = [
  { name: 'Kiwi',        price: 50, tag: 'Bestseller', img: 'https://tinyurl.com/56rwyuj8' },
  { name: 'Lychee',      price: 50,                    img: 'https://tinyurl.com/yu5uz739' },
  { name: 'Green Apple', price: 50,                    img: 'https://tinyurl.com/mrydynur' },
  { name: 'Blueberry',   price: 50,                    img: 'https://shorturl.at/PbnDy' },
  { name: 'Strawberry',  price: 50,                    img: 'https://tinyurl.com/3ccde5sv' },
  { name: 'Mango',       price: 50,                    img: 'https://tinyurl.com/mrya39cc' },
]

const ICE_BLENDED: MenuItem[] = [
  { name: 'Kiwi Ice Blended', price: 79, img: 'https://tinyurl.com/56rwyuj8' },
]

export default function Products() {
  const navigate = useNavigate()
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => getIsAuthenticated())

  useEffect(() => {
    setIsAuthenticated(getIsAuthenticated())
    const sync = () => setIsAuthenticated(getIsAuthenticated())
    window.addEventListener('authChange', sync)
    return () => window.removeEventListener('authChange', sync)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('authToken'); localStorage.removeItem('isAuthenticated')
    localStorage.removeItem('userName');  localStorage.removeItem('userRole'); localStorage.removeItem('userId')
    window.dispatchEvent(new Event('authChange'))
    navigate('/products')
  }

  const [products, setProducts]             = useState<Product[]>(STATIC_PRODUCTS)
  const [category, setCategory]             = useState<Category>('All')
  const [search, setSearch]                 = useState('')
  const [hoveredId, setHoveredId]           = useState<number | null>(null)
  const [isOpen, setIsOpen]                 = useState(false)
  const [expandedFlavor, setExpandedFlavor] = useState<string | null>(null)

  const heroRef     = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()
  const heroY       = useTransform(scrollY, [0, 400], [0, 60])
  const heroOpacity = useTransform(scrollY, [0, 350], [1, 0.4])

  useEffect(() => {
    const check = () => {
      const now = new Date(); const day = now.getDay()
      const t = now.getHours() + now.getMinutes() / 60
      setIsOpen((day >= 1 && day <= 5 && t >= 10 && t < 22) || ((day === 0 || day === 6) && t >= 11 && t < 20.5))
    }
    check()
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    fetch('/api/products')
      .then(r => r.json())
      .then((d: any[]) => {
        if (!d?.length) return
        const merged: Product[] = STATIC_PRODUCTS.map(staticItem => {
          const b = d.find(x => x.id === staticItem.id)
          if (!b) return staticItem
          return {
            ...staticItem, ...b,
            img:         b.img         || staticItem.img,
            badge:       b.badge       ?? staticItem.badge,
            spicy:       b.spicy       ?? staticItem.spicy,
            isDrink:     b.isDrink     ?? staticItem.isDrink,
            menuName:    b.menuName    || staticItem.menuName,
            description: b.description || staticItem.description,
            rating:      b.rating      ?? staticItem.rating,
          } as Product
        })
        const staticIds = new Set(STATIC_PRODUCTS.map(p => p.id))
        const newItems: Product[] = d
          .filter(b => !staticIds.has(b.id))
          .map(b => ({ badge: '', spicy: false, isDrink: false, rating: 4.5, description: '', menuName: b.name ?? '', img: b.img || PLACEHOLDER, ...b } as Product))
        setProducts([...merged, ...newItems])
      })
      .catch(() => {})
  }, [])

  const filtered = products.filter(p =>
    (category === 'All' || p.category === category) &&
    p.name.toLowerCase().includes(search.toLowerCase())
  )
  const topPick = filtered.find(p => p.badge === 'Bestseller') ?? filtered[0]

  // All "Order" actions on this page navigate to /usersmenu where the
  // OrderTypeModal lives. No modal is rendered here.
  const handleOrder = () => navigate('/usersmenu?showOrderModal=true')

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: '#0e0c0a', minHeight: '100vh', color: '#f0ede8', position: 'relative' }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap" rel="stylesheet" />

      {/* Ambient glows */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-8%', left: '10%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,200,66,0.06) 0%,transparent 65%)' }} />
        <div style={{ position: 'absolute', top: '45%', right: '-8%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,200,66,0.035) 0%,transparent 65%)' }} />
        <div style={{ position: 'absolute', bottom: '-8%', left: '30%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,200,66,0.045) 0%,transparent 65%)' }} />
      </div>

      {/* ── Nav ── */}
      <motion.header initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'sticky', top: 0, zIndex: 200, height: NAV_H, background: 'rgba(14,12,10,0.88)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 20, color: '#f0ede8', letterSpacing: '-0.02em' }}>
              The <span style={{ color: '#f5c842' }}>Crunch</span>
            </span>
          </button>

          <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {(['Home', 'Menu', 'About'] as const).map((label, i) => {
              const paths = ['/', '/usersmenu', '/aboutthecrunch']
              if (label === 'Menu') {
                return (
                  <button
                    key={label}
                    onClick={() => navigate('/usersmenu?showOrderModal=true')}
                    style={{ color: 'rgba(240,237,232,0.45)', fontSize: 13.5, fontWeight: 500, padding: '7px 14px', borderRadius: 10, transition: 'all 0.2s', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f0ede8'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(240,237,232,0.45)'; e.currentTarget.style.background = 'transparent' }}
                  >
                    {label}
                  </button>
                )
              }
              return (
                <Link
                  key={label}
                  to={paths[i]}
                  style={{ color: 'rgba(240,237,232,0.45)', fontSize: 13.5, textDecoration: 'none', fontWeight: 500, padding: '7px 14px', borderRadius: 10, transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f0ede8'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(240,237,232,0.45)'; e.currentTarget.style.background = 'transparent' }}
                >
                  {label}
                </Link>
              )
            })}

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
        </div>
      </motion.header>

      {/* ── Status Banner ── */}
      <div style={{ position: 'sticky', top: NAV_H, zIndex: 190, height: BANNER_H, background: 'rgba(16,13,9,0.94)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(245,200,66,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, overflow: 'hidden', padding: '0 40px' }}>
        <motion.div animate={{ x: ['-120%', '220%'] }} transition={{ duration: 4, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
          style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', background: 'linear-gradient(90deg,transparent,rgba(245,200,66,0.06),transparent)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: isOpen ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${isOpen ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'}`, borderRadius: 999, padding: '4px 13px', flexShrink: 0 }}>
          <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.8, repeat: Infinity }}
            style={{ width: 6, height: 6, borderRadius: '50%', background: isOpen ? '#22c55e' : '#ef4444' }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: isOpen ? '#22c55e' : '#ef4444', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            {isOpen ? 'Open Now' : 'Closed'}
          </span>
        </div>
        <div style={{ width: 1, height: 13, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
        <Clock size={12} color="#f5c842" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)', whiteSpace: 'nowrap' }}>
          <span style={{ color: '#f0ede8', fontWeight: 600 }}>Mon – Fri</span>{'\u00A0\u00A0'}10:00 AM – 10:00 PM
        </span>
        <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(245,200,66,0.4)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'rgba(240,237,232,0.4)', whiteSpace: 'nowrap' }}>
          <span style={{ color: '#f0ede8', fontWeight: 600 }}>Sat – Sun</span>{'\u00A0\u00A0'}11:00 AM – 8:30 PM
        </span>
      </div>

      {/* ── Hero ── */}
      <div ref={heroRef} style={{ position: 'relative', overflow: 'hidden', padding: '92px 40px 72px' }}>
        <motion.div style={{ maxWidth: 1280, margin: '0 auto', y: heroY, opacity: heroOpacity }}>
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 28, height: 1, background: '#f5c842' }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#f5c842', fontFamily: "'Poppins', sans-serif" }}>The Crunch Fairview</span>
            </div>
          </motion.div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 40 }}>
            <div>
              <motion.h1 initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                style={{ fontFamily: "'Poppins', sans-serif", fontSize: 'clamp(52px,7vw,96px)', fontWeight: 900, color: '#f0ede8', margin: 0, lineHeight: 0.95, letterSpacing: '-0.03em' }}>
                Our<br /><em style={{ color: '#f5c842', fontStyle: 'italic' }}>Menu.</em>
              </motion.h1>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}
                style={{ color: 'rgba(240,237,232,0.42)', fontSize: 15.5, margin: '22px 0 0', maxWidth: 400, lineHeight: 1.8, fontWeight: 300 }}>
                Fresh, hot, and fan-favorite — discover what makes The Crunch unforgettable.
              </motion.p>
            </div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} style={{ position: 'relative', width: 340 }}>
              <Search size={14} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'rgba(240,237,232,0.22)', pointerEvents: 'none', zIndex: 1 }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search the menu..."
                style={{ width: '100%', padding: '14px 18px 14px 46px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxSizing: 'border-box', fontFamily: "'Poppins', sans-serif", color: '#f0ede8', transition: 'border-color 0.2s, background 0.2s' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(245,200,66,0.45)'; e.target.style.background = 'rgba(255,255,255,0.08)' }}
                onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,0.1)';  e.target.style.background = 'rgba(255,255,255,0.05)' }}
              />
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* ── Category Tabs ── */}
      <div style={{ position: 'sticky', top: TAB_TOP, zIndex: 180, background: 'rgba(14,12,10,0.94)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', display: 'flex', overflowX: 'auto' }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              style={{ position: 'relative', padding: '16px 22px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: category === cat ? 700 : 400, fontSize: 13.5, fontFamily: "'Poppins', sans-serif", whiteSpace: 'nowrap', color: category === cat ? '#f5c842' : 'rgba(240,237,232,0.35)', transition: 'color 0.2s', display: 'flex', alignItems: 'center', gap: 6 }}>
              {cat === 'Drinks' && <Droplets size={12} color={category === cat ? '#f5c842' : 'rgba(240,237,232,0.28)'} />}
              {cat}
              {category === cat && <motion.div layoutId="tabIndicator" style={{ position: 'absolute', bottom: 0, left: 12, right: 12, height: 2, background: '#f5c842', borderRadius: '2px 2px 0 0' }} />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Drinks notice ── */}
      <AnimatePresence>
        {category === 'Drinks' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden', background: 'rgba(245,200,66,0.06)', borderBottom: '1px solid rgba(245,200,66,0.1)' }}>
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '12px 40px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Droplets size={14} color="#f5c842" />
              <span style={{ fontSize: 12.5, color: 'rgba(240,237,232,0.55)', fontWeight: 400 }}>
                Fruit Soda available in <strong style={{ color: '#f5c842' }}>16oz (₱50)</strong> and <strong style={{ color: '#f5c842' }}>22oz (₱60)</strong>. Click <strong style={{ color: '#f0ede8' }}>Order</strong> to go to the menu.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '64px 40px 100px', position: 'relative', zIndex: 1 }}>

        {/* ── Hero featured card ── */}
        {!search && topPick && (
          <Reveal style={{ marginBottom: 80 }}>
            <motion.div whileHover="hovered" style={{ borderRadius: 32, overflow: 'hidden', position: 'relative', height: 460, cursor: 'pointer', background: '#0a0806' }}>
              <motion.img src={topPick.img || PLACEHOLDER} alt={topPick.name}
                variants={{ hovered: { scale: 1.05 } }} transition={{ duration: 0.75 }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.82) saturate(1.1)', display: 'block' }}
                onError={e => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg,rgba(8,6,4,0.93) 0%,rgba(8,6,4,0.52) 46%,rgba(8,6,4,0.08) 100%)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(245,200,66,0.09) 0%,transparent 52%)' }} />
              <div style={{ position: 'absolute', top: 36, left: 44 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(245,200,66,0.12)', border: '1px solid rgba(245,200,66,0.28)', borderRadius: 999, padding: '6px 16px', backdropFilter: 'blur(12px)' }}>
                  <Crown size={11} color="#f5c842" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#f5c842', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Top Pick</span>
                </div>
              </div>
              <div style={{ position: 'absolute', bottom: 48, left: 48, right: 48 }}>
                <motion.h2 variants={{ hovered: { x: 6 } }} transition={{ duration: 0.3 }}
                  style={{ fontFamily: "'Poppins', sans-serif", margin: '0 0 10px', fontSize: 'clamp(28px,4vw,52px)', fontWeight: 800, color: '#f0ede8', lineHeight: 1.08, letterSpacing: '-0.02em' }}>
                  {topPick.name}
                </motion.h2>
                <p style={{ margin: '0 0 20px', fontSize: 14.5, color: 'rgba(240,237,232,0.52)', maxWidth: 500, lineHeight: 1.75, fontWeight: 300 }}>{topPick.description}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Star size={12} fill="#f5c842" color="#f5c842" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f5c842' }}>{topPick.rating}</span>
                  </div>
                  <span style={{ color: 'rgba(240,237,232,0.2)' }}>·</span>
                  <span style={{ color: 'rgba(240,237,232,0.38)', fontSize: 13 }}>{topPick.category}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#f5c842', marginLeft: 8 }}>₱{topPick.price}</span>
                  <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    onClick={handleOrder}
                    style={{ marginLeft: 'auto', background: '#f5c842', border: 'none', borderRadius: 14, padding: '12px 32px', fontSize: 14, fontWeight: 700, color: '#111', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
                    Order Now
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </Reveal>
        )}

        {/* ── Items count ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 44 }}>
          <div style={{ width: 24, height: 1, background: '#f5c842', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(240,237,232,0.22)', letterSpacing: '0.2em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
        </div>

        {/* ── Product Grid ── */}
        <AnimatePresence mode="wait">
          <motion.div key={category + search}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 22 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {filtered.map((p, i) => {
              const badge   = BADGE_CONFIG[p.badge] ?? null
              const isHov   = hoveredId === p.id
              const isDrink = !!p.isDrink
              return (
                <motion.div key={p.id}
                  initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.055, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  onHoverStart={() => setHoveredId(p.id)} onHoverEnd={() => setHoveredId(null)} whileHover={{ y: -10 }}
                  style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: 28, overflow: 'hidden', border: `1px solid ${isHov ? (isDrink ? 'rgba(147,210,255,0.35)' : 'rgba(245,200,66,0.32)') : 'rgba(255,255,255,0.08)'}`, boxShadow: isHov ? `0 32px 72px rgba(0,0,0,0.6), 0 0 0 1px ${isDrink ? 'rgba(147,210,255,0.08)' : 'rgba(245,200,66,0.08)'}, inset 0 1px 0 rgba(255,255,255,0.07)` : '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'border-color 0.3s, box-shadow 0.3s', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: isHov ? (isDrink ? 'linear-gradient(90deg,transparent,rgba(147,210,255,0.5),transparent)' : 'linear-gradient(90deg,transparent,rgba(245,200,66,0.5),transparent)') : 'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)', transition: 'background 0.35s', zIndex: 2 }} />
                  {isDrink && (
                    <div style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(99,179,237,0.14)', backdropFilter: 'blur(12px)', borderRadius: '0 28px 0 16px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, zIndex: 3 }}>
                      <Droplets size={10} color="rgba(147,210,255,0.85)" />
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(147,210,255,0.85)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Fruit Soda</span>
                    </div>
                  )}
                  <div style={{ position: 'relative', height: 220, overflow: 'hidden', background: '#1a1208' }}>
                    <motion.img src={p.img || PLACEHOLDER} alt={p.name}
                      animate={{ scale: isHov ? 1.08 : 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isHov ? 'brightness(1.1) saturate(1.25)' : 'brightness(0.9) saturate(1.05)', transition: 'filter 0.4s', display: 'block' }}
                      onError={e => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,transparent 38%,rgba(8,6,4,0.82))' }} />
                    {isHov && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, background: isDrink ? 'linear-gradient(135deg,rgba(99,179,237,0.07),transparent)' : 'linear-gradient(135deg,rgba(245,200,66,0.08),transparent)' }} />}
                    {badge && <span style={{ position: 'absolute', top: 14, left: 14, background: badge.bg, color: badge.textDark ? '#111' : '#fff', fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 999, letterSpacing: '0.05em', textTransform: 'uppercase', boxShadow: `0 4px 16px ${badge.bg}55` }}>{badge.label}</span>}
                    {p.spicy && (
                      <motion.div animate={{ rotate: isHov ? [0, -12, 12, 0] : 0 }} transition={{ duration: 0.45 }}
                        style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
                        <Flame size={14} color="#ef4444" />
                      </motion.div>
                    )}
                    <div style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', borderRadius: 999, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, border: '1px solid rgba(255,255,255,0.07)' }}>
                      <Star size={10} fill="#f5c842" color="#f5c842" />
                      <span style={{ color: '#f0ede8', fontSize: 12, fontWeight: 700 }}>{p.rating}</span>
                    </div>
                  </div>
                  <div style={{ padding: '18px 22px 22px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f0ede8', lineHeight: 1.3, letterSpacing: '-0.01em' }}>{p.name}</h3>
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', color: 'rgba(240,237,232,0.28)', border: '1px solid rgba(255,255,255,0.07)', marginTop: 2 }}>{p.category}</span>
                    </div>
                    <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'rgba(240,237,232,0.36)', lineHeight: 1.65, fontWeight: 300 }}>{p.description}</p>
                    {isDrink && (
                      <div style={{ display: 'flex', gap: 6, margin: '10px 0 14px' }}>
                        {[{ s: '16oz', price: 50 }, { s: '22oz', price: 60 }].map(sz => (
                          <span key={sz.s} style={{ fontSize: 10.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,200,66,0.08)', color: '#f5c842', border: '1px solid rgba(245,200,66,0.18)' }}>
                            {sz.s} — ₱{sz.price}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: isDrink ? 0 : 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Star size={11} fill="#f5c842" color="#f5c842" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#f5c842' }}>{p.rating}</span>
                        {!isDrink && <span style={{ fontSize: 14, fontWeight: 800, color: '#f5c842', marginLeft: 4 }}>₱{p.price}</span>}
                      </div>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={handleOrder}
                        style={{ background: isDrink ? 'rgba(99,179,237,0.15)' : '#f5c842', color: isDrink ? '#93c5fd' : '#111', border: isDrink ? '1px solid rgba(99,179,237,0.3)' : 'none', borderRadius: 12, padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Poppins', sans-serif", letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
                        Order
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        </AnimatePresence>

        {filtered.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: 'center', padding: '120px 0' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🍗</div>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'rgba(240,237,232,0.38)', margin: '0 0 8px' }}>Nothing found</p>
            <p style={{ fontSize: 14, color: 'rgba(240,237,232,0.2)', fontWeight: 300 }}>Try a different search or category</p>
          </motion.div>
        )}

        {/* ── Signature Flavors ── */}
        <Reveal style={{ marginTop: 104 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 28, height: 1, background: '#f5c842' }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#f5c842' }}>Available in every chicken</span>
          </div>
          <h2 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 'clamp(28px,4vw,48px)', fontWeight: 800, color: '#f0ede8', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            Signature <em style={{ color: '#f5c842', fontStyle: 'italic' }}>Flavors</em>
          </h2>
          <p style={{ fontSize: 14.5, color: 'rgba(240,237,232,0.36)', maxWidth: 420, margin: '0 0 40px', fontWeight: 300, lineHeight: 1.7 }}>
            Click any flavor to see what it looks like. Pick your favorite.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(175px,1fr))', gap: 12 }}>
            {SIGNATURE_FLAVORS.map((f, i) => {
              const isExpanded = expandedFlavor === f.name
              return (
                <motion.div key={f.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.5 }} style={{ gridColumn: isExpanded ? 'span 2' : 'span 1' }}>
                  <motion.button onClick={() => setExpandedFlavor(isExpanded ? null : f.name)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    style={{ width: '100%', background: isExpanded ? `${f.accent}18` : 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: `1.5px solid ${isExpanded ? f.accent : 'rgba(255,255,255,0.09)'}`, borderRadius: isExpanded ? '18px 18px 0 0' : 18, padding: '17px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: "'Poppins', sans-serif", transition: 'all 0.25s', boxShadow: isExpanded ? `0 0 32px ${f.accent}20, inset 0 1px 0 rgba(255,255,255,0.06)` : 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#f0ede8', letterSpacing: '-0.01em' }}>{f.name}</span>
                    <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.25 }}>
                      <ChevronDown size={15} color={isExpanded ? f.accent : 'rgba(240,237,232,0.28)'} />
                    </motion.div>
                  </motion.button>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div key="preview" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        style={{ overflow: 'hidden', border: `1.5px solid ${f.accent}`, borderTop: 'none', borderRadius: '0 0 18px 18px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)' }}>
                        <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
                          <img src={f.img} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.88) saturate(1.2)' }} />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.12) 55%,transparent 100%)' }} />
                          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg,${f.accent}14,transparent 60%)` }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontFamily: "'Poppins', sans-serif", fontSize: 17, fontWeight: 800, color: '#f0ede8' }}>{f.name}</span>
                              <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: f.accent, color: ['#fbbf24','#f59e0b'].includes(f.accent) ? '#111' : '#fff', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Flavor</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 12, color: 'rgba(240,237,232,0.55)', lineHeight: 1.6, fontWeight: 300 }}>{f.desc}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        </Reveal>

        {/* ── Full Menu ── */}
        <Reveal style={{ marginTop: 104 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 28, height: 1, background: '#f5c842' }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#f5c842' }}>Full Menu</span>
          </div>
          <h2 style={{ fontFamily: "'Poppins', sans-serif", fontSize: 'clamp(28px,4vw,48px)', fontWeight: 800, color: '#f0ede8', margin: '0 0 48px', letterSpacing: '-0.02em' }}>
            Everything <em style={{ color: '#f5c842', fontStyle: 'italic' }}>We Offer</em>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20, alignItems: 'start' }}>

            <motion.div {...menuCardProps(0)}>
              <div style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 1, background: 'linear-gradient(90deg,transparent,rgba(245,200,66,0.3),transparent)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top left, rgba(245,200,66,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 18, fontWeight: 700, color: '#f0ede8', letterSpacing: '-0.01em' }}>Whole & Half Chicken</h3>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>
              <p style={{ fontSize: 11, color: 'rgba(240,237,232,0.26)', margin: '4px 0 16px', fontStyle: 'italic' }}>Add ₱40 for Kimchi · Make it Spicy +₱5/pc</p>
              {WHOLE_HALF.map((item, idx) => <MenuRow key={item.name} item={item} index={idx} />)}
            </motion.div>

            <motion.div {...menuCardProps(0.08)}>
              <div style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 1, background: 'linear-gradient(90deg,transparent,rgba(245,200,66,0.3),transparent)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top left, rgba(245,200,66,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 18, fontWeight: 700, color: '#f0ede8', letterSpacing: '-0.01em' }}>Rice Meals</h3>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px', flexWrap: 'wrap' }}>
                {['Original', 'Spicy +₱5/pc 🔥'].map(opt => (
                  <span key={opt} style={{ fontSize: 10.5, fontWeight: 600, padding: '4px 12px', borderRadius: 999, background: opt.includes('Spicy') ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${opt.includes('Spicy') ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.09)'}`, color: opt.includes('Spicy') ? '#ef4444' : 'rgba(240,237,232,0.45)' }}>{opt}</span>
                ))}
              </div>
              {RICE_MEALS.map((item, idx) => <MenuRow key={item.name} item={item} index={idx} />)}
            </motion.div>

            <motion.div {...menuCardProps(0.16)}>
              <div style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 1, background: 'linear-gradient(90deg,transparent,rgba(245,200,66,0.3),transparent)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top left, rgba(245,200,66,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 18, fontWeight: 700, color: '#f0ede8', letterSpacing: '-0.01em' }}>Sides & Snacks</h3>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>
              <p style={{ fontSize: 11, color: 'rgba(240,237,232,0.26)', margin: '4px 0 16px', fontStyle: 'italic' }}>Perfect add-ons to any meal</p>
              {SIDES_LIST.map((item, idx) => <MenuRow key={item.name} item={item} index={idx} />)}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.24 }}
              style={{ background: 'rgba(99,179,237,0.03)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', border: '1px solid rgba(147,210,255,0.1)', borderRadius: 28, padding: '32px 28px', position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 1px 0 rgba(147,210,255,0.07), 0 8px 40px rgba(0,0,0,0.4)' }}>
              <div style={{ position: 'absolute', top: 0, left: 28, right: 28, height: 1, background: 'linear-gradient(90deg,transparent,rgba(147,210,255,0.28),transparent)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top left, rgba(99,179,237,0.05) 0%, transparent 60%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontFamily: "'Poppins', sans-serif", fontSize: 18, fontWeight: 700, color: '#f0ede8', letterSpacing: '-0.01em' }}>Fruit Soda</h3>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {[{ label: '16oz', price: '₱50' }, { label: '22oz', price: '₱60' }].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(99,179,237,0.08)', border: '1px solid rgba(147,210,255,0.18)', borderRadius: 999, padding: '4px 12px' }}>
                    <Droplets size={10} color="#93c5fd" />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#93c5fd' }}>{s.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(240,237,232,0.45)' }}>{s.price}</span>
                  </div>
                ))}
              </div>
              {FRUIT_SODA.map((item, idx) => <MenuRow key={item.name} item={item} index={idx} />)}
              <p style={{ fontSize: 10.5, color: 'rgba(240,237,232,0.2)', marginTop: 12, fontStyle: 'italic' }}>* Prices shown are for 16oz. 22oz is ₱60.</p>
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(147,210,255,0.1)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(147,210,255,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 8px' }}>Ice Blended</p>
                {ICE_BLENDED.map((item, idx) => <MenuRow key={item.name} item={item} index={idx} />)}
              </div>
            </motion.div>

          </div>
        </Reveal>
      </div>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '52px 40px 40px', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 32, marginBottom: 40 }}>
            <div>
              <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 17, color: '#f0ede8', letterSpacing: '-0.02em' }}>
                  The <span style={{ color: '#f5c842' }}>Crunch</span>
                </span>
              </button>
              <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.26)', margin: 0, lineHeight: 1.65, maxWidth: 220, fontWeight: 300 }}>
                6 Falcon St., cor Dahlia Fairview,<br />Quezon City, Philippines
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(240,237,232,0.18)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Follow Us</span>
              <div style={{ display: 'flex', gap: 24 }}>
                {[{ label: 'Instagram', href: 'https://www.instagram.com/thecrunchfairview' }, { label: 'Facebook', href: 'https://www.facebook.com/thecrunchfairview' }].map(s => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 14, fontWeight: 500, color: 'rgba(240,237,232,0.4)', textDecoration: 'none', transition: 'color 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#f5c842' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(240,237,232,0.4)' }}
                  >{s.label}</a>
                ))}
              </div>
            </div>
          </div>
          <div style={{ paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'rgba(240,237,232,0.14)', fontWeight: 300 }}>
              © {new Date().getFullYear()} The Crunch Fairview. All rights reserved.
            </span>
          </div>
        </div>
      </footer>

    </div>
  )
}