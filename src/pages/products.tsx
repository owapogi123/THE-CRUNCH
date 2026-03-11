import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star, Flame, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';

const CATEGORIES = ['All', 'Chicken', 'Sides', 'Drinks', 'Combos'];

const STATIC_PRODUCTS = [
  { id: 1, name: 'Whole Fried Chicken', category: 'Chicken', rating: 4.9, badge: 'Bestseller', description: 'Our signature boneless fried chicken — ultra-crispy, juicy inside.', spicy: false, img: 'https://bit.ly/4ckRqHY' },
  { id: 2, name: 'Half Fried Chicken', category: 'Chicken', rating: 4.8, badge: 'Hot', description: 'All the crunch you love, with a fiery kick that lingers.', spicy: true, img: 'https://bit.ly/3P8sz0j' },
  { id: 3, name: 'Crispy Chicken Shots with Drink', category: 'Chicken', rating: 4.7, badge: 'New', description: 'Tossed in rich garlic butter sauce. Dangerously good.', spicy: false, img: 'https://bit.ly/40Z9n7T' },
  { id: 4, name: 'Chicken Skin with Rice and Drink', category: 'Sides', rating: 4.5, badge: '', description: 'Creamy, crunchy, refreshing. The perfect sidekick.', spicy: false, img: 'https://bit.ly/3P6DcAK' },
  { id: 5, name: '3pcs Fried Chicken with Rice', category: 'Sides', rating: 4.6, badge: 'Fan Fave', description: 'Seasoned shoestring fries with our secret crunch dust.', spicy: false, img: 'https://surl.li/wdwndi' },
  { id: 6, name: '1pc Fried Chicken With Rice', category: 'Drinks', rating: 4.4, badge: '', description: 'House-brewed milk tea, the perfect cool-down companion.', spicy: false, img: 'https://surl.lt/rckddk' },
  { id: 7, name: '2pcs Fried Chicken With Rice', category: 'Combos', rating: 4.9, badge: 'Best Value', description: 'Classic Crunch + Fries + Drink. The full experience.', spicy: false, img: 'https://surl.li/dwocmt' },
  { id: 8, name: 'Spicy Combo B', category: 'Combos', rating: 4.8, badge: 'Hot Deal', description: 'Spicy Crunch + Coleslaw + Iced Tea. Dare to combo.', spicy: true, img: 'https://bit.ly/3P8sz0j' },
];

const badgeConfig: Record<string, { bg: string; label: string }> = {
  'Bestseller': { bg: '#f97316', label: 'Bestseller' },
  'Hot':        { bg: '#ef4444', label: 'Hot' },
  'Hot Deal':   { bg: '#ef4444', label: 'Hot Deal' },
  'New':        { bg: '#8b5cf6', label: 'New' },
  'Fan Fave':   { bg: '#16a34a', label: 'Fan Fave' },
  'Best Value': { bg: '#0284c7', label: 'Best Value' },
};

