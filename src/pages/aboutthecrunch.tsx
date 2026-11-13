import { useRef, useState, useEffect, CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, useScroll, useTransform, MotionConfig } from 'framer-motion';
import { useAuth } from '@/context/authcontext';
import { Navbar } from '@/components/Navbar';

// Ensure Google Font 'Poppins' is loaded
if (typeof document !== 'undefined' && !document.getElementById('crunch-fonts')) {
  const l = document.createElement('link');
  l.id = 'crunch-fonts';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,900&display=swap';
  document.head.appendChild(l);
}

const PP = "'Poppins', sans-serif";
// Synced with products.tsx: Black & Gold palette
const BLACK = '#140f0c';
const GOLD = '#C9A84C';
const GOLD_DARK = '#B8953A';
const GOLD_LIGHT = '#E8D4A0';
const CREAM = '#F5F0E8';
const GOLD_TEXT = '#15120a';

// Derived palette values (synced)
const Y = GOLD;
const Y_DARK = GOLD_DARK;
const Y_LIGHT = GOLD_LIGHT;
const CR = CREAM;
const CR_MUTED = 'rgba(245, 240, 232, 0.65)';
const BG = BLACK;
const BORDER = 'rgba(89, 92, 86, 0.25)';

const IMG_HERO = '/img/crunch22.png';
const IMG_STORY = '/img/chickchicken.png';

// ── Top Scroll Progress Bar ────────────────────────────────────────────────
function ScrollProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(total > 0 ? el.scrollTop / total : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2.5, zIndex: 1100, background: 'rgba(255,255,255,0.04)' }}>
      <div
        style={{
          height: '100%',
          background: `linear-gradient(90deg, ${Y} 0%, ${Y_LIGHT} 100%)`,
          width: `${progress * 100}%`,
          boxShadow: `0 0 10px ${Y}`,
          transition: 'width 0.08s linear',
        }}
      />
    </div>
  );
}

// ── Breakpoint Hook ────────────────────────────────────────────────────────
function useScreen() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { isMobile: w < 680, isTablet: w < 1024, isDesktop: w >= 1024 };
}

