import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { MapPin, Star, X, MessageSquare, Send, CheckCircle, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { fetchGeneralSettings } from '@/lib/restaurantSettings'
import { useAuth } from '@/context/authcontext'
import MetallicButton from '@/components/ui/metallic-button'
import { Navbar } from '@/components/Navbar'
import { TiltedGridHero } from '@/components/ui/tilted-grid-hero'

const MAX_FB = 200
const HERO_REEL_IMAGES = [
  { src: '/img/signatureglazed1.webp' },
  { src: '/img/chickentexasbbq.webp' },
  { src: '/img/chicken1.webp' },
  { src: '/img/chickenteriyaki.webp' },
  { src: '/img/chickengarlicparmesan.webp' },
  { src: '/img/signatureglazed2.webp' },
] as const
const easeOut = [0.22, 1, 0.36, 1] as const

// All page styles and font declarations are installed only while this page is mounted.
const CSS = `
@font-face {
  font-family: 'Crunch Display';
  src: url('/fonts/ClashDisplay_Complete/Fonts/WEB/fonts/ClashDisplay-Variable.woff2') format('woff2');
  font-style: normal;
  font-weight: 200 700;
  font-display: swap;
}

.crunch-page {
  --crunch-base: #140f0c;
  --crunch-border: #654336;
  --crunch-text: #fff4e6;
  --crunch-muted: #d1beb0;
  --crunch-accent: #e8a63c;
  --crunch-accent-hover: #f3bd62;
  --crunch-accent-pressed: #ca8324;
  --crunch-on-accent: #24170d;
  --crunch-success: #94d3a0;
  --crunch-error: #f4a099;
  --crunch-glass: rgba(53, 35, 28, 0.82);
  --crunch-space-1: 0.5rem;
  --crunch-space-2: 1rem;
  --crunch-space-3: 1.5rem;
  --crunch-space-4: 2rem;
  --crunch-space-6: 4rem;
  --crunch-space-7: 6rem;
  --crunch-radius-sm: 0.65rem;
  --crunch-radius-pill: 999px;
  --crunch-shadow-card: 0 26px 80px rgba(0, 0, 0, 0.3);
  --crunch-shadow-glow: 0 12px 35px rgba(232, 166, 60, 0.17);
  --crunch-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --crunch-duration-fast: 160ms;
  --crunch-duration-base: 320ms;
  --crunch-duration-slow: 650ms;
  --crunch-type-sm: clamp(0.8rem, 0.95vw, 0.9rem);
  --crunch-type-body: clamp(0.98rem, 1.15vw, 1.12rem);
  --crunch-type-display: clamp(2.55rem, 6.65vw, 7rem);
  --crunch-page-pad: clamp(1.25rem, 4.2vw, 4.5rem);
  --crunch-page-width: 100rem;
  --crunch-font-display: 'Crunch Display', 'Arial Narrow', sans-serif;
  --crunch-font-body: 'Instrument Sans', system-ui, sans-serif;

  /* Compatibility values for the existing story, footer, and feedback until Stage 3. */
  --bg: var(--crunch-base);
  --gold: var(--crunch-accent);
  --gold-dark: var(--crunch-accent-pressed);
  --gold-gradient: linear-gradient(115deg, var(--crunch-accent-hover), var(--crunch-accent));
  --text: var(--crunch-text);
  --muted: var(--crunch-muted);
  --container-max: var(--crunch-page-width);
  --container-pad: var(--crunch-page-pad);
  --section-py: clamp(4rem, 8vw, 8rem);
  position: relative;
  isolation: isolate;
  min-height: 100dvh;
  width: 100%;
  overflow-x: clip;
  background: var(--crunch-base);
  color: var(--crunch-text);
  font-family: var(--crunch-font-body);
}

.crunch-page :where(h1, p, figure) { margin: 0; }
.crunch-page .crunch-main :focus-visible,
.crunch-page footer :focus-visible,
.crunch-page .crunch-feedback:focus-visible,
.crunch-page [role="dialog"] :focus-visible {
  outline: 2px solid var(--crunch-accent-hover);
  outline-offset: 4px;
}
.crunch-page .crunch-main { position: relative; z-index: 1; }
.crunch-page .crunch-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--crunch-space-1);
  min-width: 44px;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: var(--crunch-radius-sm);
  font-family: var(--crunch-font-body);
  font-weight: 700;
  line-height: 1.1;
  text-decoration: none;
  cursor: pointer;
  transition: transform var(--crunch-duration-fast) var(--crunch-ease),
    background var(--crunch-duration-fast) var(--crunch-ease),
    border-color var(--crunch-duration-fast) var(--crunch-ease),
    box-shadow var(--crunch-duration-base) var(--crunch-ease);
}
.crunch-page .crunch-button--sm { padding: 0.65rem var(--crunch-space-2); font-size: var(--crunch-type-sm); }
.crunch-page .crunch-button--md { min-height: 52px; padding: 0.8rem var(--crunch-space-3); font-size: var(--crunch-type-sm); }
.crunch-page .crunch-button--lg { min-height: 56px; padding: 0.9rem var(--crunch-space-4); font-size: var(--crunch-type-body); }
.crunch-page .crunch-button--primary { background: var(--crunch-accent); color: var(--crunch-on-accent); box-shadow: var(--crunch-shadow-glow); }
.crunch-page .crunch-button--glass { background: var(--crunch-glass); color: var(--crunch-text); border-color: var(--crunch-border); }
.crunch-page .crunch-button:active:not(:disabled) { transform: translateY(1px) scale(0.98); }
.crunch-page .crunch-button:disabled { cursor: not-allowed; opacity: 0.62; box-shadow: none; }
.crunch-page .crunch-button__content { display: inline-flex; align-items: center; justify-content: center; gap: var(--crunch-space-1); }
.crunch-page .crunch-button__icon { display: inline-flex; align-items: center; justify-content: center; flex: none; }
.crunch-page .crunch-button__icon svg { width: 1.1rem; height: 1.1rem; stroke-width: 1.8; }
@media (hover: hover) and (pointer: fine) {
  .crunch-page .crunch-button--primary:hover:not(:disabled) { background: var(--crunch-accent-hover); transform: translateY(-2px); }
  .crunch-page .crunch-button--glass:hover:not(:disabled) { border-color: var(--crunch-accent); transform: translateY(-2px); }
}

/* The curved photo row has its own space between the headline and menu action. */
.crunch-page .crunch-hero {
  position: relative; width: 100%; overflow: hidden;
  padding: calc(72px + clamp(.65rem, 1.35vw, 1.5rem)) 0 calc(var(--burn-headroom) + clamp(16px, 1.8vw, 30px));
}
.crunch-page .crunch-hero__copy {
  position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center;
  width: 100%; min-width: 0; text-align: center;
}
.crunch-hero__atmosphere { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.crunch-hero__smoke {
  --cycle: 15s; --first: -4s; --second: -11.5s;
  position: absolute; bottom: -3%; left: 2%; width: clamp(95px, 22%, 345px); height: 73%;
}
.crunch-hero__smoke--right {
  --cycle: 19s; --first: -13s; --second: -3.5s;
  left: auto; right: 1%; height: 66%; transform: scaleX(-1);
}
.crunch-hero__smoke::before, .crunch-hero__smoke::after {
  content: ''; position: absolute; inset: 0;
  background: url('/img/hero-smoke.svg') center / 100% 100% no-repeat;
  transform-origin: 36% 95%; opacity: 0;
  animation: crunch-smoke-rise var(--cycle) ease-in-out var(--first) infinite;
}
.crunch-hero__smoke::after {
  inset: 12% -5% 0 19%; scale: -1 1; animation-delay: var(--second);
}
.crunch-hero__ember {
  position: absolute; left: var(--origin); bottom: 1%; width: 2px; height: 4px; border-radius: 60%;
  background: #ffc581; box-shadow: 0 0 5px #c16b35; opacity: 0;
  animation: crunch-ember-rise var(--duration) linear var(--delay) infinite;
}
@keyframes crunch-smoke-rise {
  0% { transform: translate(0, 9%) scale(.74, .79); opacity: 0; }
  28% { opacity: .31; }
  52% { transform: translate(3%, -3%) skewX(-3deg) scale(.98, .98); opacity: .25; }
  100% { transform: translate(8%, -20%) skewX(3deg) scale(1.25, 1.09); opacity: 0; }
}
@keyframes crunch-ember-rise {
  0%, 76%, 100% { opacity: 0; }
  8% { opacity: .85; }
  43% { opacity: .45; transform: translate(calc(var(--drift) * -.3), -12svh) rotate(18deg) scale(.85); }
  76%, 100% { transform: translate(var(--drift), -26svh) rotate(-16deg) scale(.4); }
}
@media (prefers-reduced-motion: reduce) {
  .crunch-hero__smoke::before { animation: none; opacity: .24; }
  .crunch-hero__smoke::after { display: none; }
  .crunch-hero__ember { display: none; }
}
.crunch-page .crunch-hero__eyebrow {
  display: flex; align-items: center; justify-content: center; gap: clamp(0.7rem, 1.8vw, 1.7rem); width: 100%;
  color: #f5c45c; font-family: var(--crunch-font-display); font-size: clamp(.85rem, 1.45vw, 1.5rem);
  font-weight: 700; letter-spacing: 0.22em; line-height: 1.2;
}
.crunch-page .crunch-hero__eyebrow::before, .crunch-page .crunch-hero__eyebrow::after {
  content: ''; width: clamp(1.25rem, 4.5vw, 4.5rem); height: 1px; flex: none; background: #e8b84e;
}
.crunch-page .crunch-hero__title {
  display: flex; justify-content: center; flex-wrap: wrap; column-gap: .22em; max-width: calc(100% - 2rem);
  margin: clamp(.45rem, .85vw, .85rem) 0 0; font-family: var(--crunch-font-display);
  font-size: clamp(2.6rem, 5.7vw, 5.65rem); font-weight: 700; letter-spacing: -0.012em; line-height: 1; text-transform: uppercase;
}
.crunch-page .crunch-hero__title span { display: block; }
.crunch-page .crunch-hero__title span:first-child { color: #f7c65a; font-style: italic; transform: skewX(-7deg); text-shadow: 0 3px 0 #7b4615, 0 9px 24px rgba(232, 166, 60, 0.18); }
.crunch-page .crunch-hero__title span:last-child { color: #fff0cf; text-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); }
.crunch-page .crunch-hero__description { max-width: 36rem; color: #e8d9c4; font-size: clamp(0.82rem, 1.08vw, 0.98rem); line-height: 1.55; }
.crunch-page .crunch-hero__reel {
  width: 100%; height: clamp(160px, min(29vw, 37svh), 356px);
  margin-block: clamp(6px, 1.1vw, 18px) clamp(10px, 1.05vw, 18px);
}
.crunch-page .crunch-hero__actions {
  --metallic-face-top: #30221a;
  --metallic-face-base: var(--crunch-base);
  --metallic-label: var(--crunch-text);
}
.crunch-page .crunch-hero__actions { display: flex; justify-content: center; width: 100%; padding-inline: 1rem; }
.crunch-page .crunch-hero__promises { display: flex; justify-content: center; flex-wrap: wrap; gap: 0.65rem; margin-top: clamp(.75rem, 1.2vw, 1.25rem); padding-inline: .75rem; }
.crunch-page .crunch-hero__promise {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 38px; padding: 0.45rem 0.9rem;
  border: 1px solid #97732e; border-radius: var(--crunch-radius-pill); background: #17100a; color: #fff0d4;
  font-size: clamp(0.7rem, 0.95vw, 0.82rem); font-weight: 600; line-height: 1.25;
}
.crunch-page .crunch-hero__promise svg { width: 1.05rem; height: 1.05rem; flex: none; color: #f3c259; stroke-width: 2; }
.crunch-page .crunch-hero__description,
.crunch-page .crunch-hero__details {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); clip-path: inset(50%); white-space: nowrap; border: 0;
}
/* The burn line is the light source for both sides of the divider. */
.crunch-page .crunch-main {
  --burn-height: clamp(156px, 17.2vw, 266px);
  --burn-headroom: calc(var(--burn-height) * .70);
  --burn-below: calc(var(--burn-height) - var(--burn-headroom));
  overflow-x: clip;
}
.crunch-page .crunch-fire-edge {
  position: relative; z-index: 0; height: 0; pointer-events: none;
}
.crunch-page .crunch-fire-edge::before {
  content: ''; position: absolute; inset-inline: 0; bottom: 0;
  height: clamp(180px, calc(var(--burn-height) * 1.85), 370px);
  background:
    radial-gradient(ellipse 32% 100% at 32% 100%, rgb(166 79 34 / 8%), transparent),
    radial-gradient(ellipse 38% 92% at 76% 100%, rgb(166 79 34 / 8%), transparent),
    linear-gradient(to top, rgb(166 79 34 / 7%), transparent 78%);
}
.crunch-page .crunch-fire-edge::after {
  content: ''; position: absolute; inset-inline: 0; top: 0;
  height: min(80px, calc(var(--burn-below) + 28px));
  background: linear-gradient(to bottom, rgb(166 79 34 / 9%), transparent);
}
.crunch-page .crunch-burn__field {
  position: absolute; inset-inline: 0; top: calc(0px - var(--burn-headroom));
  z-index: 1; height: var(--burn-height); overflow: hidden; contain: strict;
}
.crunch-page .crunch-burn__still, .crunch-page .crunch-burn__canvas {
  position: absolute; inset: 0; display: block; width: 100%; height: 100%; pointer-events: none;
}
.crunch-page .crunch-burn__still {
  background: url('/img/hero-fire-still.webp') center / max(100%, calc(var(--burn-height) * 8)) 100% no-repeat;
}
.crunch-page .crunch-burn__canvas { visibility: hidden; }
.crunch-page .crunch-burn__field[data-fire-mode="live"] .crunch-burn__canvas { visibility: visible; }
.crunch-page .crunch-burn__field[data-fire-mode="live"] .crunch-burn__still { visibility: hidden; }

@media (min-width: 901px) {
  .crunch-page .crunch-main { --burn-height: clamp(112px, min(17.2vw, 22svh), 266px); }
  /* Reserve the lower part of the fire in the first screen. The photo row takes the remaining space. */
  .crunch-page .crunch-hero {
    display: flex; flex-direction: column;
    height: min(calc(100svh - var(--burn-below)), 56rem);
    min-height: min-content;
    padding-block: calc(72px + clamp(8px, 1.5svh, 24px)) calc(var(--burn-headroom) + 8px);
  }
  .crunch-page .crunch-hero__copy { flex: 1; }
  .crunch-page .crunch-hero__reel {
    flex: 1; min-height: 7rem; max-height: 356px;
    margin-block: clamp(6px, 1svh, 16px);
  }
  .crunch-page .crunch-hero__promises { margin-top: clamp(8px, 1.5svh, 20px); }
}

.crunch-page .crunch-feedback {
  position: fixed;
  right: max(1rem, env(safe-area-inset-right));
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: 90;
  border-radius: var(--crunch-radius-pill);
  box-shadow: var(--crunch-shadow-card);
}
.crunch-page .btn-secondary {
  min-height: 44px;
  padding: 0.65rem var(--crunch-space-3);
  border: 1px solid var(--crunch-border);
  border-radius: var(--crunch-radius-sm);
  background: var(--crunch-glass);
  color: var(--crunch-text);
  cursor: pointer;
}
@media (max-width: 900px) {
  .crunch-page .crunch-hero__title { font-size: clamp(2.45rem, 6.1vw, 3.45rem); }
}
@media (max-width: 520px) {
  .crunch-page .crunch-hero { padding-top: calc(72px + 1.3rem); }
  .crunch-page .crunch-hero__eyebrow { gap: 0.4rem; font-size: 0.8rem; letter-spacing: 0.14em; }
  .crunch-page .crunch-hero__eyebrow::before, .crunch-page .crunch-hero__eyebrow::after { width: clamp(0.5rem, 4vw, 1rem); }
  .crunch-page .crunch-hero__title { display: block; font-size: clamp(2.3rem, 10.4vw, 3.25rem); }
  .crunch-page .crunch-hero__reel { height: clamp(155px, 46vw, 214px); margin-block: 8px 13px; }
  .crunch-page .crunch-hero__description { font-size: 0.8rem; }
  .crunch-page .crunch-hero__promise { font-size: 0.68rem; }
}
@media (prefers-reduced-motion: reduce) {
  .crunch-page .crunch-button { transition: none; }
}
`

// A shared button vocabulary for page-owned controls.
interface CrunchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'glass'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}
function CrunchButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: CrunchButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={'crunch-button crunch-button--' + variant + ' crunch-button--' + size + ' ' + className}
    >
      <span className="crunch-button__content">{loading ? 'Loading…' : children}</span>
    </button>
  )
}

