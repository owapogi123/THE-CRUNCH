import { useRef, useState, useEffect, CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView, useScroll, useTransform, MotionConfig } from 'framer-motion';
import { useAuth } from '../context/authcontext';

// Ensure Google Font 'Poppins' is loaded
if (typeof document !== 'undefined' && !document.getElementById('crunch-fonts')) {
  const l = document.createElement('link');
  l.id = 'crunch-fonts';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,900&display=swap';
  document.head.appendChild(l);
}

const PP = "'Poppins', sans-serif";
const Y = '#f5c842';
const Y_DARK = '#d9aa2b';
const CR = '#f5f2eb';
const CR_MUTED = 'rgba(245, 242, 235, 0.52)';
const BG = '#080706';
const CARD_BG = '#120f0c';
const BORDER = 'rgba(255, 255, 255, 0.07)';

const IMG_HERO = '/img/crunch22.png';
const IMG_STORY = '/img/chickchicken.png';

// ── Floating Warm Embers Canvas ───────────────────────────────────────────
function EmberCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, raf = 0;
    type Ember = { x: number; y: number; vy: number; vx: number; r: number; alpha: number; pulse: number };
    let embers: Ember[] = [];

    const resize = () => {
      W = cv.width = cv.offsetWidth;
      H = cv.height = cv.offsetHeight;
      embers = Array.from({ length: 42 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vy: -(Math.random() * 0.45 + 0.15),
        vx: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.8 + 0.6,
        alpha: Math.random() * 0.4 + 0.1,
        pulse: Math.random() * Math.PI * 2,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      embers.forEach(e => {
        e.y += e.vy;
        e.x += e.vx;
        e.pulse += 0.02;

        if (e.y < -10) {
          e.y = H + 10;
          e.x = Math.random() * W;
        }
        if (e.x < 0) e.x = W;
        if (e.x > W) e.x = 0;

        const currentAlpha = e.alpha * (0.6 + 0.4 * Math.sin(e.pulse));
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 200, 66, ${currentAlpha})`;
        ctx.shadowColor = Y;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      raf = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  );
}

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
          background: `linear-gradient(90deg, ${Y} 0%, #ffde6b 100%)`,
          width: `${progress * 100}%`,
          boxShadow: `0 0 10px ${Y}`,
          transition: 'width 0.08s linear',
        }}
      />
    </div>
  );
}

// ── Ambient Mouse Spotlight ────────────────────────────────────────────────
function AmbientSpotlight() {
  const [pos, setPos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setPos({
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
      });
    };
    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        background: `radial-gradient(650px circle at ${pos.x}% ${pos.y}%, rgba(245, 200, 66, 0.04) 0%, transparent 70%)`,
      }}
    />
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
}: {
  children: ReactNode;
  delay?: number;
  dir?: 'up' | 'left' | 'right' | 'none';
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const init =
    dir === 'up' ? { opacity: 0, y: 35 } : dir === 'left' ? { opacity: 0, x: -35 } : dir === 'right' ? { opacity: 0, x: 35 } : { opacity: 0 };

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

// ── Stat Card Component ───────────────────────────────────────────────────
function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <motion.div
      whileHover={{ y: -4, borderColor: 'rgba(245, 200, 66, 0.4)' }}
      style={{
        background: 'rgba(16, 13, 10, 0.85)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: '16px 22px',
        textAlign: 'left',
        transition: 'border-color 0.25s, transform 0.25s',
      }}
    >
      <div style={{ fontFamily: PP, fontSize: 26, fontWeight: 900, color: Y, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: PP, fontSize: 11, fontWeight: 700, color: CR, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 6 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: CR_MUTED, marginTop: 2, fontWeight: 300 }}>{sub}</div>}
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
        background: `linear-gradient(90deg, ${Y} 0%, #fbd559 100%)`,
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
              color: '#130d04',
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
const NAV_LINKS = [
  { label: 'Home', path: '/products' },
  { label: 'About', path: '/aboutthecrunch' },
  { label: 'Menu', path: '/usersmenu' },
];

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
  const { user, logout } = useAuth();
  const isAuth = !!user;

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!isTablet) setMenuOpen(false);
  }, [isTablet]);

  const heroTargetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroTargetRef, offset: ['start start', 'end start'] });
  const textTranslateY = useTransform(scrollYProgress, [0, 1], ['0%', '15%']);
  const imageTranslateY = useTransform(scrollYProgress, [0, 1], ['0%', '12%']);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, 1.06]);

  const goMenu = () => navigate('/usersmenu?showOrderModal=true');
  const goProducts = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    navigate('/products');
  };

  const handleNav = (p: string) => {
    setMenuOpen(false);
    if (p === '/usersmenu') goMenu();
    else if (p === '/products') goProducts();
    else navigate(p);
  };

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    goProducts();
  };

  return (
    <MotionConfig reducedMotion="user">
      <div style={{ fontFamily: PP, background: BG, color: CR, overflowX: 'hidden', minHeight: '100vh', position: 'relative' }}>
        <EmberCanvas />
        <ScrollProgressBar />
        <AmbientSpotlight />

        {/* ── Fixed Navigation Bar ────────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            height: 68,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMobile ? '0 20px' : '0 40px',
            background: scrolled || menuOpen ? 'rgba(8, 7, 6, 0.92)' : 'transparent',
            backdropFilter: scrolled || menuOpen ? 'blur(20px)' : 'none',
            borderBottom: scrolled ? `1px solid ${BORDER}` : '1px solid transparent',
            transition: 'background 0.3s ease, border-color 0.3s ease',
          }}
        >
          {/* Brand */}
          <button
            onClick={goProducts}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <img src="/img/logo24.png" alt="The Crunch" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'contain' }} />
            <span style={{ fontFamily: PP, fontSize: 17, fontWeight: 900, color: CR, letterSpacing: '-0.02em' }}>
              The <span style={{ color: Y }}>Crunch</span>
            </span>
          </button>

          {/* Desktop Nav Links */}
          {!isTablet && (
            <nav style={{ display: 'flex', gap: 6, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
              {NAV_LINKS.map(({ label, path }) => {
                const isActive = path === '/aboutthecrunch';
                return (
                  <button
                    key={label}
                    onClick={() => handleNav(path)}
                    style={{
                      background: isActive ? 'rgba(245, 200, 66, 0.1)' : 'transparent',
                      border: isActive ? '1px solid rgba(245, 200, 66, 0.25)' : '1px solid transparent',
                      cursor: 'pointer',
                      fontFamily: PP,
                      fontSize: 13.5,
                      fontWeight: 600,
                      padding: '7px 16px',
                      borderRadius: 999,
                      color: isActive ? Y : 'rgba(245, 242, 235, 0.65)',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) e.currentTarget.style.color = CR;
                    }}
                    onMouseLeave={e => {
                      if (!isActive) e.currentTarget.style.color = 'rgba(245, 242, 235, 0.65)';
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Right Action / Auth */}
          {!isTablet ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isAuth ? (
                <button
                  onClick={handleLogout}
                  style={{
                    background: Y,
                    border: 'none',
                    borderRadius: 10,
                    padding: '9px 20px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#130d04',
                    cursor: 'pointer',
                    fontFamily: PP,
                    transition: 'transform 0.2s ease',
                  }}
                >
                  Log Out
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/login')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 10,
                      padding: '9px 18px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: CR,
                      cursor: 'pointer',
                      fontFamily: PP,
                      transition: 'background 0.2s',
                    }}
                  >
                    Log In
                  </button>
                  <button
                    onClick={() => navigate('/login?tab=signup')}
                    style={{
                      background: Y,
                      border: 'none',
                      borderRadius: 10,
                      padding: '9px 20px',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#130d04',
                      cursor: 'pointer',
                      fontFamily: PP,
                      boxShadow: '0 4px 14px rgba(245, 200, 66, 0.25)',
                    }}
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          ) : (
            /* Animated Clean Hamburger */
            <button
              onClick={() => setMenuOpen(v => !v)}
              aria-label="Toggle navigation menu"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <motion.span
                animate={menuOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                style={{ width: 22, height: 2, background: Y, borderRadius: 2 }}
              />
              <motion.span
                animate={menuOpen ? { opacity: 0 } : { opacity: 1 }}
                style={{ width: 16, height: 2, background: Y, borderRadius: 2 }}
              />
              <motion.span
                animate={menuOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                style={{ width: 22, height: 2, background: Y, borderRadius: 2 }}
              />
            </button>
          )}
        </motion.header>

        {/* ── Tablet & Mobile Navigation Drawer ───────────────────────────── */}
        <AnimatePresence>
          {menuOpen && isTablet && (
            <motion.div
              initial={{ opacity: 0, y: -15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.22 }}
              style={{
                position: 'fixed',
                top: 68,
                left: 0,
                right: 0,
                zIndex: 990,
                background: 'rgba(10, 8, 6, 0.98)',
                backdropFilter: 'blur(24px)',
                borderBottom: `1px solid ${BORDER}`,
                padding: '24px 28px 32px',
                display: 'grid',
                gap: 12,
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              }}
            >
              {NAV_LINKS.map(({ label, path }) => (
                <button
                  key={label}
                  onClick={() => handleNav(path)}
                  style={{
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: PP,
                    fontSize: 20,
                    fontWeight: 700,
                    color: path === '/aboutthecrunch' ? Y : CR,
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  {label}
                </button>
              ))}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                {isAuth ? (
                  <button
                    onClick={handleLogout}
                    style={{
                      flex: 1,
                      background: Y,
                      border: 'none',
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#130d04',
                      cursor: 'pointer',
                      fontFamily: PP,
                    }}
                  >
                    Log Out
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/login'); }}
                      style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.06)',
                        border: `1px solid ${BORDER}`,
                        borderRadius: 12,
                        padding: 14,
                        fontSize: 14,
                        fontWeight: 600,
                        color: CR,
                        cursor: 'pointer',
                        fontFamily: PP,
                      }}
                    >
                      Log In
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/login?tab=signup'); }}
                      style={{
                        flex: 1,
                        background: Y,
                        border: 'none',
                        borderRadius: 12,
                        padding: 14,
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#130d04',
                        cursor: 'pointer',
                        fontFamily: PP,
                      }}
                    >
                      Sign Up
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Hero Section ────────────────────────────────────────────────── */}
        <section
          ref={heroTargetRef}
          style={{
            minHeight: '100vh',
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: isTablet ? '1fr' : '1.15fr 0.85fr',
            alignItems: 'center',
            paddingTop: isMobile ? 84 : 70,
            zIndex: 1,
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
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
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
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: Y }} />
              <span style={{ fontFamily: PP, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: Y }}>
                Est. 2021 · Fairview, Quezon City
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontFamily: PP,
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: '-0.035em',
                fontSize: isMobile ? 'clamp(46px, 12vw, 68px)' : 'clamp(52px, 5.5vw, 84px)',
                color: CR,
                margin: '0 0 24px',
              }}
            >
              The <span style={{ color: Y, fontStyle: 'italic' }}>Crunch</span>
              <br />
              Fairview.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.7 }}
              style={{
                fontFamily: PP,
                fontSize: isMobile ? 14 : 15.5,
                color: CR_MUTED,
                lineHeight: 1.8,
                maxWidth: 460,
                fontWeight: 300,
                marginBottom: 36,
              }}
            >
              Home of authentic Filipino boneless fried chicken. Crafted daily with our secret spice rubs, hand-spun in signature glazes, and serving over 250+ communities nationwide.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.6 }}
              style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}
            >
              <button
                onClick={goMenu}
                style={{
                  background: `linear-gradient(135deg, ${Y} 0%, ${Y_DARK} 100%)`,
                  border: 'none',
                  borderRadius: 12,
                  padding: isMobile ? '13px 28px' : '15px 36px',
                  fontSize: 13.5,
                  fontWeight: 800,
                  color: '#120d04',
                  cursor: 'pointer',
                  fontFamily: PP,
                  boxShadow: '0 6px 20px rgba(245, 200, 66, 0.3)',
                }}
              >
                Order Online
              </button>
              <button
                onClick={() => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' })}
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: isMobile ? '13px 24px' : '15px 30px',
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: CR,
                  cursor: 'pointer',
                  fontFamily: PP,
                }}
              >
                Our Heritage
              </button>
            </motion.div>
          </motion.div>

          {/* Right Hero Image + Badges */}
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              minHeight: isMobile ? 380 : isTablet ? 460 : '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <motion.div
              style={{ position: 'absolute', inset: 0, y: imageTranslateY, scale: imageScale }}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <img
                src={IMG_HERO}
                alt="Golden Boneless Fried Chicken"
                style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 40%, #080706 95%)' }} />
            </motion.div>

            {/* Stat Badges Floating */}
            <div
              style={{
                position: 'absolute',
                bottom: isMobile ? 20 : 44,
                left: isMobile ? 20 : 36,
                right: isMobile ? 20 : 'auto',
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, auto)',
                gap: 10,
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
            background: CARD_BG,
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
            {/* Story Image */}
            <Reveal dir={isTablet ? 'up' : 'left'}>
              <div style={{ position: 'relative' }}>
                <div style={{ borderRadius: 24, overflow: 'hidden', height: isMobile ? 280 : isTablet ? 380 : 460, border: `1px solid ${BORDER}` }}>
                  <img
                    src={IMG_STORY}
                    alt="The Crunch Boneless Chicken"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                  />
                </div>
                {/* Floating Heritage Tag */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: -16,
                    right: 24,
                    background: Y,
                    borderRadius: 16,
                    padding: '14px 22px',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
                  }}
                >
                  <div style={{ fontFamily: PP, fontSize: 32, fontWeight: 900, color: '#130d04', lineHeight: 1 }}>7</div>
                  <div style={{ fontFamily: PP, fontSize: 9, fontWeight: 800, color: 'rgba(19, 13, 4, 0.65)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 4 }}>
                    House Glazes
                  </div>
                </div>
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
        <section style={{ background: '#090706', padding: isMobile ? '70px 0' : '100px 0', position: 'relative', zIndex: 1 }}>
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
                  <button
                    onClick={goMenu}
                    style={{
                      background: Y,
                      border: 'none',
                      borderRadius: 12,
                      padding: '15px 38px',
                      fontSize: 14,
                      fontWeight: 800,
                      color: '#130d04',
                      cursor: 'pointer',
                      fontFamily: PP,
                      boxShadow: '0 6px 24px rgba(245, 200, 66, 0.25)',
                    }}
                  >
                    Explore Our Menu
                  </button>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Pillars / What Sets Us Apart ─────────────────────────────────── */}
        <section style={{ background: CARD_BG, padding: isMobile ? '70px 0' : '100px 0', position: 'relative', zIndex: 1, borderTop: `1px solid ${BORDER}` }}>
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

            {/* Grid Pillars */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 20 }}>
              {PILLARS.map((p, idx) => (
                <Reveal key={p.no} delay={idx * 0.06}>
                  <motion.div
                    whileHover={{ y: -5, borderColor: 'rgba(245, 200, 66, 0.35)', background: '#171410' }}
                    style={{
                      background: 'rgba(18, 15, 12, 0.95)',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 18,
                      padding: '28px 24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      height: '100%',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    <span style={{ fontFamily: PP, fontSize: 13, fontWeight: 800, color: Y, letterSpacing: '0.08em' }}>{p.no}</span>
                    <h3 style={{ fontFamily: PP, fontSize: 17, fontWeight: 800, color: CR, margin: 0 }}>{p.title}</h3>
                    <p style={{ fontFamily: PP, fontSize: 13, color: CR_MUTED, lineHeight: 1.75, fontWeight: 300, margin: 0 }}>{p.desc}</p>
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
          }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            <img
              src={IMG_HERO}
              alt="Crispy Fried Chicken"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
                filter: 'brightness(0.25) saturate(1.2)',
                display: 'block',
              }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 20%, #080706 90%)' }} />
          </div>

          <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: isMobile ? '0 24px' : '0 40px', maxWidth: 760 }}>
            <Reveal>
              <span style={{ fontFamily: PP, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: Y, display: 'block', marginBottom: 16 }}>
                Fairview Flagship Store
              </span>
              <h2
                style={{
                  fontFamily: PP,
                  fontWeight: 900,
                  color: CR,
                  lineHeight: 0.95,
                  letterSpacing: '-0.035em',
                  fontSize: isMobile ? 'clamp(36px, 10vw, 54px)' : 'clamp(44px, 6vw, 84px)',
                  margin: '0 0 20px',
                }}
              >
                Craving <span style={{ color: Y, fontStyle: 'italic' }}>The Crunch?</span>
              </h2>
              <p style={{ fontFamily: PP, fontSize: isMobile ? 14 : 16, color: CR_MUTED, maxWidth: 460, margin: '0 auto 36px', lineHeight: 1.7, fontWeight: 300 }}>
                Drop by our Fairview branch or place an order online. Savor golden boneless fried chicken coated in your favorite house glaze today.
              </p>

              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={goMenu}
                  style={{
                    background: Y,
                    border: 'none',
                    borderRadius: 12,
                    padding: isMobile ? '13px 32px' : '15px 40px',
                    fontSize: 14,
                    fontWeight: 800,
                    color: '#130d04',
                    cursor: 'pointer',
                    fontFamily: PP,
                    boxShadow: '0 6px 20px rgba(245, 200, 66, 0.35)',
                  }}
                >
                  Order Now
                </button>
                <button
                  onClick={goProducts}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 12,
                    padding: isMobile ? '13px 28px' : '15px 36px',
                    fontSize: 14,
                    fontWeight: 600,
                    color: CR,
                    cursor: 'pointer',
                    fontFamily: PP,
                  }}
                >
                  Explore Storefront
                </button>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer style={{ background: '#060504', borderTop: `1px solid ${BORDER}`, padding: isMobile ? '50px 24px 32px' : '64px 48px 36px', position: 'relative', zIndex: 1 }}>
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
                  Quick Navigation
                </span>
                {NAV_LINKS.map(({ label, path }) => (
                  <button
                    key={label}
                    onClick={() => handleNav(path)}
                    style={{
                      display: 'block',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: PP,
                      fontSize: 13.5,
                      fontWeight: 400,
                      color: CR_MUTED,
                      padding: '5px 0',
                      textAlign: 'left',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = Y; }}
                    onMouseLeave={e => { e.currentTarget.style.color = CR_MUTED; }}
                  >
                    {label}
                  </button>
                ))}
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