export default function Products() {
  const [products, setProducts] = useState(STATIC_PRODUCTS);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/products')
      .then(r => r.json())
      .then(data => { if (data?.length) setProducts(data); })
      .catch(() => {});
  }, []);

  const filtered = products.filter(p => {
    const matchCat = category === 'All' || p.category === category;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const topPick = filtered.find(p => p.badge === 'Bestseller') || filtered[0];

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: '#fafaf8', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <motion.header
        style={{ background: '#fff', borderBottom: '1px solid #f0ede8', position: 'sticky', top: 0, zIndex: 50 }}
        initial={{ y: -60 }} animate={{ y: 0 }} transition={{ duration: 0.4 }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ fontWeight: 800, fontSize: 20, color: '#1a1a1a', textDecoration: 'none' }}>
            The <span style={{ color: '#f97316' }}>Crunch</span>
          </Link>
          <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            <Link to="/usersmenu" style={{ color: '#6b7280', fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>Menu</Link>
            <Link to="/aboutthecrunch" style={{ color: '#6b7280', fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>About</Link>
          </nav>
        </div>
      </motion.header>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)', padding: '52px 32px 44px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <motion.p
              style={{ fontSize: 12, fontWeight: 700, color: '#f97316', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 10px' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            >
              The Crunch Fairview
            </motion.p>
            <motion.h1
              style={{ fontSize: 52, fontWeight: 800, color: '#1a1a1a', margin: 0, lineHeight: 1.1 }}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            >
              Our <span style={{ color: '#f97316' }}>Products</span>
            </motion.h1>
            <motion.p
              style={{ color: '#6b7280', fontSize: 15, margin: '10px 0 0' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            >
              Discover what's fresh, hot, and fan-favorite today.
            </motion.p>
          </div>

          {/* Search */}
          <motion.div
            style={{ position: 'relative', width: 360 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          >
            <Search size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              style={{ width: '100%', padding: '13px 16px 13px 44px', borderRadius: 14, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            />
          </motion.div>
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f0ede8', padding: '0 32px', position: 'sticky', top: 64, zIndex: 40 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 0, overflowX: 'auto' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: '16px 24px', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 14, fontFamily: 'inherit', whiteSpace: 'nowrap',
                color: category === cat ? '#f97316' : '#6b7280',
                borderBottom: category === cat ? '2.5px solid #f97316' : '2.5px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '44px 32px 72px' }}>

        {/* Top Pick Feature Card */}
        {!search && topPick && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            style={{ marginBottom: 48, borderRadius: 28, overflow: 'hidden', position: 'relative', height: 340, boxShadow: '0 8px 40px rgba(249,115,22,0.18)' }}
          >
            <img src={topPick.img} alt={topPick.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)' }} />
            <div style={{ position: 'absolute', bottom: 40, left: 48 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f97316', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 20, marginBottom: 14, letterSpacing: '0.05em' }}>
                <Crown size={12} /> TOP PICK
              </div>
              <h2 style={{ margin: '0 0 8px', fontSize: 38, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{topPick.name}</h2>
              <p style={{ margin: '0 0 16px', fontSize: 14, color: 'rgba(255,255,255,0.8)', maxWidth: 420 }}>{topPick.description}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Star size={14} fill="#fbbf24" color="#fbbf24" />
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{topPick.rating}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>· {topPick.category}</span>
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={category + search}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 28 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          >
            {filtered.map((p, i) => {
              const badge = badgeConfig[p.badge] || null;
              const isBest = p.badge === 'Bestseller';
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.4 }}
                  whileHover={{ y: -8 }}
                  style={{
                    background: '#fff', borderRadius: 24, overflow: 'hidden',
                    boxShadow: isBest ? '0 4px 24px rgba(249,115,22,0.15)' : '0 2px 14px rgba(0,0,0,0.06)',
                    border: isBest ? '2px solid #fed7aa' : '2px solid transparent',
                    transition: 'box-shadow 0.25s, transform 0.25s'
                  }}
                >
                  {/* Image — bigger */}
                  <div style={{ position: 'relative', height: 240, overflow: 'hidden' }}>
                    <motion.img
                      src={p.img} alt={p.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      whileHover={{ scale: 1.06 }}
                      transition={{ duration: 0.4 }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.35))' }} />

                    {/* Badge */}
                    {badge && (
                      <span style={{
                        position: 'absolute', top: 14, left: 14,
                        background: badge.bg, color: '#fff',
                        fontSize: 11, fontWeight: 700, padding: '5px 12px',
                        borderRadius: 20, letterSpacing: '0.03em',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                      }}>
                        {badge.label}
                      </span>
                    )}

                    {/* Spicy icon */}
                    {p.spicy && (
                      <span style={{
                        position: 'absolute', top: 14, right: 14,
                        background: 'rgba(255,255,255,0.92)', borderRadius: '50%',
                        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}>
                        <Flame size={15} color="#ef4444" />
                      </span>
                    )}

                    {/* Rating pill on image */}
                    <div style={{
                      position: 'absolute', bottom: 12, right: 14,
                      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                      borderRadius: 20, padding: '4px 10px',
                      display: 'flex', alignItems: 'center', gap: 5
                    }}>
                      <Star size={11} fill="#fbbf24" color="#fbbf24" />
                      <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{p.rating}</span>
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ padding: '18px 20px 22px' }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>{p.name}</h3>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: '#9ca3af', lineHeight: 1.55 }}>{p.description}</p>
                    <span style={{
                      display: 'inline-block',
                      background: '#f3f4f6', color: '#6b7280',
                      fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20
                    }}>
                      {p.category}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '100px 0', color: '#9ca3af' }}>
            <p style={{ fontSize: 18, fontWeight: 600 }}>No products found</p>
            <p style={{ fontSize: 14 }}>Try a different search or category</p>
          </div>
        )}
      </div>
    </div>
  );
}