function HeroSection() {
  const reduceMotion = useReducedMotion()
  return (
    <section className="crunch-hero" data-crunch-section="hero" aria-labelledby="crunch-hero-title">
      <div className="crunch-hero__atmosphere" aria-hidden="true">
        <span className="crunch-hero__smoke" />
        <span className="crunch-hero__smoke crunch-hero__smoke--right" />
        {[[6, 7, -3, 14], [17, 9, -7, -19], [29, 8, -2, 24], [68, 10, -6, -18], [82, 7, -5, 21], [94, 11, -9, -14]].map(([origin, duration, delay, drift]) => (
          <i key={origin} className="crunch-hero__ember" style={{
            '--origin': origin + '%', '--duration': duration + 's', '--delay': delay + 's', '--drift': drift + 'px',
          } as CSSProperties} />
        ))}
      </div>
      <div className="crunch-hero__copy">
        <motion.div className="crunch-hero__eyebrow" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: easeOut }}>THE CRUNCH</motion.div>
        <motion.h1 id="crunch-hero-title" className="crunch-hero__title" initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: reduceMotion ? 0 : 0.08, ease: easeOut }}>
          <span>SIGNATURE</span>{' '}<span>CHICKEN</span>
        </motion.h1>
        <motion.p className="crunch-hero__description" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: reduceMotion ? 0 : 0.16, ease: easeOut }}>
          Hand-crafted daily with our secret spice rubs. Choose from 7 signature glazes - each bite delivers the perfect crunch.
        </motion.p>
        <TiltedGridHero
          className="crunch-hero__reel"
          images={HERO_REEL_IMAGES}
          tileHeight={45}
          axis={46.5}
          gap={7}
        />
        <motion.div className="crunch-hero__actions" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: reduceMotion ? 0 : 0.24, ease: easeOut }}>
          <MetallicButton
            label="Explore Menu"
            baseColor="#231911"
            sheenColor="#e2b388"
            redFringe={0.12}
            blueFringe={0.02}
            onClick={() => { window.location.href = '/usersmenu?showOrderModal=true' }}
          />
        </motion.div>
        <motion.div className="crunch-hero__promises" aria-label="The Crunch highlights" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: reduceMotion ? 0 : 0.32, ease: easeOut }}>
          {['7 Signature Glazes', 'Fresh Daily, Never Frozen'].map(promise => <div className="crunch-hero__promise" key={promise}><CheckCircle aria-hidden="true" /><span>{promise}</span></div>)}
        </motion.div>
        <p className="crunch-hero__details"><span>Signature chicken</span><span>Hand-glazed</span><span>07 signature glazes</span><span>250+ Branches Nationwide</span><span>Fresh daily • Fairview</span></p>
      </div>
    </section>
  )
}

