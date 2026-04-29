import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView, useScroll, useTransform } from 'framer-motion';
import { useAuth } from '../context/authcontext';

// ── Font injection ─────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('crunch-fonts')) {
  const l = document.createElement('link');
  l.id = 'crunch-fonts';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,900;1,700;1,900&display=swap';
  document.head.appendChild(l);
}

const PP = "'Poppins', sans-serif";

// ── Responsive hook ───────────────────────────────────────────────────────────
function useBreakpoint() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return { isMobile: w < 640, isTablet: w < 1024, w };
}

// ── Reveal helper ─────────────────────────────────────────────────────────────
function Reveal({
  children, delay = 0, dir = 'up', style = {},
}: {
  children: React.ReactNode; delay?: number;
  dir?: 'up' | 'left' | 'right' | 'none';
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  const init =
    dir === 'up'    ? { opacity: 0, y: 40 } :
    dir === 'left'  ? { opacity: 0, x: -40 } :
    dir === 'right' ? { opacity: 0, x: 40 } :
    { opacity: 0 };
  return (
    <motion.div
      ref={ref}
      initial={init}
      animate={inView ? { opacity: 1, y: 0, x: 0 } : init}
      transition={{ delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

// ── Marquee ───────────────────────────────────────────────────────────────────
const marqueeItems = [
  'Fresh Daily', '7 Bold Flavors', '250+ Branches',
  'Since 2021', 'Quezon City', 'Boneless Fried Chicken',
  'Made with Love', 'Fast Service',
];

function Marquee() {
  const rep = [...marqueeItems, ...marqueeItems, ...marqueeItems];
  return (
    <div style={{ overflow: 'hidden', height: 48, background: '#f5c842', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <motion.div
        animate={{ x: [0, '-33.33%'] }}
        transition={{ repeat: Infinity, duration: 28, ease: 'linear' }}
        style={{ display: 'flex', whiteSpace: 'nowrap' }}
      >
        {rep.map((item, i) => (
          <span key={i} style={{
            fontFamily: PP, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            color: '#1a0a00', padding: '0 28px',
            display: 'inline-flex', alignItems: 'center', gap: 28,
          }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(26,10,0,0.3)', flexShrink: 0 }} />
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────
const perks = [
  { num: '01', title: 'Fresh Daily',      desc: 'Ingredients sourced and prepped every morning — no shortcuts, ever.' },
  { num: '02', title: 'Fast Service',     desc: 'Hot and crispy, from our fryer to your hands in minutes.' },
  { num: '03', title: 'Made with Love',   desc: 'Every order is crafted like it\'s going to family.' },
  { num: '04', title: 'Bold Flavors',     desc: '7 signature sauces crafted to satisfy any mood or craving.' },
  { num: '05', title: 'Community First',  desc: 'Built for the neighborhood, grown by the neighborhood.' },
  { num: '06', title: '250+ Branches',    desc: 'From Luzon to Mindanao — The Crunch is everywhere you are.' },
];

const IMG_HERO  = '/src/assets/img/crunch22.png';
const IMG_STORY = '/src/assets/img/chickchicken.png';

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AboutTheCrunch() {
  const navigate = useNavigate();
  const { isMobile, isTablet } = useBreakpoint();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Single source of truth: auth context shared with Delicacy (usersmenu) ──
  const { user, logout } = useAuth();
  const isAuthenticated = !!user;

  const handleLogout = () => {
    logout();           // clears context + localStorage in one shot
    setMenuOpen(false);
    navigate('/products');
  };

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    if (!isTablet) setMenuOpen(false);
  }, [isTablet]);

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);
  const txtY = useTransform(scrollYProgress, [0, 1], ['0%', '12%']);

  const navLinks = [
    { l: 'Home',  p: '/' },
    { l: 'About', p: '/aboutthecrunch' },
    { l: 'Menu',  p: '/usersmenu' },
  ];

  return (
    <div style={{ fontFamily: PP, background: '#0a0806', color: '#ede9e2', overflowX: 'hidden', minHeight: '100vh' }}>

      {/* ── NAV ── */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 900,
          height: 64,
          background: scrolled || menuOpen ? 'rgba(10,8,6,0.96)' : 'transparent',
          backdropFilter: scrolled || menuOpen ? 'blur(20px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(245,200,66,0.1)' : 'none',
          transition: 'all 0.35s ease',
          display: 'flex', alignItems: 'center',
          padding: isMobile ? '0 20px' : '0 40px',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <button
          onClick={() => navigate('/products')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}
        >
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f5c842', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: PP, fontSize: 12, fontWeight: 900, color: '#1a0a00', letterSpacing: '-0.04em' }}>TC</span>
          </div>
          {!isMobile && (
            <span style={{ fontFamily: PP, fontSize: 15, fontWeight: 800, color: '#ede9e2', letterSpacing: '-0.02em' }}>
              The <span style={{ color: '#f5c842' }}>Crunch</span>
            </span>
          )}
        </button>

        {/* Desktop Nav */}
        {!isTablet && (
          <nav style={{ display: 'flex', gap: 4, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            {navLinks.map(({ l, p }) => (
              <motion.button
                key={l}
                whileTap={{ scale: 0.96 }}
                onClick={() => l === 'Menu' ? navigate('/usersmenu?showOrderModal=true') : navigate(p)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: PP, fontSize: 13, fontWeight: 500,
                  color: p === '/aboutthecrunch' ? '#f5c842' : 'rgba(237,233,226,0.5)',
                  padding: '6px 14px', borderRadius: 8, transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ede9e2'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = p === '/aboutthecrunch' ? '#f5c842' : 'rgba(237,233,226,0.5)'; e.currentTarget.style.background = 'transparent'; }}
              >{l}</motion.button>
            ))}
          </nav>
        )}

        {/* Desktop Auth — reactive to shared auth context */}
        {!isTablet ? (
          <AnimatePresence mode="wait">
            {isAuthenticated ? (
              <motion.button
                key="logout"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleLogout}
                style={{ background: '#f5c842', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 12.5, fontWeight: 700, color: '#1a0a00', cursor: 'pointer', fontFamily: PP, flexShrink: 0 }}
              >
                Log Out
              </motion.button>
            ) : (
              <motion.div
                key="login-btns"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex', gap: 8, flexShrink: 0 }}
              >
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/login')}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 18px', fontSize: 12.5, fontWeight: 500, color: '#ede9e2', cursor: 'pointer', fontFamily: PP }}>
                  Log In
                </motion.button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/login?tab=signup')}
                  style={{ background: '#f5c842', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 12.5, fontWeight: 700, color: '#1a0a00', cursor: 'pointer', fontFamily: PP }}>
                  Sign Up
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          /* Hamburger */
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}
          >
            {[0, 1, 2].map(i => (
              <motion.span key={i}
                animate={menuOpen ? (i === 1 ? { opacity: 0 } : i === 0 ? { rotate: 45, y: 9 } : { rotate: -45, y: -9 }) : { opacity: 1, rotate: 0, y: 0 }}
                style={{ display: 'block', width: 22, height: 2, background: '#f5c842', borderRadius: 2 }}
              />
            ))}
          </button>
        )}
      </motion.header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && isTablet && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
            style={{
              position: 'fixed', top: 64, left: 0, right: 0, zIndex: 850,
              background: 'rgba(10,8,6,0.98)', backdropFilter: 'blur(20px)',
              borderBottom: '1px solid rgba(245,200,66,0.1)',
              padding: '20px 24px 28px',
            }}
          >
            {navLinks.map(({ l, p }) => (
              <button key={l}
                onClick={() => { setMenuOpen(false); l === 'Menu' ? navigate('/usersmenu?showOrderModal=true') : navigate(p); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: PP, fontSize: 18, fontWeight: 700, color: p === '/aboutthecrunch' ? '#f5c842' : 'rgba(237,233,226,0.65)', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >{l}</button>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <AnimatePresence mode="wait">
                {isAuthenticated ? (
                  <motion.button
                    key="mobile-logout"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={handleLogout}
                    style={{ flex: 1, background: '#f5c842', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: '#1a0a00', cursor: 'pointer', fontFamily: PP }}
                  >
                    Log Out
                  </motion.button>
                ) : (
                  <motion.div
                    key="mobile-login-btns"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ display: 'flex', gap: 10, flex: 1 }}
                  >
                    <button onClick={() => { setMenuOpen(false); navigate('/login'); }}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 500, color: '#ede9e2', cursor: 'pointer', fontFamily: PP }}>
                      Log In
                    </button>
                    <button onClick={() => { setMenuOpen(false); navigate('/login?tab=signup'); }}
                      style={{ flex: 1, background: '#f5c842', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: '#1a0a00', cursor: 'pointer', fontFamily: PP }}>
                      Sign Up
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HERO ── */}
      <div
        ref={heroRef}
        style={{
          minHeight: '100vh',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : '1fr 1fr',
          overflow: 'hidden',
          position: 'relative',
          paddingTop: isMobile ? 64 : 0,
        }}
      >
        {/* Left Text */}
        <div style={{
          background: '#0a0806',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: isMobile ? '48px 24px 48px' : isTablet ? '80px 48px 64px' : '0 56px 88px',
          position: 'relative', zIndex: 2,
          minHeight: isMobile ? 'auto' : isTablet ? 'auto' : '100vh',
        }}>
          {!isTablet && (
            <div style={{ position: 'absolute', right: 0, top: '15%', bottom: '15%', width: 1, background: 'linear-gradient(to bottom, transparent, rgba(245,200,66,0.28), transparent)' }} />
          )}

          <motion.div style={{ y: isTablet ? 0 : txtY }}>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}
              style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 20 }}>
              Since 2021 — Quezon City, PH
            </motion.p>

            <motion.h1 initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontFamily: PP, fontWeight: 900,
                fontSize: isMobile ? 'clamp(52px, 14vw, 72px)' : 'clamp(48px, 6vw, 88px)',
                lineHeight: 0.9, letterSpacing: '-0.03em', color: '#ede9e2', margin: '0 0 24px',
              }}>
              The<br />
              <em style={{ color: '#f5c842', fontStyle: 'italic' }}>Crunch</em><br />
              Fairview.
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.7 }}
              style={{ fontFamily: PP, fontSize: isMobile ? 13 : 14, color: 'rgba(237,233,226,0.45)', lineHeight: 1.9, maxWidth: 380, fontWeight: 300, marginBottom: 36 }}>
              One of the leading Boneless Fried Chicken brands in the Philippines. Serving deliciousness at 250+ branches nationwide.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.82, duration: 0.6 }}
              style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/usersmenu?showOrderModal=true')}
                style={{ background: '#f5c842', border: 'none', borderRadius: 10, padding: isMobile ? '12px 28px' : '13px 32px', fontSize: 13, fontWeight: 700, color: '#1a0a00', cursor: 'pointer', fontFamily: PP }}>
                Order Now
              </motion.button>
              <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                onClick={() => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ background: 'transparent', border: '1px solid rgba(237,233,226,0.15)', borderRadius: 10, padding: isMobile ? '12px 28px' : '13px 32px', fontSize: 13, fontWeight: 500, color: 'rgba(237,233,226,0.6)', cursor: 'pointer', fontFamily: PP }}>
                Our Story
              </motion.button>
            </motion.div>
          </motion.div>
        </div>

        {/* Right Image */}
        <div style={{
          position: 'relative', overflow: 'hidden',
          minHeight: isMobile ? 360 : isTablet ? 480 : '100vh',
          background: '#0a0806',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <motion.div
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <img src={IMG_HERO} alt="Boneless Crunchy Savory chicken"
              style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(10,8,6,0.55) 0%, transparent 18%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,8,6,0.5) 0%, transparent 30%)' }} />
          </motion.div>

          {/* Stats */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.6 }}
            style={{ position: 'absolute', bottom: isMobile ? 24 : 48, left: isMobile ? 16 : 28, display: 'flex', gap: isMobile ? 8 : 10, zIndex: 10, flexWrap: 'wrap' }}>
            {[{ v: '250+', l: 'Branches' }, { v: '7', l: 'Flavors' }, { v: '2021', l: 'Est.' }].map(s => (
              <div key={s.l} style={{
                background: 'rgba(10,8,6,0.8)', backdropFilter: 'blur(16px)',
                border: '1px solid rgba(245,200,66,0.18)', borderRadius: 12,
                padding: isMobile ? '10px 14px' : '12px 18px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: PP, fontSize: isMobile ? 16 : 20, fontWeight: 800, color: '#f5c842', lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontFamily: PP, fontSize: 9, fontWeight: 600, color: 'rgba(237,233,226,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 5 }}>{s.l}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Scroll indicator */}
        {!isMobile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}
            style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              style={{ width: 20, height: 32, border: '1.5px solid rgba(245,200,66,0.3)', borderRadius: 12, display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
              <motion.div animate={{ y: [0, 7, 0], opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                style={{ width: 3, height: 6, borderRadius: 3, background: '#f5c842' }} />
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* ── MARQUEE ── */}
      <Marquee />

      {/* ── STORY ── */}
      <section id="story" style={{ background: '#0e0c0a', padding: isMobile ? '72px 0' : '112px 0' }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          padding: isMobile ? '0 24px' : isTablet ? '0 40px' : '0 48px',
          display: 'grid',
          gridTemplateColumns: isTablet ? '1fr' : '5fr 4fr',
          gap: isTablet ? 48 : 80,
          alignItems: 'center',
        }}>
          <Reveal dir={isTablet ? 'up' : 'left'}>
            <div style={{ position: 'relative', paddingBottom: isTablet ? 0 : 48, paddingRight: isTablet ? 0 : 48 }}>
              <div style={{ borderRadius: 20, overflow: 'hidden', height: isMobile ? 260 : isTablet ? 380 : 460 }}>
                <img src={IMG_STORY} alt="The Crunch — Crunchy Addicting Flavorful"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
              </div>
              {!isMobile && (
                <motion.div animate={{ y: [-4, 4, -4] }} transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
                  style={{ position: isTablet ? 'relative' : 'absolute', bottom: isTablet ? 'auto' : 0, right: isTablet ? 'auto' : 0, marginTop: isTablet ? 16 : 0, background: '#f5c842', borderRadius: 18, padding: '20px 24px', minWidth: 120, textAlign: 'center', display: 'inline-block' }}>
                  <div style={{ fontFamily: PP, fontSize: 44, fontWeight: 900, color: '#1a0a00', lineHeight: 1 }}>7</div>
                  <div style={{ fontFamily: PP, fontSize: 9, fontWeight: 700, color: 'rgba(26,10,0,0.5)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 6 }}>Signature Flavors</div>
                </motion.div>
              )}
              {!isTablet && (
                <motion.div animate={{ y: [3, -3, 3] }} transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut', delay: 0.6 }}
                  style={{ position: 'absolute', top: -16, left: 20, background: 'rgba(14,12,10,0.95)', border: '1px solid rgba(245,200,66,0.2)', borderRadius: 12, padding: '10px 18px', backdropFilter: 'blur(16px)' }}>
                  <div style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, color: '#f5c842', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Est. 2021</div>
                  <div style={{ fontFamily: PP, fontSize: 11, color: 'rgba(237,233,226,0.35)', fontWeight: 300, marginTop: 2 }}>Fairview, QC</div>
                </motion.div>
              )}
            </div>
          </Reveal>

          <Reveal dir={isTablet ? 'up' : 'right'} delay={0.1}>
            <div>
              <p style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#f5c842', margin: '0 0 14px' }}>Our Vision</p>
              <h2 style={{ fontFamily: PP, fontWeight: 900, fontSize: isMobile ? 'clamp(32px, 9vw, 44px)' : 'clamp(32px, 3.5vw, 48px)', color: '#ede9e2', lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 24px' }}>
                Excellence<br />in Every<br /><em style={{ color: '#f5c842' }}>Bite.</em>
              </h2>
              <div style={{ width: 40, height: 2, background: 'rgba(245,200,66,0.3)', marginBottom: 24 }} />
              <p style={{ fontFamily: PP, fontSize: isMobile ? 13.5 : 14.5, color: 'rgba(237,233,226,0.45)', lineHeight: 1.95, fontWeight: 300, marginBottom: 16 }}>
                Through a shared commitment to excellence we are dedicated to the uncompromising quality of our food and service while taking exceptional care of our guests and staff.
              </p>
              <p style={{ fontFamily: PP, fontSize: isMobile ? 13.5 : 14.5, color: 'rgba(237,233,226,0.45)', lineHeight: 1.95, fontWeight: 300, marginBottom: 36 }}>
                We continuously strive to surpass our own accomplishments and be recognized as one of the most progressive and sustainable businesses in the country.
              </p>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                {[{ v: '2021', l: 'Founded' }, { v: '250+', l: 'Locations' }].map(s => (
                  <div key={s.l}>
                    <div style={{ fontFamily: PP, fontSize: isMobile ? 28 : 32, fontWeight: 900, color: '#f5c842', lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontFamily: PP, fontSize: 9, fontWeight: 600, color: 'rgba(237,233,226,0.28)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 8 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── MISSION ── */}
      <section style={{ background: '#080604', padding: isMobile ? '80px 0' : '100px 0', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }} />
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 24px' : '0 48px', position: 'relative' }}>
          <Reveal>
            <p style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 36 }}>Our Mission</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 style={{ fontFamily: PP, fontSize: isMobile ? 'clamp(44px, 14vw, 72px)' : 'clamp(52px, 8.5vw, 120px)', fontWeight: 900, color: '#ede9e2', lineHeight: 0.9, letterSpacing: '-0.04em', margin: '0 0 10px' }}>Flavor</h2>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 style={{ fontFamily: PP, fontSize: isMobile ? 'clamp(44px, 14vw, 72px)' : 'clamp(52px, 8.5vw, 120px)', fontWeight: 900, fontStyle: 'italic', color: '#f5c842', lineHeight: 0.9, letterSpacing: '-0.04em', margin: '0 0 10px', paddingLeft: isMobile ? '4vw' : '6vw' }}>for Everyone,</h2>
          </Reveal>
          <Reveal delay={0.14}>
            <h2 style={{ fontFamily: PP, fontSize: isMobile ? 'clamp(44px, 14vw, 72px)' : 'clamp(52px, 8.5vw, 120px)', fontWeight: 900, color: '#ede9e2', lineHeight: 0.9, letterSpacing: '-0.04em', margin: '0 0 52px' }}>Every Day.</h2>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr', gap: isTablet ? 28 : 72, alignItems: 'end' }}>
            <Reveal dir="left" delay={0.16}>
              <p style={{ fontFamily: PP, fontSize: isMobile ? 14 : 16, color: 'rgba(237,233,226,0.42)', lineHeight: 1.95, fontWeight: 300, margin: 0 }}>
                To serve more people with a unique style of high quality boneless fried chicken, and to help Filipinos start a profitable and easy to manage business.
              </p>
            </Reveal>
            <Reveal dir={isTablet ? 'up' : 'right'} delay={0.2}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: isTablet ? 'flex-start' : 'flex-end', gap: 20 }}>
                {!isTablet && <div style={{ width: '100%', height: 1, background: 'rgba(245,200,66,0.15)' }} />}
                <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                  onClick={() => navigate('/usersmenu?showOrderModal=true')}
                  style={{ background: '#f5c842', border: 'none', borderRadius: 10, padding: '14px 40px', fontSize: 13.5, fontWeight: 700, color: '#1a0a00', cursor: 'pointer', fontFamily: PP }}>
                  See the Menu
                </motion.button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── PERKS ── */}
      <section style={{ background: '#0e0c0a', padding: isMobile ? '72px 0' : '96px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 24px' : '0 48px' }}>
          <Reveal>
            <div style={{ display: 'flex', alignItems: isTablet ? 'flex-start' : 'flex-end', justifyContent: 'space-between', marginBottom: 48, gap: 20, flexDirection: isTablet ? 'column' : 'row' }}>
              <div>
                <p style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#f5c842', margin: '0 0 12px' }}>Why The Crunch</p>
                <h2 style={{ fontFamily: PP, fontSize: isMobile ? 'clamp(26px, 7vw, 36px)' : 'clamp(30px, 3.5vw, 48px)', fontWeight: 900, color: '#ede9e2', letterSpacing: '-0.02em', margin: 0 }}>What Sets Us Apart</h2>
              </div>
              {!isMobile && (
                <p style={{ fontFamily: PP, fontSize: 13.5, color: 'rgba(237,233,226,0.28)', maxWidth: 260, lineHeight: 1.8, fontWeight: 300, margin: 0 }}>
                  Six reasons why The Crunch has become the go-to chicken brand for Filipinos.
                </p>
              )}
            </div>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            {perks.map((perk, i) => (
              <Reveal key={perk.num} delay={i * 0.05}>
                <motion.div
                  whileHover={{ background: 'rgba(245,200,66,0.03)' }}
                  style={{
                    padding: isMobile ? '24px 0' : '30px 32px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    borderRight: !isMobile && i % 2 === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    display: 'flex', gap: 20, alignItems: 'flex-start',
                    transition: 'background 0.2s',
                  }}
                >
                  <span style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, color: '#f5c842', letterSpacing: '0.06em', minWidth: 24, marginTop: 2 }}>{perk.num}</span>
                  <div>
                    <h3 style={{ fontFamily: PP, fontSize: 15, fontWeight: 700, color: '#ede9e2', margin: '0 0 7px' }}>{perk.title}</h3>
                    <p style={{ fontFamily: PP, fontSize: 13, color: 'rgba(237,233,226,0.35)', lineHeight: 1.8, fontWeight: 300, margin: 0 }}>{perk.desc}</p>
                  </div>
                </motion.div>
              </Reveal>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)' }} />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ position: 'relative', height: isMobile ? '70vh' : '85vh', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <img src={IMG_HERO} alt="Chicken feast"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'brightness(0.32) saturate(1.15)', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.45)' }} />
        </div>
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: isMobile ? '0 24px' : '0 40px', maxWidth: 800, width: '100%' }}>
          <Reveal>
            <p style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 20 }}>Now Serving</p>
            <h2 style={{ fontFamily: PP, fontSize: isMobile ? 'clamp(38px, 11vw, 60px)' : 'clamp(44px, 7vw, 96px)', fontWeight: 900, color: '#ede9e2', lineHeight: 0.92, letterSpacing: '-0.035em', margin: '0 0 24px' }}>
              Ready to taste<br /><em style={{ color: '#f5c842' }}>The Crunch?</em>
            </h2>
            <p style={{ fontFamily: PP, fontSize: isMobile ? 13.5 : 15.5, color: 'rgba(237,233,226,0.5)', fontWeight: 300, lineHeight: 1.85, maxWidth: 440, margin: '0 auto 40px' }}>
              Visit us today and experience the crispiest chicken in town. Dine in, takeout, or order for your whole crew.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <motion.button whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/usersmenu?showOrderModal=true')}
                style={{ background: '#f5c842', color: '#1a0a00', border: 'none', borderRadius: 10, padding: isMobile ? '13px 36px' : '15px 44px', fontSize: isMobile ? 13 : 14, fontWeight: 700, cursor: 'pointer', fontFamily: PP }}>
                Order Now
              </motion.button>
              <motion.button whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/products')}
                style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)', color: '#ede9e2', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: isMobile ? '13px 36px' : '15px 44px', fontSize: isMobile ? 13 : 14, fontWeight: 500, cursor: 'pointer', fontFamily: PP }}>
                Back to Home
              </motion.button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#080604', borderTop: '1px solid rgba(255,255,255,0.05)', padding: isMobile ? '48px 24px 32px' : '60px 48px 36px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '2fr 1fr 1fr', gap: isMobile ? 36 : 48, marginBottom: 40 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#f5c842', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: PP, fontSize: 13, fontWeight: 900, color: '#1a0a00', letterSpacing: '-0.04em' }}>TC</span>
                </div>
                <span style={{ fontFamily: PP, fontSize: 16, fontWeight: 800, color: '#ede9e2' }}>
                  The <span style={{ color: '#f5c842' }}>Crunch</span>
                </span>
              </div>
              <p style={{ fontFamily: PP, fontSize: 13, color: 'rgba(237,233,226,0.25)', lineHeight: 1.85, maxWidth: 240, fontWeight: 300, margin: 0 }}>
                Crispy, saucy, always fresh.<br />Fairview, Dahlia, Quezon City.
              </p>
            </div>

            <div>
              <p style={{ fontFamily: PP, fontSize: 9, fontWeight: 700, color: 'rgba(237,233,226,0.15)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 14 }}>Navigate</p>
              {navLinks.map(({ l, p }) => (
                <motion.button key={l} whileHover={{ x: 3 }}
                  onClick={() => l === 'Menu' ? navigate('/usersmenu?showOrderModal=true') : navigate(p)}
                  style={{ display: 'block', background: 'none', border: 'none', cursor: 'pointer', fontFamily: PP, fontSize: 13.5, fontWeight: 400, color: 'rgba(237,233,226,0.32)', padding: '5px 0', textAlign: 'left', transition: 'color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f5c842'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(237,233,226,0.32)'; }}
                >{l}</motion.button>
              ))}
            </div>

            <div>
              <p style={{ fontFamily: PP, fontSize: 9, fontWeight: 700, color: 'rgba(237,233,226,0.15)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 14 }}>Follow</p>
              {[
                { l: 'Instagram', h: 'https://www.instagram.com/thecrunchfairview' },
                { l: 'Facebook',  h: 'https://www.facebook.com/thecrunchfairview' },
              ].map(s => (
                <motion.a key={s.l} href={s.h} target="_blank" rel="noopener noreferrer" whileHover={{ x: 3 }}
                  style={{ display: 'block', fontFamily: PP, fontSize: 13.5, fontWeight: 400, color: 'rgba(237,233,226,0.32)', textDecoration: 'none', padding: '5px 0', transition: 'color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f5c842'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(237,233,226,0.32)'; }}
                >{s.l}</motion.a>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontFamily: PP, fontSize: 11.5, color: 'rgba(237,233,226,0.1)', fontWeight: 300 }}>
              © {new Date().getFullYear()} The Crunch Fairview Dahlia Quezon City · All rights reserved
            </span>
            <span style={{ fontFamily: PP, fontSize: 11.5, color: 'rgba(237,233,226,0.1)', fontWeight: 300 }}>Fairview, Dahlia, QC 1118</span>
          </div>
        </div>
      </footer>
    </div>
  );
}