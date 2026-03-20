import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, type Variants } from 'framer-motion';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.65, ease: [0.22, 1, 0.36, 1] },
  }),
};

const fadeLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

const fadeRight: Variants = {
  hidden: { opacity: 0, x: 40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

function AnimatedSection({
  children,
  variants = fadeUp,
  custom = 0,
  className = '',
}: {
  children: React.ReactNode
  variants?: Variants
  custom?: number
  className?: string
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      variants={variants}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      custom={custom}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const perks = [
  { title: 'Fresh Daily', desc: 'Ingredients sourced and prepped every single morning.' },
  { title: 'Fast Service', desc: 'Hot and crispy, served to you in minutes.' },
  { title: 'Made with Love', desc: "Every order crafted like it's for family." },
  { title: 'Bold Flavors', desc: '7 signature sauces to satisfy any craving.' },
  { title: 'Community First', desc: 'Built for the neighborhood, by the neighborhood.' },
  { title: 'Branches', desc: 'We have 250+ branches nationwide' },
];

export default function AboutTheCrunch() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", background: '#fafaf8', minHeight: '100vh', color: '#111' }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap"
        rel="stylesheet"
      />
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          zIndex: 500,
          padding: '0 7vw',
          height: 68,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: scrolled ? 'rgba(255,255,255,0.95)' : 'transparent',
          backdropFilter: scrolled ? 'blur(14px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(0,0,0,0.07)' : 'none',
          transition: 'background 0.4s ease, border-bottom 0.4s ease',
        }}
      >
        <div
          onClick={() => navigate('/aboutthecrunch')}
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 22, fontWeight: 900,
            color: scrolled ? '#111' : '#fff',
            cursor: 'pointer',
            letterSpacing: '-0.3px',
            transition: 'color 0.4s',
          }}
        >
          The <span style={{ color: '#f5c842' }}>Crunch</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {/* Home */}
          <motion.button
            whileHover={{ y: -1 }}
            onClick={() => navigate('/')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: "'Poppins', sans-serif", fontSize: 13, fontWeight: 500,
              color: scrolled ? '#555' : 'rgba(255,255,255,0.8)',
              transition: 'color 0.3s', padding: 0,
            }}
          >
            Home
          </motion.button>

          {/* Menu */}
          <motion.button
            whileHover={{ y: -1 }}
            onClick={() => navigate('/usersmenu')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: "'Poppins', sans-serif", fontSize: 13, fontWeight: 500,
              color: scrolled ? '#555' : 'rgba(255,255,255,0.8)',
              transition: 'color 0.3s', padding: 0,
            }}
          >
            Menu
          </motion.button>

          {/* About */}
          <motion.button
            whileHover={{ y: -1 }}
            onClick={() => navigate('/aboutthecrunch')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: "'Poppins', sans-serif", fontSize: 13, fontWeight: 500,
              color: scrolled ? '#111' : '#fff',
              transition: 'color 0.3s', padding: 0,
            }}
          >
            About
          </motion.button>
        </div>
      </motion.nav>

      <section style={{ position: 'relative', height: '100vh', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
        <motion.div
          initial={{ scale: 1.12, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <img
            src="https://shorturl.at/01YLe"
            alt="Crispy fried chicken"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.1) 100%)' }} />
        </motion.div>

        <div style={{ position: 'relative', zIndex: 10, padding: '0 7vw 72px', maxWidth: 900 }}>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 18 }}
          >
            Since 2021 · Quezon City
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(52px, 8vw, 100px)', fontWeight: 900, color: '#fff', lineHeight: 1.0, margin: '0 0 28px' }}
          >
            The Crunch<br />
            <span style={{ fontStyle: 'italic', color: '#f5c842' }}>Fairview.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.7 }}
            style={{ fontSize: 'clamp(15px, 1.8vw, 19px)', color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, maxWidth: 560, fontWeight: 300 }}
          >
            One of the leading Boneless Fried Chicken Brands in the Philippines. Serving Deliciousness at 200+ Branches Nationwide.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
          style={{ position: 'absolute', bottom: 32, right: '7vw', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
            style={{ width: 1, height: 48, background: 'linear-gradient(to bottom, rgba(255,255,255,0.5), transparent)' }}
          />
        </motion.div>
      </section>

      <section style={{ padding: '100px 7vw', maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 2fr', gap: 80, alignItems: 'center' }}>
        <AnimatedSection variants={fadeLeft}>
          <div style={{ position: 'relative' }}>
            <div style={{ borderRadius: 32, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.14)', background: '#fef9ee' }}>
              <img
                src="https://shorturl.at/v3t6W"
                alt="The Crunch XL"
                style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }}
              />
            </div>
            <motion.div
              animate={{ y: [-4, 4, -4] }}
              transition={{ repeat: Infinity, duration: 3.5, ease: 'easeInOut' }}
              style={{
                position: 'absolute', bottom: -24, right: -24,
                background: '#f5c842', borderRadius: 24, padding: '20px 28px',
                boxShadow: '0 12px 40px rgba(245,200,66,0.35)', textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 38, fontWeight: 900, color: '#111', lineHeight: 1 }}>7</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 4 }}>Flavors</div>
            </motion.div>
          </div>
        </AnimatedSection>

        <AnimatedSection variants={fadeRight}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 16 }}>What We Are</p>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(34px, 4vw, 52px)', fontWeight: 700, lineHeight: 1.15, marginBottom: 24, color: '#111' }}>
            Our Vision
          </h2>
          <p style={{ fontSize: 16, color: '#555', lineHeight: 1.85, marginBottom: 20, fontWeight: 300 }}>
            Through a shared commitment to excellence we are dedicated to the uncompromising quality of our food and service while taking exceptional care of our guests and staff.
          </p>
          <p style={{ fontSize: 16, color: '#555', lineHeight: 1.85, fontWeight: 300 }}>
            We will continuously strive to surpass our own accomplishments and be recognized as one of the most progressive and sustainable businesses in the country with more than 250 branches by 2024.
          </p>
        </AnimatedSection>
      </section>

      <section style={{ background: '#111', padding: '100px 7vw', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -120, right: -120, width: 500, height: 500, borderRadius: '50%', background: 'rgba(245,200,66,0.06)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <AnimatedSection>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 16 }}>Our Mission</p>
          </AnimatedSection>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
            <AnimatedSection variants={fadeLeft}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(36px, 4.5vw, 58px)', fontWeight: 700, color: '#fff', lineHeight: 1.15 }}>
                Flavor for <em style={{ color: '#f5c842' }}>Everyone,</em><br />Every Day.
              </h2>
            </AnimatedSection>
            <AnimatedSection variants={fadeRight}>
              <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.6)', lineHeight: 1.85, fontWeight: 300 }}>
                To serve more people with a unique style of high quality boneless fried chicken, and to help Filipinos start a profitable and easy to manage business.
              </p>
              <div style={{ marginTop: 32, height: 2, width: 80, background: '#f5c842', borderRadius: 2 }} />
            </AnimatedSection>
          </div>
        </div>
      </section>

      <section style={{ padding: '100px 7vw', maxWidth: 1280, margin: '0 auto' }}>
        <AnimatedSection>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 16 }}>Why The Crunch</p>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(32px, 4vw, 50px)', fontWeight: 700, color: '#111' }}>
              What Sets Us Apart
            </h2>
          </div>
        </AnimatedSection>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
          {perks.map((perk, i) => (
            <AnimatedSection key={perk.title} custom={i} variants={fadeUp}>
              <motion.div
                whileHover={{ y: -6, boxShadow: '0 24px 60px rgba(0,0,0,0.1)' }}
                style={{
                  background: '#fff', borderRadius: 24, padding: '40px 36px',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.06)', transition: 'box-shadow 0.3s', height: '100%',
                }}
              >
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111', marginBottom: 10 }}>{perk.title}</h3>
                <p style={{ fontSize: 14, color: '#777', lineHeight: 1.7, fontWeight: 300 }}>{perk.desc}</p>
              </motion.div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      <section style={{ margin: '0 7vw 100px', borderRadius: 36, overflow: 'hidden', position: 'relative', minHeight: 380, display: 'flex', alignItems: 'center' }}>
        <img
          src="https://shorturl.at/mWMOx"
          alt="Chicken feast"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.15) 100%)' }} />

        <div style={{ position: 'relative', zIndex: 10, padding: '52px 64px', maxWidth: 560 }}>
          <AnimatedSection>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#f5c842', marginBottom: 14 }}>
              Now Serving
            </p>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(32px, 4vw, 52px)',
              fontWeight: 700, color: '#fff', lineHeight: 1.15, marginBottom: 16
            }}>
              Ready to taste<br />
              <em style={{ color: '#f5c842' }}>The Crunch?</em>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', marginBottom: 36, fontWeight: 300, lineHeight: 1.75, maxWidth: 400 }}>
              Visit us today and experience the crispiest chicken in town. Dine in, takeout, or order for your whole crew.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <motion.button
                whileHover={{ scale: 1.04, backgroundColor: '#e6b800' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/usersmenu')}
                style={{
                  background: '#f5c842', color: '#111', border: 'none', borderRadius: 14,
                  padding: '14px 36px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'Poppins', sans-serif", letterSpacing: '0.04em', transition: 'background 0.2s',
                }}
              >
                Order Now
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/')}
                style={{
                  background: 'rgba(255,255,255,0.12)', color: '#fff',
                  border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 14,
                  padding: '14px 36px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Poppins', sans-serif", letterSpacing: '0.04em',
                  backdropFilter: 'blur(8px)', transition: 'all 0.2s',
                }}
              >
                Learn More
              </motion.button>
            </div>
          </AnimatedSection>
        </div>
      </section>

      <div style={{ textAlign: 'center', padding: '0 0 60px', color: '#bbb', fontSize: 12, letterSpacing: '0.1em' }}>
        © {new Date().getFullYear()} The Crunch Fairview Dahlia Quezon City · All rights reserved
      </div>
    </div>
  );
}