const FIRE_VERTEX = `
attribute vec2 a_position;
varying mediump vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FIRE_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying mediump vec2 v_uv;
uniform sampler2D u_noise;
uniform vec2 u_size;
uniform float u_time;

// A repeating noise texture gives the ash a fixed grain and the gas a continuous flow.
float noiseAt(vec2 p) {
  vec2 f = fract(p);
  return texture2D(u_noise, (floor(p) + f * f * (3.0 - 2.0 * f) + 0.5) / 128.0).r;
}

float turbulence(vec2 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int i = 0; i < 4; ++i) {
    sum += weight * noiseAt(p);
    p = mat2(1.89, 0.72, -0.72, 1.89) * p + vec2(11.7, 3.4);
    weight *= 0.5;
  }
  return sum;
}

vec3 flameColor(float h) {
  vec3 c = mix(vec3(.34,.055,.012), vec3(.86,.215,.024), smoothstep(.02,.40,h));
  c = mix(c, vec3(1.0,.49,.082), smoothstep(.32,.66,h));
  c = mix(c, vec3(1.0,.73,.29), smoothstep(.56,.85,h));
  return mix(c, vec3(1.0,.91,.65), smoothstep(.78,1.0,h));
}

vec4 over(vec4 base, vec3 color, float coverage) {
  return base * (1.0 - coverage) + vec4(color, 1.0) * coverage;
}

// Turbulence moves up through each sheet. The roots stay on the fuel while the tips shear apart.
vec3 flameSheet(float x, float rise, float t, float fuel, float seed) {
  float eddy = noiseAt(vec2(2.5*x + seed, 4.8*rise - .92*t + seed));
  float roll = noiseAt(vec2(6.4*x + 2.2*eddy + seed, 7.1*rise - 1.48*t));
  float bend = rise / (1.0 + 2.15*rise);
  float u = x + .13*rise + bend*(1.45*(eddy-.5) + .60*(roll-.5));
  float jet = noiseAt(vec2(8.2*u + seed, .51*t + seed + .18*roll));
  float flow = turbulence(vec2(13.5*u + 1.4*roll + seed, 6.1*rise - 2.35*t + seed));
  float reach = .018 + (.14 + .50*fuel) * (.10 + .90*jet*jet);
  float density = .94 - rise/reach + 1.82*(flow-.47);
  float filament = noiseAt(vec2(37.0*u + 2.1*roll, 12.0*rise - 3.1*t + seed));
  float fold = 1.0 - smoothstep(.012,.13,abs(flow + .09*(filament-.5) - .49));
  float heat = clamp(.045 + .51*density + .77*(flow-.37) + .18*fold + .085*fuel, 0.0, 1.0);
  float coverage = smoothstep(-.12,.34,density) * (1.0 - .78*smoothstep(.21,.56,rise));
  // Gas drifting away from its source cools into a translucent wisp.
  float rootJet = noiseAt(vec2(8.2*mix(x,u,.44) + seed, .51*t + seed));
  float rootReach = .046 + (.18+.52*fuel)*(.10+.90*rootJet*rootJet);
  coverage *= 1.0 - .82*smoothstep(rootReach,rootReach+.14,rise);
  return vec3(coverage, heat, flow);
}

float sparkAt(float x, float y, float t) {
  float cell = x * 6.0;
  float id = floor(cell);
  vec4 seed = texture2D(u_noise, (vec2(id, 42.0) + .5) / 128.0);
  float life = t*(.34 + .26*seed.g) + seed.r;
  vec4 launch = texture2D(u_noise, (vec2(id, mod(floor(life),128.0)) + .5) / 128.0);
  float age = fract(life);
  float dx = fract(cell) - (.5 + .38*(launch.g-.5) + .16*sin(age*5.0 + 6.28*seed.b));
  float dy = y - age*(.18 + .37*launch.r);
  float radius = max(.65/u_size.y, .0022 + .0013*seed.a);
  vec2 d = vec2(dx/6.0, dy*.66) / radius;
  return exp2(-1.8*dot(d,d)) * smoothstep(.52,.82,launch.a)
       * smoothstep(.02,.13,age) * (1.0-smoothstep(.40,.90,age));
}

void main() {
  float x = (v_uv.x-.5) * u_size.x/u_size.y + 24.8;
  float t = u_time;
  float ridge = .30 + .042*(noiseAt(vec2(3.1*x,5.5))-.5)
                    + .023*(noiseAt(vec2(14.7*x,9.1))-.5)
                    + .010*(noiseAt(vec2(62.0*x,2.5))-.5);
  float y = v_uv.y - ridge;
  float fuel = smoothstep(.23,.81, .74*noiseAt(vec2(2.1*x,18.6)) + .26*noiseAt(vec2(6.8*x,12.1)));
  float pulse = noiseAt(vec2(3.8*x, .82*t));
  float spill = exp2(-abs(y)*12.0) * (.048 + .12*fuel) * (.78 + .22*pulse);
  vec4 color = vec4(vec3(.96,.34,.075)*spill, spill);

  if (y < .014) {
    float depth = max(0.0,-y);
    vec2 p = vec2(x*31.0, v_uv.y*46.0);
    float grain = noiseAt(p*3.3);
    float crust = noiseAt(p + 1.65*noiseAt(p*.41));
    float crack = 1.0-smoothstep(.016,.12,abs(crust-.46));
    float coal = (.20+.80*fuel) * (.55+.45*pulse);
    float fissure = crack * exp2(-depth*27.0) * coal * (.38+.82*grain);
    float clinker = smoothstep(.52,.84,crust) * smoothstep(.37,.70,grain) * exp2(-depth*52.0) * coal;
    vec3 ash = mix(vec3(.047,.035,.030),vec3(.18,.119,.083),crust*grain);
    ash += vec3(.92,.24,.037)*fissure + vec3(.59,.10,.017)*clinker;
    float bed = (1.0-smoothstep(-.006,.007,y)) * (1.0-smoothstep(.022,.26,depth));
    color = over(color, ash, .93*bed);
    float rim = exp2(-abs(y + (grain-.5)*.008)*158.0);
    color = over(color, mix(vec3(.74,.17,.025),vec3(1.0,.59,.15),grain), rim*coal*(.30+.67*crust));
  }

  if (y > -.010 && y < .68) {
    float rise = max(y,0.0);
    float foot = smoothstep(-.010,.010,y);
    vec3 back = flameSheet(x+.38, rise*.89, t*.81, fuel, 38.6);
    vec3 front = flameSheet(x, rise, t, fuel, 10.3);
    float wisp = smoothstep(.43,.70,back.z) * smoothstep(.04,.16,rise)
               * (1.0-smoothstep(.19,.62,rise)) * (.034+.072*fuel);
    color = over(color, vec3(.34,.27,.21), wisp);
    color = over(color, flameColor(back.y*.78), back.x*foot*(.26+.39*back.y));
    color = over(color, flameColor(front.y), front.x*foot*(.55+.44*front.y));
    color = over(color, vec3(1.0,.66,.23), sparkAt(x,y,t)*.83);
  }
  float fade = smoothstep(.0,.095,v_uv.y) * (1.0-smoothstep(.87,.995,v_uv.y));
  gl_FragColor = color * fade;
}
`

