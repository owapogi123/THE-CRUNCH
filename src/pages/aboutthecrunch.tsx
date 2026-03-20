import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, useScroll, useTransform, type Variants } from 'framer-motion';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 52 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  }),
};
const fadeLeft: Variants = {
  hidden:  { opacity: 0, x: -64 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
};
const fadeRight: Variants = {
  hidden:  { opacity: 0, x: 64 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
};

function Reveal({
  children,
  variants = fadeUp,
  custom = 0,
  style = {},
}: {
  children: React.ReactNode;
  variants?: Variants;
  custom?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      variants={variants}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      custom={custom}
      style={style}
    >
      {children}
    </motion.div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <div style={{ width: 32, height: 1, background: '#f5c842', flexShrink: 0 }} />
      <span style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.26em',
        textTransform: 'uppercase' as const, color: '#f5c842',
        fontFamily: "'Poppins', sans-serif",
      }}>
        {children}
      </span>
    </div>
  );
}

const perks = [
  { title: 'Fresh Daily',     desc: 'Ingredients sourced and prepped every single morning — no shortcuts, ever.' },
  { title: 'Fast Service',    desc: 'Hot and crispy, from our fryer to your hands in minutes.' },
  { title: 'Made with Love',  desc: "Every order is crafted like it's going to family." },
  { title: 'Bold Flavors',    desc: '7 signature sauces crafted to satisfy any mood or craving.' },
  { title: 'Community First', desc: 'Built for the neighborhood, grown by the neighborhood.' },
  { title: '250+ Branches',   desc: 'From Luzon to Mindanao — The Crunch is everywhere you are.' },
];

const stats = [
  { value: '250+', label: 'Branches Nationwide' },
  { value: '7',    label: 'Signature Flavors'   },
  { value: '2021', label: 'Founded'              },
  { value: '∞',    label: 'Happy Customers'      },
];

/* Shared font shorthand */
const PP = "'Poppins', sans-serif";