// ── Reveal Wrapper ─────────────────────────────────────────────────────────
function Reveal({
  children,
  delay = 0,
  dir = 'up',
  style = {},
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  dir?: 'up' | 'left' | 'right' | 'none';
  style?: CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const init =
    dir === 'up' ? { opacity: 0, y: 40 } : dir === 'left' ? { opacity: 0, x: -40 } : dir === 'right' ? { opacity: 0, x: 40 } : { opacity: 0 };

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={init}
      animate={inView ? { opacity: 1, y: 0, x: 0 } : init}
      transition={{ delay, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

// ── Stat Card Component (Enhanced 3D) ──────────────────────────────────────
function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 680;

  return (
    <motion.div
      style={{
        background: 'rgba(26, 26, 26, 0.9)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        padding: '20px 24px',
        textAlign: 'center',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
        transformStyle: 'preserve-3d',
        perspective: 1000,
      }}
      whileHover={isMobile ? {} : {
        y: -8,
        rotateX: 3,
        rotateY: -3,
        borderColor: 'rgba(245, 200, 66, 0.5)',
        boxShadow: '0 20px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 40px rgba(245, 200, 66, 0.1)',
        scale: 1.02,
        transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }
      }}
      whileTap={{ scale: 0.98 }}
    >
      <motion.div style={{ transform: 'translateZ(20px)' }}>
        <div style={{ fontFamily: PP, fontSize: 28, fontWeight: 900, color: Y, lineHeight: 1, textShadow: '0 4px 20px rgba(245, 200, 66, 0.3)' }}>{value}</div>
        <div style={{ fontFamily: PP, fontSize: 11, fontWeight: 700, color: CR, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 8 }}>
          {label}
        </div>
        {sub && <div style={{ fontSize: 11.5, color: CR_MUTED, marginTop: 4, fontWeight: 300 }}>{sub}</div>}
      </motion.div>
    </motion.div>
  );
}

// ── Continuous Marquee Ticker ──────────────────────────────────────────────
function MarqueeBanner() {
  const items = ['100% Fresh Daily', '7 Signature Glazes', '250+ Branches Nationwide', 'Born in Quezon City', 'Hand-Crafted To Order', 'Fairview Flagship'];
  const repeated = [...items, ...items, ...items];

  return (
    <div
      style={{
        overflow: 'hidden',
        height: 52,
        background: `linear-gradient(90deg, ${Y} 0%, ${Y_LIGHT} 100%)`,
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      <motion.div
        animate={{ x: [0, '-33.333%'] }}
        transition={{ repeat: Infinity, duration: 25, ease: 'linear' }}
        style={{ display: 'flex', whiteSpace: 'nowrap' }}
      >
        {repeated.map((txt, idx) => (
          <span
            key={idx}
            style={{
              fontFamily: PP,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: `${GOLD_TEXT}`,
              padding: '0 32px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 28,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(19, 13, 4, 0.35)' }} />
            {txt}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ── Data & Highlights ─────────────────────────────────────────────────────
const PILLARS = [
  { no: '01', title: 'Always Fresh, Never Frozen', desc: 'Premium chicken cuts prepped every morning in-house. Pure crunch with zero frozen compromises.' },
  { no: '02', title: '7 Signature Glazes', desc: 'From savory garlic parmesan to fiery hot glazes, each recipe is developed to coat every bite thoroughly.' },
  { no: '03', title: 'Speed Meets Precision', desc: 'Flash-fried to order so your meal arrives piping hot, extraordinarily crispy, and locked in flavor.' },
  { no: '04', title: 'Family Recipe Heritage', desc: 'Crafted with passion using proprietary spice rubs that made us a homegrown favorite since 2021.' },
  { no: '05', title: 'Community & Franchise Growth', desc: 'Empowering local entrepreneurs and opening doors across neighborhoods from Luzon to Mindanao.' },
  { no: '06', title: '250+ Branches Strong', desc: 'A nationwide community united by the love for boneless crunchy chicken, anchored right here in Fairview.' },
];

// ── Main About Component ──────────────────────────────────────────────────
export default function AboutTheCrunch() {
  const navigate = useNavigate();
  const { isMobile, isTablet } = useScreen();
  useAuth(); // Initialize auth context

  const heroTargetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroTargetRef, offset: ['start start', 'end start'] });
  const textTranslateY = useTransform(scrollYProgress, [0, 1], ['0%', '15%']);
  const imageTranslateY = useTransform(scrollYProgress, [0, 1], ['0%', '12%']);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, 1.06]);
  const imageRotateX = useTransform(scrollYProgress, [0, 1], ['0deg', '3deg']);

  const goMenu = () => navigate('/usersmenu?showOrderModal=true');
  const goProducts = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    navigate('/');
  };

  return (
    <MotionConfig reducedMotion="user">
      <div style={{ fontFamily: PP, background: BG, color: CR, overflowX: 'hidden', minHeight: '100vh', position: 'relative' }}>
        <ScrollProgressBar />
        <Navbar />

        {/* ── Hero Section ────────────────────────────────────────────────── */}
        <section
          ref={heroTargetRef}
          style={{
            minHeight: '100vh',
            backgroundImage: [
              'radial-gradient(ellipse 32% 100% at 32% 100%, rgb(166 79 34 / 8%), transparent)',
              'radial-gradient(ellipse 38% 92% at 76% 100%, rgb(166 79 34 / 8%), transparent)',
              'linear-gradient(to top, rgb(166 79 34 / 7%), transparent 78%)',
            ].join(', '),
            backgroundSize: '100% clamp(180px, 36vh, 370px)',
            backgroundPosition: 'center bottom',
            backgroundRepeat: 'no-repeat',
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: isTablet ? '1fr' : '1.15fr 0.85fr',
            alignItems: 'center',
            paddingTop: isMobile ? 84 : 70,
            zIndex: 1,
            perspective: 1000,
          }}
        >
          {/* Left Text Content */}
          <motion.div
            style={{
              y: isTablet ? 0 : textTranslateY,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: isMobile ? '40px 24px' : isTablet ? '60px 48px' : '0 64px 60px 64px',
              position: 'relative',
              zIndex: 2,
              transformStyle: 'preserve-3d',
            }}
            initial={{ opacity: 0, y: 40, rotateX: -8 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: 0.1, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(245, 200, 66, 0.1)',
                border: '1px solid rgba(245, 200, 66, 0.25)',
                padding: '6px 14px',
                borderRadius: 999,
                width: 'fit-content',
                marginBottom: 20,
                transform: 'translateZ(20px)',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: Y }} />
              <span style={{ fontFamily: PP, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: Y }}>
                Est. 2021 · Fairview, Quezon City
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30, rotateX: -5 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: 0.3, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontFamily: PP,
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: '-0.035em',
                fontSize: isMobile ? 'clamp(46px, 12vw, 68px)' : 'clamp(52px, 5.5vw, 84px)',
                color: CR,
                margin: '0 0 24px',
                transform: 'translateZ(30px)',
                textShadow: '0 4px 30px rgba(0,0,0,0.5)',
              }}
            >
              The <span style={{ color: Y, fontStyle: 'italic' }}>Crunch</span>
              <br />
              Fairview.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontFamily: PP,
                fontSize: isMobile ? 14 : 15.5,
                color: CR_MUTED,
                lineHeight: 1.85,
                maxWidth: 480,
                fontWeight: 300,
                marginBottom: 36,
                transform: 'translateZ(20px)',
              }}
            >
              Home of authentic Filipino boneless fried chicken. Crafted daily with our secret spice rubs, hand-spun in signature glazes, and serving over 250+ communities nationwide.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', gap: 14, flexWrap: 'wrap', transform: 'translateZ(20px)' }}
            >
              <motion.button
                onClick={goMenu}
                style={{
                  background: `linear-gradient(135deg, ${Y} 0%, ${Y_DARK} 100%)`,
                  border: 'none',
                  borderRadius: 14,
                  padding: isMobile ? '14px 32px' : '16px 40px',
                  fontSize: 14,
                  fontWeight: 800,
                  color: `${GOLD_TEXT}`,
                  cursor: 'pointer',
                  fontFamily: PP,
                  boxShadow: '0 8px 24px rgba(245, 200, 66, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                  position: 'relative',
                  overflow: 'hidden',
                  transform: 'translateZ(10px)',
                }}
                whileHover={isMobile ? { scale: 1.02 } : {
                  scale: 1.03,
                  boxShadow: '0 16px 40px rgba(245, 200, 66, 0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
                  y: -2,
                  rotateX: 3,
                }}
                whileTap={{ scale: 0.97, rotateX: 0 }}
              >
                <span style={{ position: 'relative', zIndex: 1 }}>Order Online</span>
                <motion.div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%)',
                    opacity: 0,
                  }}
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                />
              </motion.button>
              <motion.button
                onClick={() => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' })}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  backdropFilter: 'blur(16px)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 14,
                  padding: isMobile ? '14px 28px' : '16px 34px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: CR,
                  cursor: 'pointer',
                  fontFamily: PP,
                  position: 'relative',
                  overflow: 'hidden',
                  transform: 'translateZ(10px)',
                }}
                whileHover={isMobile ? { background: 'rgba(255,255,255,0.08)' } : {
                  background: 'rgba(245, 200, 66, 0.1)',
                  borderColor: 'rgba(245, 200, 66, 0.4)',
                  color: Y,
                  y: -2,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                  rotateX: 3,
                }}
                whileTap={{ scale: 0.97, rotateX: 0 }}
              >
                <span style={{ position: 'relative', zIndex: 1 }}>Our Heritage</span>
              </motion.button>
            </motion.div>
          </motion.div>

          {/* Right Hero Image + Badges - Premium Cinematic Composition */}
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              minHeight: isMobile ? 380 : isTablet ? 460 : '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              perspective: 1000,
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Depth layer - subtle glow behind image */}
            <motion.div
              style={{
                position: 'absolute',
                inset: '10% 5% 20% 5%',
                borderRadius: 32,
                background: `radial-gradient(ellipse at center, rgba(166, 79, 34, 0.12) 0%, transparent 70%)`,
                filter: 'blur(60px)',
                zIndex: 0,
                transform: 'translateZ(-40px)',
              }}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />

            {/* Main image with 3D entrance and scroll parallax */}
            <motion.div
              style={{
                position: 'relative',
                width: isMobile ? '90%' : isTablet ? '85%' : '75%',
                maxWidth: 600,
                aspectRatio: '4/3',
                borderRadius: 28,
                overflow: 'hidden',
                transformStyle: 'preserve-3d',
                boxShadow: '0 40px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03), 0 0 100px rgba(245, 200, 66, 0.08)',
                border: '1px solid rgba(255,255,255,0.05)',
                y: imageTranslateY,
                scale: imageScale,
                rotateX: imageRotateX,
              }}
              initial={{ opacity: 0, y: 60, rotateX: -12, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
              transition={{ delay: 0.3, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              whileHover={isMobile ? {} : {
                rotateX: 4,
                rotateY: -4,
                scale: 1.015,
                boxShadow: '0 60px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 140px rgba(245, 200, 66, 0.15)',
                transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
              }}
            >
              <img
                src={IMG_HERO}
                alt="Golden Boneless Fried Chicken"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block',
                  transform: 'translateZ(40px) scale(1.02)',
                  transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              />
              <div style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(180deg, transparent 35%, rgba(8,7,6,0.4) 65%, ${BLACK} 95%)`,
                transform: 'translateZ(20px)',
              }} />
              {/* Subtle accent line */}
              <motion.div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: '15%',
                  right: '15%',
                  height: 2,
                  background: `linear-gradient(90deg, transparent, ${Y}, transparent)`,
                  transform: 'translateZ(30px)',
                  opacity: 0,
                }}
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: 1.0, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
            </motion.div>

            {/* Stat Badges - Enhanced 3D Cards */}
            <div
              style={{
                position: 'absolute',
                bottom: isMobile ? 20 : 44,
                left: isMobile ? 20 : 36,
                right: isMobile ? 20 : 'auto',
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, auto)',
                gap: 12,
                zIndex: 10,
              }}
            >
              <StatCard value="250+" label="Branches" />
              <StatCard value="7" label="Glazes" />
              <StatCard value="2021" label="Founded" />
            </div>
          </div>
        </section>

        {/* ── Marquee Ticker ──────────────────────────────────────────────── */}
        <MarqueeBanner />

        {/* ── Story Section ───────────────────────────────────────────────── */}
        <section
          id="story"
          style={{
            background: BLACK,
            padding: isMobile ? '70px 0' : '110px 0',
            position: 'relative',
            zIndex: 1,
            borderTop: `1px solid ${BORDER}`,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              maxWidth: 1220,
              margin: '0 auto',
              padding: isMobile ? '0 24px' : isTablet ? '0 40px' : '0 48px',
              display: 'grid',
              gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr',
              gap: isTablet ? 48 : 80,
              alignItems: 'center',
            }}
          >
            {/* Story Image (Enhanced 3D) */}
            <Reveal dir={isTablet ? 'up' : 'left'} className="story-image-wrapper">
              <div style={{ position: 'relative', perspective: 1000, transformStyle: 'preserve-3d' }}>
                <motion.div
                  style={{
                    borderRadius: 28,
                    overflow: 'hidden',
                    height: isMobile ? 300 : isTablet ? 400 : 480,
                    border: `1px solid ${BORDER}`,
                    boxShadow: '0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)',
                    transformStyle: 'preserve-3d',
                  }}
                  whileHover={isMobile ? { y: -6 } : {
                    y: -12,
                    rotateX: 5,
                    rotateY: -5,
                    boxShadow: '0 40px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 80px rgba(245, 200, 66, 0.1)',
                    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }
                  }}
                  whileTap={{ scale: 0.99 }}
                >
                  <img
                    src={IMG_STORY}
                    alt="The Crunch Boneless Chicken"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: 'center',
                      display: 'block',
                      transform: 'translateZ(20px) scale(1.02)',
                      transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, transparent 40%, rgba(8,7,6,0.6) 100%)',
                    transform: 'translateZ(10px)',
                  }} />
                </motion.div>
                {/* Ambient glow behind image */}
                <motion.div
                  style={{
                    position: 'absolute',
                    inset: '10% 5% 20% 5%',
                    borderRadius: 28,
                    background: `radial-gradient(ellipse at center, rgba(166, 79, 34, 0.12) 0%, transparent 70%)`,
                    filter: 'blur(40px)',
                    zIndex: -1,
                    transform: 'translateZ(-20px)',
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                />
                {/* Floating Heritage Tag (Enhanced) */}
                <motion.div
                  style={{
                    position: 'absolute',
                    bottom: -18,
                    right: 28,
                    background: `linear-gradient(135deg, ${Y} 0%, ${Y_DARK} 100%)`,
                    borderRadius: 20,
                    padding: '18px 28px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 40px rgba(245, 200, 66, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
                    transform: 'translateZ(40px) rotateY(-5deg) rotateX(5deg)',
                    transformStyle: 'preserve-3d',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                  initial={{ opacity: 0, y: 20, rotateZ: -5 }}
                  animate={{ opacity: 1, y: 0, rotateZ: 0 }}
                  transition={{ delay: 0.7, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={isMobile ? {} : {
                    rotateY: 0,
                    rotateX: 0,
                    scale: 1.05,
                    boxShadow: '0 28px 60px rgba(0,0,0,0.7), 0 0 60px rgba(245, 200, 66, 0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
                    transition: { duration: 0.3 }
                  }}
                >
                  <div style={{ fontFamily: PP, fontSize: 36, fontWeight: 900, color: `${GOLD_TEXT}`, lineHeight: 1, textShadow: '0 2px 8px rgba(19,13,4,0.2)' }}>7</div>
                  <div style={{ fontFamily: PP, fontSize: 9.5, fontWeight: 800, color: 'rgba(19, 13, 4, 0.7)', letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 6 }}>
                    House Glazes
                  </div>
                </motion.div>
              </div>
            </Reveal>

            {/* Story Text */}
            <Reveal dir={isTablet ? 'up' : 'right'} delay={0.1}>
              <div>
                <span style={{ fontFamily: PP, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: Y, display: 'block', marginBottom: 12 }}>
                  Our Vision & Standard
                </span>
                <h2
                  style={{
                    fontFamily: PP,
                    fontWeight: 900,
                    color: CR,
                    lineHeight: 1.05,
                    letterSpacing: '-0.025em',
                    fontSize: isMobile ? 'clamp(32px, 8.5vw, 44px)' : 'clamp(36px, 3.8vw, 52px)',
                    margin: '0 0 24px',
                  }}
                >
                  Uncompromising <br />
                  <span style={{ color: Y, fontStyle: 'italic' }}>Perfection</span> in Every Bite.
                </h2>
                <div style={{ width: 44, height: 2, background: Y, marginBottom: 24 }} />
                <p style={{ fontFamily: PP, fontSize: isMobile ? 14 : 15, color: CR_MUTED, lineHeight: 1.85, fontWeight: 300, marginBottom: 16 }}>
                  Through an unwavering dedication to culinary excellence, we hold every batch to the highest standards. We only serve poultry hand-trimmed, marinated thoroughly, and tossed in bespoke sauces created specifically for the Filipino palate.
                </p>
                <p style={{ fontFamily: PP, fontSize: isMobile ? 14 : 15, color: CR_MUTED, lineHeight: 1.85, fontWeight: 300, marginBottom: 32 }}>
                  From our humble Fairview kitchen in Quezon City to over 250 storefronts across the archipelago, our recipe for success has remained unchanged: genuine hospitality and exceptional chicken.
                </p>

                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: PP, fontSize: 32, fontWeight: 900, color: Y, lineHeight: 1 }}>2021</div>
                    <div style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, color: CR_MUTED, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 6 }}>
                      Quezon City Born
                    </div>
                  </div>
                  <div style={{ width: 1, height: 42, background: BORDER }} />
                  <div>
                    <div style={{ fontFamily: PP, fontSize: 32, fontWeight: 900, color: Y, lineHeight: 1 }}>100%</div>
                    <div style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, color: CR_MUTED, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 6 }}>
                      Boneless Chicken
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Mission Statement ───────────────────────────────────────────── */}
        <section style={{ background: BLACK, padding: isMobile ? '70px 0' : '100px 0', position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 1220, margin: '0 auto', padding: isMobile ? '0 24px' : '0 48px' }}>
            <Reveal>
              <span style={{ fontFamily: PP, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: Y, display: 'block', marginBottom: 28 }}>
                Our Mission
              </span>
            </Reveal>

            <Reveal delay={0.05}>
              <h2
                style={{
                  fontFamily: PP,
                  fontWeight: 900,
                  lineHeight: 0.95,
                  letterSpacing: '-0.035em',
                  fontSize: isMobile ? 'clamp(40px, 11vw, 64px)' : 'clamp(52px, 7vw, 100px)',
                  color: CR,
                  margin: 0,
                }}
              >
                Flavor for Everyone.
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <h2
                style={{
                  fontFamily: PP,
                  fontWeight: 900,
                  lineHeight: 0.95,
                  letterSpacing: '-0.035em',
                  fontSize: isMobile ? 'clamp(40px, 11vw, 64px)' : 'clamp(52px, 7vw, 100px)',
                  color: Y,
                  fontStyle: 'italic',
                  margin: '8px 0 32px',
                }}
              >
                Every Single Day.
              </h2>
            </Reveal>

            <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr' : '1.2fr 0.8fr', gap: isTablet ? 28 : 64, alignItems: 'center' }}>
              <Reveal dir="left" delay={0.18}>
                <p style={{ fontFamily: PP, fontSize: isMobile ? 14.5 : 16.5, color: CR_MUTED, lineHeight: 1.85, fontWeight: 300, margin: 0 }}>
                  To serve communities with authentic, affordable boneless fried chicken, and to empower Filipinos with accessible, profitable franchise opportunities that build sustainable futures.
                </p>
              </Reveal>
              <Reveal dir={isTablet ? 'up' : 'right'} delay={0.22}>
                <div style={{ display: 'flex', justifyContent: isTablet ? 'flex-start' : 'flex-end' }}>
                  <motion.button
                    onClick={goMenu}
                    style={{
                      background: `linear-gradient(135deg, ${Y} 0%, ${Y_DARK} 100%)`,
                      border: 'none',
                      borderRadius: 14,
                      padding: '16px 42px',
                      fontSize: 14.5,
                      fontWeight: 800,
                      color: `${GOLD_TEXT}`,
                      cursor: 'pointer',
                      fontFamily: PP,
                      boxShadow: '0 10px 30px rgba(245, 200, 66, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                    whileHover={isMobile ? { scale: 1.02 } : {
                      scale: 1.03,
                      boxShadow: '0 18px 48px rgba(245, 200, 66, 0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
                      y: -3,
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span style={{ position: 'relative', zIndex: 1 }}>Explore Our Menu</span>
                    <motion.div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 50%)',
                        opacity: 0,
                      }}
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                    />
                  </motion.button>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Pillars / What Sets Us Apart ─────────────────────────────────── */}
        <section style={{ background: BLACK, padding: isMobile ? '70px 0' : '100px 0', position: 'relative', zIndex: 1, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ maxWidth: 1220, margin: '0 auto', padding: isMobile ? '0 24px' : '0 48px' }}>
            <Reveal>
              <div style={{ display: 'flex', flexDirection: isTablet ? 'column' : 'row', justifyContent: 'space-between', alignItems: isTablet ? 'flex-start' : 'flex-end', marginBottom: 48, gap: 16 }}>
                <div>
                  <span style={{ fontFamily: PP, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: Y, display: 'block', marginBottom: 10 }}>
                    Why The Crunch
                  </span>
                  <h2 style={{ fontFamily: PP, fontWeight: 900, color: CR, letterSpacing: '-0.025em', margin: 0, fontSize: isMobile ? 32 : 44 }}>
                    What Sets Us Apart
                  </h2>
                </div>
                <p style={{ fontFamily: PP, fontSize: 14, color: CR_MUTED, maxWidth: 320, lineHeight: 1.7, margin: 0 }}>
                  Six pillars that define why millions of Filipinos choose The Crunch for their chicken cravings.
                </p>
              </div>
            </Reveal>

            {/* Grid Pillars (Enhanced 3D Cards) */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 24, perspective: 1000 }}>
              {PILLARS.map((p, idx) => (
                <Reveal key={p.no} delay={idx * 0.08} dir="up">
                  <motion.div
                    style={{
                      background: BLACK,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 20,
                      padding: '32px 28px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      height: '100%',
                      transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
                      transformStyle: 'preserve-3d',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                    whileHover={isMobile ? { y: -4, background: BLACK } : {
                      y: -10,
                      rotateX: 4,
                      rotateY: -4,
                      borderColor: 'rgba(245, 200, 66, 0.4)',
                      background: 'linear-gradient(145deg, rgba(26, 22, 18, 1) 0%, rgba(22, 19, 16, 0.98) 100%)',
                      boxShadow: '0 28px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 60px rgba(245, 200, 66, 0.08)',
                      scale: 1.015,
                      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
                    }}
                    whileTap={{ scale: 0.985 }}
                  >
                    {/* Glow accent line at top */}
                    <motion.div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: '10%',
                        right: '10%',
                        height: 2,
                        background: `linear-gradient(90deg, transparent, ${Y}, transparent)`,
                        opacity: 0,
                        borderRadius: '2px 2px 0 0',
                      }}
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ delay: idx * 0.08 + 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, transform: 'translateZ(10px)' }}>
                      <span style={{
                        fontFamily: PP,
                        fontSize: 36,
                        fontWeight: 900,
                        color: Y,
                        letterSpacing: '0.02em',
                        lineHeight: 1,
                        textShadow: '0 2px 12px rgba(245, 200, 66, 0.25)',
                        background: `linear-gradient(180deg, ${Y} 0%, ${Y_DARK} 100%)`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}>{p.no}</span>
                      <div style={{ flex: 1 }} />
                    </div>
                    <motion.h3
                      style={{
                        fontFamily: PP,
                        fontSize: 18,
                        fontWeight: 800,
                        color: CR,
                        margin: 0,
                        lineHeight: 1.3,
                        transform: 'translateZ(10px)',
                      }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 + 0.4, duration: 0.5 }}
                    >
                      {p.title}
                    </motion.h3>
                    <motion.p
                      style={{
                        fontFamily: PP,
                        fontSize: 13.5,
                        color: CR_MUTED,
                        lineHeight: 1.75,
                        fontWeight: 300,
                        margin: 0,
                        transform: 'translateZ(10px)',
                      }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 + 0.5, duration: 0.5 }}
                    >
                      {p.desc}
                    </motion.p>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Call to Action (CTA) ─────────────────────────────────────────── */}
        <section
          style={{
            position: 'relative',
            minHeight: isMobile ? '60vh' : '75vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            zIndex: 1,
            perspective: 1000,
            background: BLACK,
          }}
        >
          <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>
            <motion.div
              style={{
                position: 'absolute',
                inset: 0,
                transform: 'translateZ(-50px) scale(1.1)',
                filter: 'brightness(0.25) saturate(1.2)',
              }}
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <img
                src={IMG_HERO}
                alt="Crispy Fried Chicken"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block',
                }}
              />
            </motion.div>
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(ellipse at center, transparent 15%, rgba(8,7,6,0.4) 50%, ${BLACK} 95%)`,
              transform: 'translateZ(-20px)',
            }} />
            {/* Copper light behind the store image */}
            <motion.div
              style={{
                position: 'absolute',
                inset: '15% 10% 25% 10%',
                borderRadius: '50%',
                background: `radial-gradient(ellipse at center, rgba(166, 79, 34, 0.08) 0%, transparent 70%)`,
                filter: 'blur(80px)',
                transform: 'translateZ(-30px)',
              }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 2, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>

          <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: isMobile ? '0 24px' : '0 40px', maxWidth: 760, transform: 'translateZ(50px)' }}>
            <Reveal>
              <span style={{ fontFamily: PP, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: Y, display: 'block', marginBottom: 16 }}>
                Fairview Flagship Store
              </span>
              <motion.h2
                style={{
                  fontFamily: PP,
                  fontWeight: 900,
                  color: CR,
                  lineHeight: 0.95,
                  letterSpacing: '-0.035em',
                  fontSize: isMobile ? 'clamp(36px, 10vw, 54px)' : 'clamp(44px, 6vw, 84px)',
                  margin: '0 0 20px',
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              >
                Craving <span style={{ color: Y, fontStyle: 'italic' }}>The Crunch?</span>
              </motion.h2>
              <motion.p
                style={{ fontFamily: PP, fontSize: isMobile ? 14 : 16, color: CR_MUTED, maxWidth: 460, margin: '0 auto 36px', lineHeight: 1.7, fontWeight: 300 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.7 }}
              >
                Drop by our Fairview branch or place an order online. Savor golden boneless fried chicken coated in your favorite house glaze today.
              </motion.p>

              <motion.div
                style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.7 }}
              >
                <motion.button
                  onClick={goMenu}
                  style={{
                    background: `linear-gradient(135deg, ${Y} 0%, ${Y_DARK} 100%)`,
                    border: 'none',
                    borderRadius: 14,
                    padding: isMobile ? '14px 36px' : '16px 44px',
                    fontSize: 14.5,
                    fontWeight: 800,
                    color: `${GOLD_TEXT}`,
                    cursor: 'pointer',
                    fontFamily: PP,
                    boxShadow: '0 10px 30px rgba(245, 200, 66, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  whileHover={isMobile ? { scale: 1.02 } : {
                    scale: 1.03,
                    boxShadow: '0 18px 48px rgba(245, 200, 66, 0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
                    y: -3,
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  <span style={{ position: 'relative', zIndex: 1 }}>Order Now</span>
                  <motion.div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, transparent 50%)',
                      opacity: 0,
                    }}
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                  />
                </motion.button>
                <motion.button
                  onClick={goProducts}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    backdropFilter: 'blur(16px)',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 14,
                    padding: isMobile ? '14px 32px' : '16px 40px',
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: CR,
                    cursor: 'pointer',
                    fontFamily: PP,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  whileHover={isMobile ? { background: 'rgba(255,255,255,0.1)' } : {
                    background: 'rgba(245, 200, 66, 0.12)',
                    borderColor: 'rgba(245, 200, 66, 0.5)',
                    color: Y,
                    y: -3,
                    boxShadow: '0 16px 40px rgba(0,0,0,0.5), 0 0 40px rgba(245, 200, 66, 0.15)',
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  <span style={{ position: 'relative', zIndex: 1 }}>Explore Storefront</span>
                </motion.button>
              </motion.div>
            </Reveal>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer style={{ background: BLACK, borderTop: `1px solid ${BORDER}`, padding: isMobile ? '50px 24px 32px' : '64px 48px 36px', position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 1220, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '2fr 1fr 1fr', gap: isMobile ? 36 : 48, marginBottom: 44 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <img src="/img/logo24.png" alt="The Crunch" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'contain' }} />
                  <span style={{ fontFamily: PP, fontSize: 17, fontWeight: 900, color: CR }}>
                    The <span style={{ color: Y }}>Crunch</span>
                  </span>
                </div>
                <p style={{ fontFamily: PP, fontSize: 13.5, color: CR_MUTED, maxWidth: 280, margin: 0, lineHeight: 1.7, fontWeight: 300 }}>
                  Fresh, saucy, and unbeatably crunchy boneless chicken.
                  <br />
                  6 Falcon St., cor Dahlia Fairview, Quezon City.
                </p>
              </div>

            
              <div>
                <span style={{ fontFamily: PP, fontSize: 10, fontWeight: 700, color: 'rgba(245, 242, 235, 0.35)', letterSpacing: '0.18em', textTransform: 'uppercase', display: 'block', marginBottom: 14 }}>
                  Social Channels
                </span>
                {[
                  { label: 'Instagram', url: 'https://www.instagram.com/thecrunchfairview' },
                  { label: 'Facebook', url: 'https://www.facebook.com/thecrunchfairview' },
                ].map(({ label, url }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block',
                      fontFamily: PP,
                      fontSize: 13.5,
                      fontWeight: 400,
                      color: CR_MUTED,
                      textDecoration: 'none',
                      padding: '5px 0',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = Y; }}
                    onMouseLeave={e => { e.currentTarget.style.color = CR_MUTED; }}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                paddingTop: 24,
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                fontSize: 12,
                color: 'rgba(245, 242, 235, 0.25)',
                fontWeight: 300,
              }}
            >
              <span>© {new Date().getFullYear()} The Crunch Fairview Dahlia Quezon City. All rights reserved.</span>
              <span>Fairview, Dahlia, QC 1118</span>
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