function createFireRenderer(gl: WebGLRenderingContext) {
  const program = gl.createProgram()
  const triangle = gl.createBuffer()
  const noise = gl.createTexture()
  const shaders: WebGLShader[] = []
  const dispose = () => {
    gl.deleteProgram(program)
    gl.deleteBuffer(triangle)
    gl.deleteTexture(noise)
  }

  try {
    if (!program || !triangle || !noise) throw new Error('Fire surface unavailable')
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Fire shader unavailable')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Fire shader failed')
      gl.attachShader(program, shader)
    }
    compile(gl.VERTEX_SHADER, FIRE_VERTEX)
    compile(gl.FRAGMENT_SHADER, FIRE_FRAGMENT)
    gl.bindAttribLocation(program, 0, 'a_position')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Fire program failed')
    gl.useProgram(program)

    gl.bindBuffer(gl.ARRAY_BUFFER, triangle)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const lattice = new Uint8Array(128 * 128 * 4)
    let seed = 0x79e27b59
    for (let i = 0; i < lattice.length; i++) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
      lattice[i] = seed >>> 24
    }
    gl.bindTexture(gl.TEXTURE_2D, noise)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 128, 0, gl.RGBA, gl.UNSIGNED_BYTE, lattice)
    gl.uniform1i(gl.getUniformLocation(program, 'u_noise'), 0)
    const time = gl.getUniformLocation(program, 'u_time')
    const size = gl.getUniformLocation(program, 'u_size')
    return {
      dispose,
      resize(width: number, height: number) {
        gl.viewport(0, 0, width, height)
        gl.uniform2f(size, width, height)
      },
      draw(seconds: number) {
        gl.uniform1f(time, seconds)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      },
    }
  } catch (error) {
    dispose()
    throw error
  } finally {
    for (const shader of shaders) gl.deleteShader(shader)
  }
}