export default function AboutTheCrunch() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroImgY    = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);
  const heroTextY   = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <div style={{ fontFamily: PP, background: '#0e0c0a', minHeight: '100vh', color: '#f0ede8' }}>

      {/* ── Poppins only ── */}
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700;1,800;1,900&display=swap"
        rel="stylesheet"
      />

      {/* ════════════ NAV ════════════ */}
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
          padding: '0 6vw', height: 68,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: scrolled ? 'rgba(14,12,10,0.93)' : 'transparent',
          backdropFilter: scrolled ? 'blur(22px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(22px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(240,237,232,0.07)' : 'none',
          transition: 'background 0.45s ease, border-bottom 0.45s ease',
        }}
      >
        <button onClick={scrollTop} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span style={{ fontFamily: PP, fontSize: 22, fontWeight: 900, color: '#f0ede8', letterSpacing: '-0.03em', lineHeight: 1 }}>
            The <span style={{ color: '#f5c842' }}>Crunch</span>
          </span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {[
            { label: 'Home',  path: '/' },
            { label: 'Menu',  path: '/usersmenu' },
            { label: 'About', path: '/aboutthecrunch' },
          ].map((item) => (
            <motion.button
              key={item.label}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => navigate(item.path)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: PP, fontSize: 13.5, fontWeight: 500,
                color: 'rgba(240,237,232,0.5)', padding: '7px 14px', borderRadius: 8,
                transition: 'color 0.2s, background 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ede8'; e.currentTarget.style.background = 'rgba(240,237,232,0.07)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(240,237,232,0.5)'; e.currentTarget.style.background = 'transparent'; }}
            >
              {item.label}
            </motion.button>
          ))}

          <div style={{ width: 1, height: 16, background: 'rgba(240,237,232,0.12)', margin: '0 8px' }} />

          <motion.button
            whileHover={{ scale: 1.03, backgroundColor: '#e6b800' }} whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/usersmenu')}
            style={{ background: '#f5c842', border: 'none', borderRadius: 9, padding: '9px 22px', fontSize: 13, fontWeight: 700, color: '#111', cursor: 'pointer', fontFamily: PP, letterSpacing: '0.02em', transition: 'background 0.2s' }}
          >
            Order Now
          </motion.button>
        </div>
      </motion.nav>

      {/* ════════════ HERO ════════════ */}
      <section ref={heroRef} style={{ position: 'relative', height: '100vh', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>

        <motion.div
          style={{ position: 'absolute', inset: '-12%', y: heroImgY }}
          initial={{ scale: 1.18, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <img
            src="https://shorturl.at/01YLe"
            alt="Crispy fried chicken"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,6,4,0.97) 0%, rgba(8,6,4,0.52) 45%, rgba(8,6,4,0.08) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(75deg, rgba(8,6,4,0.65) 0%, transparent 55%)' }} />
        </motion.div>

        {/* Noise texture */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")", pointerEvents: 'none', zIndex: 2 }} />

        <motion.div style={{ position: 'relative', zIndex: 10, padding: '0 6vw 88px', maxWidth: 900, y: heroTextY, opacity: heroOpacity }}>
          <motion.div
            initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 28 }}
          >
            <div style={{ width: 36, height: 1, background: '#f5c842' }} />
            <span style={{ fontFamily: PP, fontSize: 11, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase' as const, color: '#f5c842' }}>
              Since 2021 · Quezon City
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 44 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.62, duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontFamily: PP,
              fontSize: 'clamp(52px, 9vw, 108px)',
              fontWeight: 900, color: '#f0ede8',
              lineHeight: 0.95, margin: '0 0 34px',
              letterSpacing: '-0.03em',
            }}
          >
            The Crunch<br />
            <em style={{ fontStyle: 'italic', color: '#f5c842' }}>Fairview.</em>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.82, duration: 0.8 }}
            style={{ fontFamily: PP, fontSize: 'clamp(15px, 1.8vw, 19px)', color: 'rgba(240,237,232,0.62)', lineHeight: 1.82, maxWidth: 540, fontWeight: 300, marginBottom: 48 }}
          >
            One of the leading Boneless Fried Chicken Brands in the Philippines.<br />
            Serving Deliciousness at 200+ Branches Nationwide.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.02, duration: 0.7 }}
            style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}
          >
            <motion.button
              whileHover={{ scale: 1.04, backgroundColor: '#e6b800' }} whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/usersmenu')}
              style={{ background: '#f5c842', color: '#111', border: 'none', borderRadius: 12, padding: '15px 38px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: PP, letterSpacing: '0.02em', transition: 'background 0.2s' }}
            >
              Explore Menu
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.04, borderColor: 'rgba(240,237,232,0.35)' }} whileTap={{ scale: 0.97 }}
              onClick={() => document.getElementById('about-vision')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ background: 'rgba(240,237,232,0.07)', color: '#f0ede8', border: '1px solid rgba(240,237,232,0.18)', borderRadius: 12, padding: '15px 38px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: PP, backdropFilter: 'blur(10px)', transition: 'all 0.2s' }}
            >
              Our Story
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}
          style={{ position: 'absolute', bottom: 40, right: '6vw', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
        >
          <span style={{ fontFamily: PP, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: 'rgba(240,237,232,0.28)', writingMode: 'vertical-rl' }}>
            Scroll
          </span>
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ repeat: Infinity, duration: 2.0, ease: 'easeInOut' }}
            style={{ width: 1, height: 60, background: 'linear-gradient(to bottom, rgba(245,200,66,0.55), transparent)' }}
          />
        </motion.div>
      </section>

      {/* ════════════ STATS BAR ════════════ */}
      <div style={{ background: '#f5c842', padding: '32px 6vw', position: 'relative', zIndex: 2 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {stats.map((s, i) => (
            <Reveal key={s.label} custom={i} variants={fadeUp}>
              <div style={{ textAlign: 'center', padding: '0 28px', borderRight: i < stats.length - 1 ? '1px solid rgba(17,17,17,0.14)' : 'none' }}>
                <div style={{ fontFamily: PP, fontSize: 'clamp(30px, 3.8vw, 46px)', fontWeight: 900, color: '#111', lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontFamily: PP, fontSize: 10.5, fontWeight: 600, color: 'rgba(17,17,17,0.5)', letterSpacing: '0.13em', textTransform: 'uppercase' as const, marginTop: 7 }}>
                  {s.label}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* ════════════ VISION ════════════ */}
      <section id="about-vision" style={{ padding: '128px 6vw', background: '#0e0c0a', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '15%', left: '-8%', width: 640, height: 640, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,200,66,0.048) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 88, alignItems: 'center' }}>

          {/* Image col */}
          <Reveal variants={fadeLeft}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', inset: -18, borderRadius: 42, border: '1px solid rgba(245,200,66,0.1)', pointerEvents: 'none' }} />
              <div style={{ borderRadius: 28, overflow: 'hidden', boxShadow: '0 48px 110px rgba(0,0,0,0.55)', position: 'relative' }}>
                <img
                  src="https://shorturl.at/v3t6W"
                  alt="The Crunch chicken"
                  style={{ width: '100%', height: '440px', objectFit: 'cover', display: 'block', filter: 'brightness(0.88) saturate(1.1)' }}
                />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,6,4,0.42) 0%, transparent 55%)' }} />
              </div>

              {/* Floating flavors badge */}
              <motion.div
                animate={{ y: [-6, 6, -6] }}
                transition={{ repeat: Infinity, duration: 4.0, ease: 'easeInOut' }}
                style={{ position: 'absolute', bottom: -30, right: -22, background: '#f5c842', borderRadius: 22, padding: '20px 26px', boxShadow: '0 18px 52px rgba(245,200,66,0.28)', textAlign: 'center', minWidth: 108 }}
              >
                <div style={{ fontFamily: PP, fontSize: 44, fontWeight: 900, color: '#111', lineHeight: 1 }}>7</div>
                <div style={{ fontFamily: PP, fontSize: 9, fontWeight: 700, color: 'rgba(17,17,17,0.55)', letterSpacing: '0.16em', textTransform: 'uppercase' as const, marginTop: 5 }}>Flavors</div>
              </motion.div>

              {/* Floating top-rated badge */}
              <motion.div
                animate={{ y: [4, -4, 4] }}
                transition={{ repeat: Infinity, duration: 4.4, ease: 'easeInOut', delay: 0.6 }}
                style={{ position: 'absolute', top: 26, left: -22, background: 'rgba(14,12,10,0.92)', backdropFilter: 'blur(14px)', border: '1px solid rgba(245,200,66,0.18)', borderRadius: 14, padding: '12px 20px', boxShadow: '0 14px 40px rgba(0,0,0,0.45)' }}
              >
                <div style={{ fontFamily: PP, fontSize: 11, fontWeight: 600, color: '#f5c842', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>⭐ Top Rated</div>
                <div style={{ fontFamily: PP, fontSize: 12, color: 'rgba(240,237,232,0.48)', marginTop: 3, fontWeight: 300 }}>Fairview, QC</div>
              </motion.div>
            </div>
          </Reveal>

          {/* Text col */}
          <Reveal variants={fadeRight}>
            <Label>What We Are</Label>
            <h2 style={{
              fontFamily: PP,
              fontSize: 'clamp(38px, 4.2vw, 56px)',
              fontWeight: 800, lineHeight: 1.08,
              color: '#f0ede8', letterSpacing: '-0.022em',
              margin: '0 0 28px',
            }}>
              Our<br /><em style={{ color: '#f5c842', fontStyle: 'italic' }}>Vision</em>
            </h2>
            <p style={{ fontFamily: PP, fontSize: 16, color: 'rgba(240,237,232,0.52)', lineHeight: 1.92, marginBottom: 20, fontWeight: 300 }}>
              Through a shared commitment to excellence we are dedicated to the uncompromising quality of our food and service while taking exceptional care of our guests and staff.
            </p>
            <p style={{ fontFamily: PP, fontSize: 16, color: 'rgba(240,237,232,0.52)', lineHeight: 1.92, fontWeight: 300, marginBottom: 40 }}>
              We will continuously strive to surpass our own accomplishments and be recognized as one of the most progressive and sustainable businesses in the country with more than 250 branches by 2024.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['Premium Chicken', 'Bold Sauces', 'Fast Service'].map((tag) => (
                <span key={tag} style={{ fontFamily: PP, fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 20, background: 'rgba(245,200,66,0.09)', border: '1px solid rgba(245,200,66,0.2)', color: '#f5c842', letterSpacing: '0.04em' }}>
                  {tag}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════ MISSION ════════════ */}
      <section style={{ background: '#151210', padding: '128px 6vw', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,200,66,0.055) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -120, left: '18%', width: 440, height: 440, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,200,66,0.038) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Reveal>
            <Label>Our Mission</Label>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 88, alignItems: 'center', marginTop: 48 }}>
            <Reveal variants={fadeLeft}>
              <h2 style={{
                fontFamily: PP,
                fontSize: 'clamp(42px, 5.2vw, 72px)',
                fontWeight: 900, color: '#f0ede8',
                lineHeight: 1.03, letterSpacing: '-0.028em', margin: 0,
              }}>
                Flavor for
                <em style={{ color: '#f5c842', display: 'block', fontStyle: 'italic' }}>Everyone,</em>
                Every Day.
              </h2>
            </Reveal>

            <Reveal variants={fadeRight}>
              <p style={{ fontFamily: PP, fontSize: 17, color: 'rgba(240,237,232,0.55)', lineHeight: 1.92, fontWeight: 300, marginBottom: 38 }}>
                To serve more people with a unique style of high quality boneless fried chicken, and to help Filipinos start a profitable and easy to manage business.
              </p>
              <div style={{ height: 2, width: 72, background: '#f5c842', borderRadius: 2, marginBottom: 38 }} />
              <motion.button
                whileHover={{ scale: 1.04, backgroundColor: '#e6b800' }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/usersmenu')}
                style={{ background: '#f5c842', color: '#111', border: 'none', borderRadius: 12, padding: '15px 36px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: PP, letterSpacing: '0.02em', transition: 'background 0.2s' }}
              >
                See the Menu →
              </motion.button>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════ PERKS ════════════ */}
      <section style={{ padding: '128px 6vw', background: '#0e0c0a' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Reveal>
            <div style={{ marginBottom: 76, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 28 }}>
              <div>
                <Label>Why The Crunch</Label>
                <h2 style={{
                  fontFamily: PP,
                  fontSize: 'clamp(36px, 4.2vw, 54px)',
                  fontWeight: 800, color: '#f0ede8',
                  margin: '4px 0 0', letterSpacing: '-0.022em',
                }}>
                  What Sets<br /><em style={{ color: '#f5c842', fontStyle: 'italic' }}>Us Apart</em>
                </h2>
              </div>
              <p style={{ fontFamily: PP, fontSize: 15, color: 'rgba(240,237,232,0.38)', maxWidth: 300, lineHeight: 1.78, fontWeight: 300 }}>
                Six reasons why The Crunch has become the go-to chicken brand for Filipinos everywhere.
              </p>
            </div>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {perks.map((perk, i) => (
              <Reveal key={perk.title} custom={i} variants={fadeUp}>
                <motion.div
                  whileHover={{ y: -8, borderColor: 'rgba(245,200,66,0.28)' }}
                  style={{
                    background: '#151210', borderRadius: 24, padding: '40px 32px',
                    border: '1px solid rgba(240,237,232,0.07)',
                    transition: 'border-color 0.3s',
                    height: '100%', boxSizing: 'border-box' as const,
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 32, right: 32, height: 2, background: 'linear-gradient(90deg, transparent, rgba(245,200,66,0.28), transparent)', borderRadius: 2 }} />
                  <div style={{ fontSize: 30, marginBottom: 20, lineHeight: 1 }}></div>
                  <h3 style={{ fontFamily: PP, fontSize: 16, fontWeight: 700, color: '#f0ede8', marginBottom: 10, letterSpacing: '-0.01em' }}>{perk.title}</h3>
                  <p style={{ fontFamily: PP, fontSize: 13.5, color: 'rgba(240,237,232,0.4)', lineHeight: 1.78, fontWeight: 300, margin: 0 }}>{perk.desc}</p>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ CTA BANNER ════════════ */}
      <section style={{ margin: '0 4vw 108px', borderRadius: 36, overflow: 'hidden', position: 'relative', minHeight: 440, display: 'flex', alignItems: 'center' }}>
        <img
          src="https://shorturl.at/mWMOx"
          alt="Chicken feast"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', filter: 'brightness(0.52) saturate(1.08)' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(8,6,4,0.9) 0%, rgba(8,6,4,0.6) 52%, rgba(8,6,4,0.12) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,6,4,0.48) 0%, transparent 60%)' }} />

        {/* Decorative rings */}
        <div style={{ position: 'absolute', right: '9%', top: '50%', transform: 'translateY(-50%)', width: 330, height: 330, borderRadius: '50%', border: '1px solid rgba(245,200,66,0.1)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: '6.5%', top: '50%', transform: 'translateY(-50%)', width: 440, height: 440, borderRadius: '50%', border: '1px solid rgba(245,200,66,0.055)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 10, padding: '64px 76px', maxWidth: 600 }}>
          <Reveal>
            <Label>Now Serving</Label>
            <h2 style={{
              fontFamily: PP,
              fontSize: 'clamp(36px, 4.8vw, 58px)',
              fontWeight: 900, color: '#f0ede8',
              lineHeight: 1.04, marginBottom: 22, letterSpacing: '-0.022em',
            }}>
              Ready to taste<br />
              <em style={{ color: '#f5c842', fontStyle: 'italic' }}>The Crunch?</em>
            </h2>
            <p style={{ fontFamily: PP, fontSize: 16, color: 'rgba(240,237,232,0.62)', marginBottom: 42, fontWeight: 300, lineHeight: 1.82, maxWidth: 430 }}>
              Visit us today and experience the crispiest chicken in town. Dine in, takeout, or order for your whole crew.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <motion.button
                whileHover={{ scale: 1.04, backgroundColor: '#e6b800' }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/usersmenu')}
                style={{ background: '#f5c842', color: '#111', border: 'none', borderRadius: 12, padding: '15px 40px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: PP, letterSpacing: '0.03em', transition: 'background 0.2s' }}
              >
                Order Now
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04, borderColor: 'rgba(240,237,232,0.38)' }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/')}
                style={{ background: 'rgba(240,237,232,0.07)', color: '#f0ede8', border: '1.5px solid rgba(240,237,232,0.2)', borderRadius: 12, padding: '15px 40px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: PP, backdropFilter: 'blur(10px)', transition: 'all 0.2s' }}
              >
                Learn More
              </motion.button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════ FOOTER ════════════ */}
      <footer style={{ borderTop: '1px solid rgba(240,237,232,0.07)', padding: '56px 6vw 42px', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 36, marginBottom: 44 }}>
          <div>
            <button onClick={scrollTop} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'block', marginBottom: 12 }}>
              <span style={{ fontFamily: PP, fontSize: 20, fontWeight: 900, color: '#f0ede8', letterSpacing: '-0.03em' }}>
                The <span style={{ color: '#f5c842' }}>Crunch</span>
              </span>
            </button>
            <p style={{ fontFamily: PP, fontSize: 13, color: 'rgba(240,237,232,0.28)', margin: 0, lineHeight: 1.68, maxWidth: 220, fontWeight: 300 }}>
              Crispy, saucy, always fresh.<br />Fairview, Dahlia, Quezon City.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            <span style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, color: 'rgba(240,237,232,0.18)', letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>
              Follow Us
            </span>
            <div style={{ display: 'flex', gap: 28 }}>
              {[
                { label: 'Instagram', href: 'https://www.instagram.com/thecrunchfairview' },
                { label: 'Facebook',  href: 'https://www.facebook.com/thecrunchfairview' },
              ].map((s) => (
                <a
                  key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: PP, fontSize: 14, fontWeight: 500, color: 'rgba(240,237,232,0.42)', textDecoration: 'none', transition: 'color 0.2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#f5c842'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(240,237,232,0.42)'; }}
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', paddingTop: 26, borderTop: '1px solid rgba(240,237,232,0.06)', textAlign: 'center' as const }}>
          <span style={{ fontFamily: PP, fontSize: 12, color: 'rgba(240,237,232,0.15)', fontWeight: 300 }}>
            © {new Date().getFullYear()} The Crunch Fairview Dahlia Quezon City · All rights reserved
          </span>
        </div>
      </footer>

    </div>
  );
}