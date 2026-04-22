import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView, useScroll, useTransform } from 'framer-motion';

const PP = "'Poppins', sans-serif";

function getAuth(): boolean {
  const t = localStorage.getItem('authToken');
  const f = localStorage.getItem('isAuthenticated') === 'true';
  if (!t || !f) {
    ['authToken', 'isAuthenticated', 'userName', 'userRole', 'userId'].forEach(k => localStorage.removeItem(k));
    return false;
  }
  return true;
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
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const init =
    dir === 'up'    ? { opacity: 0, y: 40 } :
    dir === 'left'  ? { opacity: 0, x: -40 } :
    dir === 'right' ? { opacity: 0, x: 40 } :
    { opacity: 0 };
  return (
    <motion.div ref={ref} initial={init}
      animate={inView ? { opacity: 1, y: 0, x: 0 } : init}
      transition={{ delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      style={style}>
      {children}
    </motion.div>
  );
}

// ── Marquee ───────────────────────────────────────────────────────────────────

function Marquee({ items }: { items: string[] }) {
  const rep = [...items, ...items, ...items];
  return (
    <div style={{ overflow: 'hidden', height: 48, background: '#f5c842', display: 'flex', alignItems: 'center' }}>
      <motion.div
        animate={{ x: [0, '-33.33%'] }}
        transition={{ repeat: Infinity, duration: 28, ease: 'linear' }}
        style={{ display: 'flex', whiteSpace: 'nowrap' }}>
        {rep.map((item, i) => (
          <span key={i} style={{
            fontFamily: PP, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            color: '#1a0a00', padding: '0 32px',
            display: 'inline-flex', alignItems: 'center', gap: 32,
          }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(26,10,0,0.25)', display: 'inline-block' }} />
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const marqueeItems = ['Fresh Daily', '7 Bold Flavors', '250+ Branches', 'Since 2021', 'Quezon City', 'Boneless Fried Chicken', 'Made with Love', 'Fast Service'];

const perks = [
  { num: '01', title: 'Fresh Daily',      desc: 'Ingredients sourced and prepped every morning — no shortcuts, ever.' },
  { num: '02', title: 'Fast Service',     desc: 'Hot and crispy, from our fryer to your hands in minutes.' },
  { num: '03', title: 'Made with Love',   desc: 'Every order is crafted like it is going to family.' },
  { num: '04', title: 'Bold Flavors',     desc: '7 signature sauces crafted to satisfy any mood or craving.' },
  { num: '05', title: 'Community First',  desc: 'Built for the neighborhood, grown by the neighborhood.' },
  { num: '06', title: '250+ Branches',    desc: 'From Luzon to Mindanao — The Crunch is everywhere you are.' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AboutTheCrunch() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => getAuth());

  useEffect(() => {
    setIsAuthenticated(getAuth());
    const sync = () => setIsAuthenticated(getAuth());
    window.addEventListener('authChange', sync);
    return () => window.removeEventListener('authChange', sync);
  }, []);

  const handleLogout = () => {
    ['authToken', 'isAuthenticated', 'userName', 'userRole', 'userId'].forEach(k => localStorage.removeItem(k));
    window.dispatchEvent(new Event('authChange'));
    navigate('/login');
  };

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);
  const txtY = useTransform(scrollYProgress, [0, 1], ['0%', '15%']);

  return (
    <div style={{ fontFamily: PP, background: '#0a0806', color: '#ede9e2', overflowX: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,900;1,700;1,900&display=swap" rel="stylesheet" />

      {/* ── NAV ── */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 900, height: 64,
          background: scrolled ? 'rgba(10,8,6,0.9)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(245,200,66,0.1)' : 'none',
          transition: 'all 0.35s ease',
          display: 'flex', alignItems: 'center',
          padding: '0 40px', justifyContent: 'space-between',
        }}>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f5c842', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: PP, fontSize: 12, fontWeight: 900, color: '#1a0a00', letterSpacing: '-0.04em' }}>TC</span>
          </div>
          <span style={{ fontFamily: PP, fontSize: 15, fontWeight: 800, color: '#ede9e2', letterSpacing: '-0.02em' }}>
            The <span style={{ color: '#f5c842' }}>Crunch</span>
          </span>
        </button>

        <nav style={{ display: 'flex', gap: 4 }}>
          {[{ l: 'Home', p: '/' }, { l: 'Menu', p: '/usersmenu' }, { l: 'About', p: '/aboutthecrunch' }].map(({ l, p }) => {
            const isMenu = l === 'Menu';
            return (
              <motion.button
                key={l}
                whileTap={{ scale: 0.96 }}
                onClick={() => isMenu ? navigate('/usersmenu?showOrderModal=true') : navigate(p)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: PP, fontSize: 13, fontWeight: 500,
                  color: p === '/aboutthecrunch' ? '#f5c842' : 'rgba(237,233,226,0.5)',
                  padding: '6px 14px', borderRadius: 8, transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ede9e2'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = p === '/aboutthecrunch' ? '#f5c842' : 'rgba(237,233,226,0.5)'; e.currentTarget.style.background = 'transparent'; }}
              >{l}</motion.button>
            );
          })}
        </nav>

        <div style={{ display: 'flex', gap: 8 }}>
          {isAuthenticated ? (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleLogout}
              style={{ background: '#f5c842', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 12.5, fontWeight: 700, color: '#1a0a00', cursor: 'pointer', fontFamily: PP }}>
              Log Out
            </motion.button>
          ) : (
            <>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/login')}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 18px', fontSize: 12.5, fontWeight: 500, color: '#ede9e2', cursor: 'pointer', fontFamily: PP }}>
                Log In
              </motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/login?tab=signup')}
                style={{ background: '#f5c842', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 12.5, fontWeight: 700, color: '#1a0a00', cursor: 'pointer', fontFamily: PP }}>
                Sign Up
              </motion.button>
            </>
          )}
        </div>
      </motion.header>

      {/* ── HERO ── */}
      <div ref={heroRef} style={{ height: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden', position: 'relative' }}>
        <div style={{
          background: '#0a0806',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          padding: '0 56px 88px', position: 'relative', zIndex: 2,
        }}>
          <div style={{ position: 'absolute', right: 0, top: '15%', bottom: '15%', width: 1, background: 'linear-gradient(to bottom, transparent, rgba(245,200,66,0.28), transparent)' }} />

          <motion.div style={{ y: txtY }}>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }}
              style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 24 }}>
              Since 2021 — Quezon City, PH
            </motion.p>

            <motion.h1 initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              style={{ fontFamily: PP, fontWeight: 900, fontSize: 'clamp(48px, 6vw, 88px)', lineHeight: 0.9, letterSpacing: '-0.03em', color: '#ede9e2', margin: '0 0 28px' }}>
              The<br />
              <em style={{ color: '#f5c842', fontStyle: 'italic' }}>Crunch</em><br />
              Fairview.
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.7 }}
              style={{ fontFamily: PP, fontSize: 14, color: 'rgba(237,233,226,0.45)', lineHeight: 1.9, maxWidth: 340, fontWeight: 300, marginBottom: 40 }}>
              One of the leading Boneless Fried Chicken brands in the Philippines. Serving deliciousness at 250+ branches nationwide.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.82, duration: 0.6 }}
              style={{ display: 'flex', gap: 12 }}>
              <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/usersmenu?showOrderModal=true')}
                style={{ background: '#f5c842', border: 'none', borderRadius: 10, padding: '13px 32px', fontSize: 13, fontWeight: 700, color: '#1a0a00', cursor: 'pointer', fontFamily: PP }}>
                Order Now
              </motion.button>
              <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                onClick={() => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ background: 'transparent', border: '1px solid rgba(237,233,226,0.15)', borderRadius: 10, padding: '13px 32px', fontSize: 13, fontWeight: 500, color: 'rgba(237,233,226,0.6)', cursor: 'pointer', fontFamily: PP }}>
                Our Story
              </motion.button>
            </motion.div>
          </motion.div>
        </div>

        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <motion.div style={{ y: imgY, position: 'absolute', inset: '-15%' }}
            initial={{ scale: 1.1, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}>
            <img src="https://shorturl.at/01YLe" alt="Crispy fried chicken"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(10,8,6,0.5) 0%, transparent 40%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,8,6,0.65) 0%, transparent 50%)' }} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.6 }}
            style={{ position: 'absolute', bottom: 72, left: 36, display: 'flex', gap: 10, zIndex: 10 }}>
            {[{ v: '250+', l: 'Branches' }, { v: '7', l: 'Flavors' }, { v: '2021', l: 'Est.' }].map(s => (
              <div key={s.l} style={{
                background: 'rgba(10,8,6,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(245,200,66,0.15)', borderRadius: 12, padding: '12px 18px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: PP, fontSize: 20, fontWeight: 800, color: '#f5c842', lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontFamily: PP, fontSize: 9, fontWeight: 600, color: 'rgba(237,233,226,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 5 }}>{s.l}</div>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}
          style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            style={{ width: 20, height: 32, border: '1.5px solid rgba(245,200,66,0.3)', borderRadius: 12, display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
            <motion.div animate={{ y: [0, 7, 0], opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              style={{ width: 3, height: 6, borderRadius: 3, background: '#f5c842' }} />
          </motion.div>
        </motion.div>
      </div>

      {/* ── MARQUEE ── */}
      <Marquee items={marqueeItems} />

      {/* ── STORY ── */}
      <section id="story" style={{ background: '#0e0c0a', padding: '112px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 48px', display: 'grid', gridTemplateColumns: '5fr 4fr', gap: 80, alignItems: 'center' }}>
          <Reveal dir="left">
            <div style={{ position: 'relative', paddingBottom: 52, paddingRight: 52 }}>
              <div style={{ borderRadius: 20, overflow: 'hidden' }}>
                <img src="https://shorturl.at/v3t6W" alt="The Crunch"
                  style={{ width: '100%', height: 460, objectFit: 'cover', display: 'block' }} />
              </div>
              <motion.div animate={{ y: [-4, 4, -4] }} transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
                style={{ position: 'absolute', bottom: 0, right: 0, background: '#f5c842', borderRadius: 18, padding: '22px 28px', minWidth: 132, textAlign: 'center' }}>
                <div style={{ fontFamily: PP, fontSize: 48, fontWeight: 900, color: '#1a0a00', lineHeight: 1 }}>7</div>
                <div style={{ fontFamily: PP, fontSize: 9, fontWeight: 700, color: 'rgba(26,10,0,0.5)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 6 }}>Signature Flavors</div>
              </motion.div>
              <motion.div animate={{ y: [3, -3, 3] }} transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut', delay: 0.6 }}
                style={{ position: 'absolute', top: -16, left: 24, background: 'rgba(14,12,10,0.9)', border: '1px solid rgba(245,200,66,0.2)', borderRadius: 12, padding: '10px 18px', backdropFilter: 'blur(16px)' }}>
                <div style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, color: '#f5c842', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Est. 2021</div>
                <div style={{ fontFamily: PP, fontSize: 11, color: 'rgba(237,233,226,0.35)', fontWeight: 300, marginTop: 2 }}>Fairview, QC</div>
              </motion.div>
            </div>
          </Reveal>

          <Reveal dir="right">
            <div>
              <p style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#f5c842', margin: '0 0 14px' }}>Our Vision</p>
              <h2 style={{ fontFamily: PP, fontWeight: 900, fontSize: 'clamp(32px, 3.5vw, 48px)', color: '#ede9e2', lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 28px' }}>
                Excellence<br />in Every<br /><em style={{ color: '#f5c842' }}>Bite.</em>
              </h2>
              <div style={{ width: 40, height: 2, background: 'rgba(245,200,66,0.3)', marginBottom: 28 }} />
              <p style={{ fontFamily: PP, fontSize: 14.5, color: 'rgba(237,233,226,0.45)', lineHeight: 1.95, fontWeight: 300, marginBottom: 16 }}>
                Through a shared commitment to excellence we are dedicated to the uncompromising quality of our food and service while taking exceptional care of our guests and staff.
              </p>
              <p style={{ fontFamily: PP, fontSize: 14.5, color: 'rgba(237,233,226,0.45)', lineHeight: 1.95, fontWeight: 300, marginBottom: 40 }}>
                We continuously strive to surpass our own accomplishments and be recognized as one of the most progressive and sustainable businesses in the country.
              </p>
              <div style={{ display: 'flex', gap: 36 }}>
                {[{ v: '2021', l: 'Founded' }, { v: '250+', l: 'Locations' }].map(s => (
                  <div key={s.l}>
                    <div style={{ fontFamily: PP, fontSize: 32, fontWeight: 900, color: '#f5c842', lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontFamily: PP, fontSize: 9, fontWeight: 600, color: 'rgba(237,233,226,0.28)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 8 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── MISSION ── */}
      <section style={{ background: '#080604', padding: '100px 0', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }} />
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 48px', position: 'relative' }}>
          <Reveal>
            <p style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 40 }}>Our Mission</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 style={{ fontFamily: PP, fontSize: 'clamp(52px, 8.5vw, 120px)', fontWeight: 900, color: '#ede9e2', lineHeight: 0.9, letterSpacing: '-0.04em', margin: '0 0 14px' }}>Flavor</h2>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 style={{ fontFamily: PP, fontSize: 'clamp(52px, 8.5vw, 120px)', fontWeight: 900, fontStyle: 'italic', color: '#f5c842', lineHeight: 0.9, letterSpacing: '-0.04em', margin: '0 0 14px', paddingLeft: '6vw' }}>for Everyone,</h2>
          </Reveal>
          <Reveal delay={0.14}>
            <h2 style={{ fontFamily: PP, fontSize: 'clamp(52px, 8.5vw, 120px)', fontWeight: 900, color: '#ede9e2', lineHeight: 0.9, letterSpacing: '-0.04em', margin: '0 0 64px' }}>Every Day.</h2>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'end' }}>
            <Reveal dir="left" delay={0.16}>
              <p style={{ fontFamily: PP, fontSize: 16, color: 'rgba(237,233,226,0.42)', lineHeight: 1.95, fontWeight: 300, margin: 0 }}>
                To serve more people with a unique style of high quality boneless fried chicken, and to help Filipinos start a profitable and easy to manage business.
              </p>
            </Reveal>
            <Reveal dir="right" delay={0.2}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 20 }}>
                <div style={{ width: '100%', height: 1, background: 'rgba(245,200,66,0.15)' }} />
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
      <section style={{ background: '#0e0c0a', padding: '96px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 48px' }}>
          <Reveal>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 56, gap: 20 }}>
              <div>
                <p style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#f5c842', margin: '0 0 12px' }}>Why The Crunch</p>
                <h2 style={{ fontFamily: PP, fontSize: 'clamp(30px, 3.5vw, 48px)', fontWeight: 900, color: '#ede9e2', letterSpacing: '-0.02em', margin: 0 }}>What Sets Us Apart</h2>
              </div>
              <p style={{ fontFamily: PP, fontSize: 13.5, color: 'rgba(237,233,226,0.28)', maxWidth: 260, lineHeight: 1.8, fontWeight: 300, margin: 0 }}>
                Six reasons why The Crunch has become the go-to chicken brand for Filipinos.
              </p>
            </div>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {perks.map((perk, i) => (
              <Reveal key={perk.num} delay={i * 0.06}>
                <motion.div whileHover={{ background: 'rgba(245,200,66,0.03)' }}
                  style={{
                    padding: '32px 36px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    borderRight: i % 2 === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    display: 'flex', gap: 24, alignItems: 'flex-start',
                    transition: 'background 0.2s',
                  }}>
                  <span style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, color: '#f5c842', letterSpacing: '0.06em', minWidth: 26, marginTop: 2 }}>{perk.num}</span>
                  <div>
                    <h3 style={{ fontFamily: PP, fontSize: 15, fontWeight: 700, color: '#ede9e2', margin: '0 0 8px' }}>{perk.title}</h3>
                    <p style={{ fontFamily: PP, fontSize: 13, color: 'rgba(237,233,226,0.35)', lineHeight: 1.8, fontWeight: 300, margin: 0 }}>{perk.desc}</p>
                  </div>
                </motion.div>
              </Reveal>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }} />
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ position: 'relative', height: '85vh', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <img src="https://shorturl.at/mWMOx" alt="Chicken feast"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'brightness(0.35) saturate(1.1)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,8,6,0.5)' }} />
        </div>
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 40px', maxWidth: 800 }}>
          <Reveal>
            <p style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 24 }}>Now Serving</p>
            <h2 style={{ fontFamily: PP, fontSize: 'clamp(44px, 7vw, 96px)', fontWeight: 900, color: '#ede9e2', lineHeight: 0.9, letterSpacing: '-0.035em', margin: '0 0 28px' }}>
              Ready to taste<br /><em style={{ color: '#f5c842' }}>The Crunch?</em>
            </h2>
            <p style={{ fontFamily: PP, fontSize: 15.5, color: 'rgba(237,233,226,0.5)', fontWeight: 300, lineHeight: 1.85, maxWidth: 440, margin: '0 auto 44px' }}>
              Visit us today and experience the crispiest chicken in town. Dine in, takeout, or order for your whole crew.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <motion.button whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/usersmenu?showOrderModal=true')}
                style={{ background: '#f5c842', color: '#1a0a00', border: 'none', borderRadius: 10, padding: '15px 44px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: PP }}>
                Order Now
              </motion.button>
              <motion.button whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }} onClick={() => navigate('/')}
                style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)', color: '#ede9e2', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '15px 44px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: PP }}>
                Back to Home
              </motion.button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#080604', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '60px 48px 36px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 48, marginBottom: 52 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
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
              <p style={{ fontFamily: PP, fontSize: 9, fontWeight: 700, color: 'rgba(237,233,226,0.15)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>Navigate</p>
              {[{ l: 'Home', p: '/' }, { l: 'Menu', p: '/usersmenu' }, { l: 'About', p: '/aboutthecrunch' }].map(({ l, p }) => (
                <motion.button key={l} whileHover={{ x: 3 }}
                  onClick={() => l === 'Menu' ? navigate('/usersmenu?showOrderModal=true') : navigate(p)}
                  style={{ display: 'block', background: 'none', border: 'none', cursor: 'pointer', fontFamily: PP, fontSize: 13.5, fontWeight: 400, color: 'rgba(237,233,226,0.32)', padding: '5px 0', textAlign: 'left', transition: 'color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f5c842'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(237,233,226,0.32)'; }}
                >{l}</motion.button>
              ))}
            </div>
            <div>
              <p style={{ fontFamily: PP, fontSize: 9, fontWeight: 700, color: 'rgba(237,233,226,0.15)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>Follow</p>
              {[
                { l: 'Instagram', h: 'https://www.instagram.com/thecrunchfairview' },
                { l: 'Facebook',  h: 'https://www.facebook.com/thecrunchfairview' },
              ].map(s => (
                <motion.a key={s.l} href={s.h} target="_blank" rel="noopener noreferrer"
                  whileHover={{ x: 3 }}
                  style={{ display: 'block', fontFamily: PP, fontSize: 13.5, fontWeight: 400, color: 'rgba(237,233,226,0.32)', textDecoration: 'none', padding: '5px 0', transition: 'color 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f5c842'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(237,233,226,0.32)'; }}
                >{s.l}</motion.a>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
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