const FIRE_START_TIME = 3.2

function HeroFire() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const field = canvas?.parentElement
    if (!canvas || !field) return

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let gl: WebGLRenderingContext | null = null
    let renderer: ReturnType<typeof createFireRenderer> | null = null
    let visible = typeof IntersectionObserver === 'undefined'
    let unavailable = false
    let frame: number | null = null
    let previous: number | null = null
    let nextPaint = 0
    let seconds = FIRE_START_TIME

    const pause = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      previous = null
    }
    const animate = (now: number) => {
      if (previous !== null) seconds += Math.min((now - previous) / 1000, .1)
      previous = now
      if (now >= nextPaint) {
        renderer?.draw(seconds)
        nextPaint = Math.max(nextPaint + 1000 / 30, now + 1)
      }
      frame = requestAnimationFrame(animate)
    }

    const sync = () => {
      pause()
      if (motion.matches) {
        field.dataset.fireMode = 'still'
        return
      }
      if (!visible || document.hidden || unavailable) return
      const { width, height } = field.getBoundingClientRect()
      if (!width || !height) return
      try {
        gl ??= canvas.getContext('webgl', {
          alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power',
        })
        if (!gl) {
          unavailable = true
          return
        }
        if (gl.isContextLost()) return
        renderer ??= createFireRenderer(gl)
        // Limit fill rate on wide displays and high-DPR phones.
        const scale = Math.min(window.devicePixelRatio || 1, 1.35, 1600 / width, Math.sqrt(225000 / (width * height)))
        const w = Math.max(1, Math.round(width * scale))
        const h = Math.max(1, Math.round(height * scale))
        if (canvas.width !== w) canvas.width = w
        if (canvas.height !== h) canvas.height = h
        renderer.resize(w, h)
        renderer.draw(seconds)
        field.dataset.fireMode = 'live'
        nextPaint = performance.now() + 1000 / 30
        frame = requestAnimationFrame(animate)
      } catch {
        renderer?.dispose()
        renderer = null
        unavailable = true
        field.dataset.fireMode = 'still'
      }
    }

    const lose = (event: Event) => {
      event.preventDefault()
      pause()
      renderer = null
      field.dataset.fireMode = 'still'
    }
    const restore = () => {
      unavailable = false
      sync()
    }
    const view = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      sync()
    })
    const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync)
    view?.observe(field)
    size?.observe(field)
    if (!size) window.addEventListener('resize', sync)
    document.addEventListener('visibilitychange', sync)
    motion.addEventListener('change', sync)
    canvas.addEventListener('webglcontextlost', lose)
    canvas.addEventListener('webglcontextrestored', restore)
    sync()

    return () => {
      pause()
      view?.disconnect()
      size?.disconnect()
      if (!size) window.removeEventListener('resize', sync)
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
      canvas.removeEventListener('webglcontextlost', lose)
      canvas.removeEventListener('webglcontextrestored', restore)
      renderer?.dispose()
      field.dataset.fireMode = 'still'
    }
  }, [])

  return (
    <div className="crunch-fire-edge" aria-hidden="true">
      <div className="crunch-burn__field" data-fire-mode="still">
        <div className="crunch-burn__still" />
        <canvas className="crunch-burn__canvas" ref={canvasRef} />
      </div>
    </div>
  )
}

function OurStory() {
  return (
    <motion.section
      data-crunch-section="story"
      style={{
        padding: 'calc(var(--burn-below) + clamp(28px, 4vw, 52px)) var(--container-pad) var(--section-py)',
        background: 'transparent',
        position: 'relative',
        zIndex: 1,
      }}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: easeOut }}
    >
      <div className="crunch-story-content" style={{ maxWidth: 'var(--container-max)', margin: '0 auto', textAlign: 'center' }}>
        <motion.span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 24px',
            fontSize: 'clamp(11px, 1.4vw, 13px)',
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--gold)',
            background: 'rgba(245,185,68,0.08)',
            border: '1px solid rgba(245,185,68,0.4)',
            borderRadius: '9999px',
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: 'clamp(20px, 3vw, 32px)',
          }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: easeOut }}
        >
          OUR STORY
        </motion.span>

        <motion.h2
          style={{
            fontSize: 'clamp(38px, 6vw, 64px)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            marginBottom: 'clamp(20px, 3vw, 32px)',
            fontFamily: 'Poppins, Inter, sans-serif',
            background: 'var(--gold-gradient)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            textShadow: '0 0 40px rgba(245,185,68,0.2)',
          }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7, ease: easeOut }}
        >
          Where Flavor Meets Craft
        </motion.h2>

        <motion.p
          style={{
            fontSize: 'clamp(16px, 2vw, 20px)',
            lineHeight: 1.7,
            maxWidth: '46ch',
            margin: '0 auto',
            color: 'var(--muted)',
            fontWeight: 400,
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7, ease: easeOut }}
        >
          Every piece of chicken begins with a 24-hour brine, hand-dredged in our signature spice blend, and fried to a golden crunch. Then comes the glaze — seven recipes developed over years, each brushed on by hand so the flavor clings to every ridge. No shortcuts. No central kitchen shortcuts. Just honest work, fresh daily, across 250+ branches.
        </motion.p>
      </div>
    </motion.section>
  )
}

// ── Footer ─────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer data-crunch-section="footer" style={{ background: 'transparent', borderTop: '1px solid rgba(245,185,68,0.15)', padding: '48px 0 32px', marginTop: 60, position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: '0 var(--container-pad)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 28 }}>
          <div style={{ flex: '1 1 280px', minWidth: 240 }}>
            <p style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)' }}>The <span style={{ color: 'var(--gold)' }}>Crunch</span></p>
            <p style={{ marginTop: 6, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6 }}>6 Falcon St., cor Dahlia Fairview,<br />Quezon City, Philippines</p>
            <a href="https://www.google.com/maps/place/The+Crunch+-+Fairview+Branch/@14.7002687,121.0662915,21z" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 13.5, fontWeight: 600, color: 'var(--gold)', textDecoration: 'none', transition: 'opacity 200ms' }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>
              <MapPin size={14} />View on Google Maps
            </a>
          </div>
          <div style={{ flex: '1 1 180px', minWidth: 160, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Follow us</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <a href="https://www.instagram.com/thecrunchfairview" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--gold)', transition: 'opacity 200ms', fontSize: 14 }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>Instagram</a>
              <a href="https://www.facebook.com/thecrunchfairview" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--gold)', transition: 'opacity 200ms', fontSize: 14 }} onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'} onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}>Facebook</a>
            </div>
          </div>
          <div style={{ flex: '1 1 200px', minWidth: 180, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={13} />Hours</p>
            <p style={{ marginTop: 6, fontSize: 13.5, textAlign: 'right', color: 'var(--text)', lineHeight: 1.6 }}>Mon–Fri: 10 AM – 10 PM<br />Sat–Sun: 11 AM – 8:30 PM</p>
          </div>
        </div>
        <p style={{ marginTop: 36, paddingTop: 18, borderTop: '1px solid rgba(245,185,68,0.15)', fontSize: 12, textAlign: 'center', color: 'var(--muted)' }}>© {new Date().getFullYear()} The Crunch Fairview. All rights reserved.</p>
      </div>
    </footer>
  )
}

// ── Feedback Modal (unchanged logic) ───────────────────────────────────────
interface FeedbackOption {
  id: number
  name: string
}

type FeedbackProducts =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; options: FeedbackOption[] }

async function fetchFeedbackOptions(): Promise<FeedbackOption[]> {
  const rows = await api.get<unknown>('/api/products?item_type=menu_item')
  if (!Array.isArray(rows)) throw new Error('Invalid product list')

  return rows.flatMap((row: unknown) => {
    if (!row || typeof row !== 'object') return []
    const product = row as Record<string, unknown>
    const availability = String(product.availability_status ?? product.availabilityStatus ?? '').trim().toLowerCase()
    if (availability === 'hidden') return []

    const id = Number(product.id ?? product.product_id)
    const name = String(product.name ?? product.product_name ?? '').trim()
    return Number.isInteger(id) && id > 0 && name ? [{ id, name }] : []
  })
}

function FeedbackModal({ onClose, products, userId }: { onClose: () => void; products: FeedbackProducts; userId: number | null }) {
  const options = products.status === 'ready' ? products.options : []
  const emptyLabel = products.status === 'ready' ? 'No products available'
    : products.status === 'error' ? 'Products unavailable' : 'Loading products...'
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [message, setMessage] = useState('')
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const productId = selectedProductId ?? options[0]?.id ?? null
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [err, setErr] = useState('')
  const text = message.trim()
  const can = productId !== null && rating > 0 && text.length > 0 && text.length <= MAX_FB

  const submit = async () => {
    if (!can) return
    setStatus('sending'); setErr('')
    try {
      await api.post('/feedback', { product_id: productId, customer_user_id: userId, rating, comment: text })
      setStatus('done')
    } catch (error: unknown) {
      const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : ''
      setErr(message || 'Could not send your feedback. Try again.')
      setStatus('error')
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 900, pointerEvents: 'auto' }} />
      <motion.div role="dialog" aria-label="Send feedback" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
        style={{ position: 'fixed', zIndex: 901, right: 16, bottom: 80, width: 'min(400px,calc(100vw - 32px))', maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', background: 'var(--bg)', border: '1px solid rgba(245,185,68,0.15)', borderRadius: 16, padding: 22, pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, pointerEvents: 'auto' }}>
          <div style={{ pointerEvents: 'auto' }}><p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Send feedback</p><p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Tell us how we did.</p></div>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close" style={{ background: 'none', border: 0, color: 'var(--muted)', cursor: 'pointer', height: 28, pointerEvents: 'auto' }}><X size={18} /></button>
        </div>
        {status === 'done' ? (
          <div style={{ textAlign: 'center', padding: '20px 0', display: 'grid', gap: 10, justifyItems: 'center' }}>
            <CheckCircle size={38} color="#22c55e" />
            <p style={{ fontWeight: 700, color: 'var(--text)' }}>Feedback sent</p>
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <p style={{ fontSize: 12, marginBottom: 6, color: 'var(--muted)' }}>Rating</p>
              <div style={{ display: 'flex', gap: 4 }} onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} style={{ background: 'none', border: 0, cursor: 'pointer', lineHeight: 0 }}>
                    <Star size={26} color={n <= (hover || rating) ? 'var(--gold)' : 'rgba(255,255,255,.25)'} fill={n <= (hover || rating) ? 'var(--gold)' : 'none'} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, marginBottom: 6, color: 'var(--muted)' }}>Product</p>
              <select style={{ width: '100%', font: 'inherit', fontSize: 14, color: 'var(--text)', background: 'rgba(245,185,68,0.05)', border: '1px solid rgba(245,185,68,0.15)', borderRadius: 12, padding: '14px 18px', outline: 'none' }} value={productId ?? ''} onChange={e => setSelectedProductId(Number(e.target.value))} disabled={!options.length || status === 'sending'}>
                {options.length === 0 ? <option value="">{emptyLabel}</option> : options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <p style={{ fontSize: 12, marginBottom: 6, color: 'var(--muted)' }}>Comment</p>
              <textarea style={{ width: '100%', font: 'inherit', fontSize: 14, color: 'var(--text)', background: 'rgba(245,185,68,0.05)', border: '1px solid rgba(245,185,68,0.15)', borderRadius: 12, padding: '14px 18px', outline: 'none', resize: 'none', minHeight: 100 }} rows={4} maxLength={MAX_FB} value={message} onChange={e => setMessage(e.target.value)} placeholder="What did you like or dislike?" />
              <p style={{ fontSize: 11, textAlign: 'right', marginTop: 2, color: 'var(--muted)' }}>{message.length}/{MAX_FB}</p>
            </div>
            {status === 'error' && <p role="alert" style={{ fontSize: 12.5, color: '#f87171' }}>{err}</p>}
            <motion.button style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12, opacity: can ? 1 : .45, cursor: can ? 'pointer' : 'not-allowed', background: 'var(--gold-gradient)', color: '#1A1208', border: 'none', borderRadius: 12, fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(245,185,66,0.3)' }} onClick={submit} disabled={!can || status === 'sending'} whileTap={{ scale: 0.98 }}>
              <Send size={14} />{status === 'sending' ? 'Sending…' : 'Send feedback'}
            </motion.button>
          </div>
        )}
      </motion.div>
    </>
  )
}

// ── Page Component ─────────────────────────────────────────────────────────

interface ProductsProps { isAuthenticated?: boolean }

export default function Products({ isAuthenticated = false }: ProductsProps) {
  const { user } = useAuth()
  const [feedbackProducts, setFeedbackProducts] = useState<FeedbackProducts>({ status: 'idle' })
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const userId = isAuthenticated && user && Number(user.userId) > 0 ? Number(user.userId) : null

  useEffect(() => { void fetchGeneralSettings() }, [])

  async function toggleFeedback() {
    setFeedbackOpen(!feedbackOpen)
    if (feedbackOpen || feedbackProducts.status === 'ready' || feedbackProducts.status === 'loading') return

    setFeedbackProducts({ status: 'loading' })
    try {
      const options = await fetchFeedbackOptions()
      setFeedbackProducts({ status: 'ready', options })
    } catch {
      setFeedbackProducts({ status: 'error' })
    }
  }

  return (
    <div className="crunch-page">
      <style data-crunch-page="true">{CSS}</style>
      <Navbar />
      <main className="crunch-main">
        <HeroSection />
        <HeroFire />
        <OurStory />
      </main>
      <Footer />
      <AnimatePresence>{feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} products={feedbackProducts} userId={userId} />}</AnimatePresence>
      <CrunchButton variant="glass" size="sm" className="crunch-feedback" onClick={toggleFeedback}>
        <span className="crunch-button__icon"><MessageSquare aria-hidden="true" /></span>{feedbackOpen ? 'Close' : 'Feedback'}
      </CrunchButton>
    </div>
  )
}
