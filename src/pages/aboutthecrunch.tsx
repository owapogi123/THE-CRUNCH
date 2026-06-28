import { useRef, useState, useEffect, CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView, useScroll, useTransform } from 'framer-motion';
import { useAuth } from '../context/authcontext';

if (typeof document !== 'undefined' && !document.getElementById('crunch-fonts')) {
  const l = document.createElement('link');
  l.id = 'crunch-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,900;1,700;1,900&display=swap';
  document.head.appendChild(l);
}

const PP = "'Poppins',sans-serif";
const Y  = '#f5c842';
const CR = '#ede9e2';
const IMG_HERO  = '/img/crunch22.png';
const IMG_STORY = '/img/chickchicken.png';

// ── Particle Canvas ────────────────────────────────────────────────────────
function ParticleCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d')!;
    let W=0, H=0, raf=0;
    type P = { x:number; y:number; vx:number; vy:number; r:number };
    let pts: P[] = [];
    const resize = () => {
      W = cv.width = cv.offsetWidth; H = cv.height = cv.offsetHeight;
      pts = Array.from({length:55}, () => ({
        x:Math.random()*W, y:Math.random()*H,
        vx:(Math.random()-.5)*.35, vy:(Math.random()-.5)*.35,
        r:Math.random()*1.5+.5,
      }));
    };
    const draw = () => {
      ctx.clearRect(0,0,W,H);
      pts.forEach(p => {
        p.x+=p.vx; p.y+=p.vy;
        if(p.x<0||p.x>W) p.vx*=-1;
        if(p.y<0||p.y>H) p.vy*=-1;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(245,200,66,.28)'; ctx.fill();
      });
      pts.forEach((a,i) => pts.slice(i+1).forEach(b => {
        const d = Math.hypot(a.x-b.x, a.y-b.y);
        if (d<130) {
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
          ctx.strokeStyle=`rgba(245,200,66,${.08*(1-d/130)})`; ctx.lineWidth=.5; ctx.stroke();
        }
      }));
      raf = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(resize); ro.observe(cv); resize(); draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0}} />;
}

// ── Scroll Progress ────────────────────────────────────────────────────────
function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const fn = () => { const e=document.documentElement; setP(e.scrollTop/(e.scrollHeight-e.clientHeight)); };
    window.addEventListener('scroll', fn, {passive:true});
    return () => window.removeEventListener('scroll', fn);
  }, []);
  return (
    <div style={{position:'fixed',top:0,left:0,right:0,height:2,zIndex:1000,background:'rgba(255,255,255,.06)'}}>
      <div style={{height:'100%',background:Y,width:`${p*100}%`,transition:'width .05s'}} />
    </div>
  );
}

// ── Dynamic Light ──────────────────────────────────────────────────────────
function DynLight() {
  const [pos, setPos] = useState({x:50,y:50});
  useEffect(() => {
    const m = (e:MouseEvent) => setPos({x:(e.clientX/window.innerWidth)*100, y:(e.clientY/window.innerHeight)*100});
    window.addEventListener('mousemove', m);
    return () => window.removeEventListener('mousemove', m);
  }, []);
  return <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,background:`radial-gradient(500px circle at ${pos.x}% ${pos.y}%,rgba(245,200,66,.028) 0%,transparent 65%)`}} />;
}

// ── Hooks ──────────────────────────────────────────────────────────────────
function useBreakpoint() {
  const [w, setW] = useState(typeof window!=='undefined'?window.innerWidth:1200);
  useEffect(()=>{ const fn=()=>setW(window.innerWidth); window.addEventListener('resize',fn); return()=>window.removeEventListener('resize',fn); },[]);
  return { isMobile:w<640, isTablet:w<1024 };
}

// ── Helpers ────────────────────────────────────────────────────────────────
const lbl = (x:CSSProperties={}):CSSProperties => ({fontFamily:PP,fontSize:10,fontWeight:700,letterSpacing:'.28em',textTransform:'uppercase',color:Y,...x});
const body = (x:CSSProperties={}):CSSProperties => ({fontFamily:PP,fontSize:14,color:'rgba(237,233,226,.45)',lineHeight:1.95,fontWeight:300,...x});

function Reveal({children,delay=0,dir='up',style={}}:{children:ReactNode;delay?:number;dir?:'up'|'left'|'right'|'none';style?:CSSProperties}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, {once:true,margin:'-50px'});
  const init = dir==='up'?{opacity:0,y:40}:dir==='left'?{opacity:0,x:-40}:dir==='right'?{opacity:0,x:40}:{opacity:0};
  return (
    <motion.div ref={ref} initial={init} animate={inView?{opacity:1,y:0,x:0}:init}
      transition={{delay,duration:.7,ease:[.16,1,.3,1]}} style={style}>
      {children}
    </motion.div>
  );
}

function Marquee() {
  const items = ['Fresh Daily','7 Bold Flavors','250+ Branches','Since 2021 — Quezon City, PH','Made with Love','Fast Service'];
  const rep = [...items,...items,...items];
  return (
    <div style={{overflow:'hidden',height:48,background:Y,display:'flex',alignItems:'center',flexShrink:0,position:'relative',zIndex:2}}>
      <motion.div animate={{x:[0,'-33.33%']}} transition={{repeat:Infinity,duration:28,ease:'linear'}} style={{display:'flex',whiteSpace:'nowrap'}}>
        {rep.map((t,i)=>(
          <span key={i} style={{fontFamily:PP,fontSize:11,fontWeight:700,letterSpacing:'.2em',textTransform:'uppercase',color:'#1a0a00',padding:'0 28px',display:'inline-flex',alignItems:'center',gap:28}}>
            <span style={{width:4,height:4,borderRadius:'50%',background:'rgba(26,10,0,.3)',flexShrink:0}} />{t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function BtnY({onClick,children,style={}}:{onClick:()=>void;children:ReactNode;style?:CSSProperties}) {
  return (
    <motion.button whileHover={{scale:1.03,y:-2,boxShadow:'0 8px 30px rgba(245,200,66,.35)'}} whileTap={{scale:.97}}
      onClick={onClick} style={{background:Y,border:'none',borderRadius:10,padding:'13px 32px',fontSize:13,fontWeight:700,color:'#1a0a00',cursor:'pointer',fontFamily:PP,...style}}>
      {children}
    </motion.button>
  );
}

function BtnGhost({onClick,children,style={}}:{onClick:()=>void;children:ReactNode;style?:CSSProperties}) {
  return (
    <motion.button whileHover={{scale:1.03,y:-2}} whileTap={{scale:.97}} onClick={onClick}
      style={{background:'transparent',border:'1px solid rgba(237,233,226,.15)',borderRadius:10,padding:'13px 32px',fontSize:13,fontWeight:500,color:'rgba(237,233,226,.6)',cursor:'pointer',fontFamily:PP,...style}}>
      {children}
    </motion.button>
  );
}

function StatBadge({value,label,style={}}:{value:string;label:string;style?:CSSProperties}) {
  return (
    <motion.div whileHover={{scale:1.06,rotateY:8,rotateX:-4}} style={{background:'rgba(10,8,6,.8)',backdropFilter:'blur(16px)',border:'1px solid rgba(245,200,66,.18)',borderRadius:12,padding:'12px 18px',textAlign:'center',transformStyle:'preserve-3d',...style}}>
      <div style={{fontFamily:PP,fontSize:20,fontWeight:800,color:Y,lineHeight:1}}>{value}</div>
      <div style={{fontFamily:PP,fontSize:9,fontWeight:600,color:'rgba(237,233,226,.35)',letterSpacing:'.12em',textTransform:'uppercase',marginTop:5}}>{label}</div>
    </motion.div>
  );
}

// ── Nav ────────────────────────────────────────────────────────────────────
const NAV = [{l:'Home',p:'/'},{l:'About',p:'/aboutthecrunch'},{l:'Menu',p:'/usersmenu'}];
const PERKS = [
  {num:'01',title:'Fresh Daily',     desc:'Ingredients sourced and prepped every morning — no shortcuts, ever.'},
  {num:'02',title:'Fast Service',    desc:'Hot and crispy, from our fryer to your hands in minutes.'},
  {num:'03',title:'Made with Love',  desc:"Every order is crafted like it's going to family."},
  {num:'04',title:'Bold Flavors',    desc:'7 signature sauces crafted to satisfy any mood or craving.'},
  {num:'05',title:'Community First', desc:'Built for the neighborhood, grown by the neighborhood.'},
  {num:'06',title:'250+ Branches',   desc:'From Luzon to Mindanao — The Crunch is everywhere you are.'},
];

// ── Main ───────────────────────────────────────────────────────────────────
export default function AboutTheCrunch() {
  const navigate = useNavigate();
  const { isMobile, isTablet } = useBreakpoint();
  const { user, logout } = useAuth();
  const isAuth = !!user;

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY>20);
    window.addEventListener('scroll', fn, {passive:true});
    return () => window.removeEventListener('scroll', fn);
  }, []);
  useEffect(() => { if (!isTablet) setMenuOpen(false); }, [isTablet]);

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({target:heroRef,offset:['start start','end start']});
  const txtY  = useTransform(scrollYProgress,[0,1],['0%','12%']);
  const imgY  = useTransform(scrollYProgress,[0,1],['0%','18%']);
  const imgScale = useTransform(scrollYProgress,[0,1],[1,1.08]);

  const goMenu = () => navigate('/usersmenu?showOrderModal=true');
  const goNav  = (p:string) => p==='/usersmenu'?goMenu():navigate(p);
  const handleLogout = () => { logout(); setMenuOpen(false); navigate('/products'); };

  const navBg = scrolled||menuOpen ? 'rgba(10,8,6,.96)' : 'transparent';
  const navBd = scrolled||menuOpen ? 'blur(20px)' : 'none';

  return (
    <div style={{fontFamily:PP,background:'#0a0806',color:CR,overflowX:'hidden',minHeight:'100vh'}}>
      <ParticleCanvas />
      <ScrollProgress />
      <DynLight />

      {/* NAV */}
      <motion.header initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}} transition={{duration:.6}}
        style={{position:'fixed',top:0,left:0,right:0,zIndex:900,height:64,display:'flex',alignItems:'center',
          justifyContent:'space-between',padding:isMobile?'0 20px':'0 40px',
          background:navBg,backdropFilter:navBd,
          borderBottom:scrolled?'1px solid rgba(245,200,66,.1)':'none',transition:'all .35s ease'}}>
        <button onClick={()=>navigate('/products')} style={{background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:10}}>
          <img src="/img/logo24.png" alt="The Crunch" style={{width:32,height:32,borderRadius:8,objectFit:'contain'}} />
          {!isMobile && <span style={{fontFamily:PP,fontSize:15,fontWeight:800,color:CR,letterSpacing:'-.02em'}}>The <span style={{color:Y}}>Crunch</span></span>}
        </button>

        {!isTablet && (
          <nav style={{display:'flex',gap:4,position:'absolute',left:'50%',transform:'translateX(-50%)'}}>
            {NAV.map(({l,p})=>(
              <motion.button key={l} whileTap={{scale:.96}} onClick={()=>goNav(p)}
                style={{background:'none',border:'none',cursor:'pointer',fontFamily:PP,fontSize:13,fontWeight:500,
                  padding:'6px 14px',borderRadius:8,color:p==='/aboutthecrunch'?Y:'rgba(237,233,226,.5)',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.color=CR;e.currentTarget.style.background='rgba(255,255,255,.05)';}}
                onMouseLeave={e=>{e.currentTarget.style.color=p==='/aboutthecrunch'?Y:'rgba(237,233,226,.5)';e.currentTarget.style.background='transparent';}}
              >{l}</motion.button>
            ))}
          </nav>
        )}

        {!isTablet ? (
          <AnimatePresence mode="wait">
            {isAuth ? (
              <motion.button key="lo" initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.9}}
                whileHover={{scale:1.02}} whileTap={{scale:.97}} onClick={handleLogout}
                style={{background:Y,border:'none',borderRadius:8,padding:'8px 20px',fontSize:12.5,fontWeight:700,color:'#1a0a00',cursor:'pointer',fontFamily:PP}}>
                Log Out
              </motion.button>
            ) : (
              <motion.div key="ab" initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.9}} style={{display:'flex',gap:8}}>
                <motion.button whileHover={{scale:1.02}} whileTap={{scale:.97}} onClick={()=>navigate('/login')}
                  style={{background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,padding:'8px 18px',fontSize:12.5,fontWeight:500,color:CR,cursor:'pointer',fontFamily:PP}}>
                  Log In
                </motion.button>
                <motion.button whileHover={{scale:1.02}} whileTap={{scale:.97}} onClick={()=>navigate('/login?tab=signup')}
                  style={{background:Y,border:'none',borderRadius:8,padding:'8px 20px',fontSize:12.5,fontWeight:700,color:'#1a0a00',cursor:'pointer',fontFamily:PP}}>
                  Sign Up
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <button onClick={()=>setMenuOpen(v=>!v)} style={{background:'none',border:'none',cursor:'pointer',padding:8,display:'flex',flexDirection:'column',gap:5}}>
            {[0,1,2].map(i=>(
              <motion.span key={i} animate={menuOpen?i===1?{opacity:0}:i===0?{rotate:45,y:9}:{rotate:-45,y:-9}:{opacity:1,rotate:0,y:0}}
                style={{display:'block',width:22,height:2,background:Y,borderRadius:2}} />
            ))}
          </button>
        )}
      </motion.header>

      {/* MOBILE MENU */}
      <AnimatePresence>
        {menuOpen && isTablet && (
          <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:.22}}
            style={{position:'fixed',top:64,left:0,right:0,zIndex:850,background:'rgba(10,8,6,.98)',backdropFilter:'blur(20px)',borderBottom:'1px solid rgba(245,200,66,.1)',padding:'20px 24px 28px'}}>
            {NAV.map(({l,p})=>(
              <button key={l} onClick={()=>{setMenuOpen(false);goNav(p);}}
                style={{display:'block',width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',fontFamily:PP,fontSize:18,fontWeight:700,
                  color:p==='/aboutthecrunch'?Y:'rgba(237,233,226,.65)',padding:'12px 0',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                {l}
              </button>
            ))}
            <div style={{display:'flex',gap:10,marginTop:20}}>
              <AnimatePresence mode="wait">
                {isAuth ? (
                  <motion.button key="mlo" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={handleLogout}
                    style={{flex:1,background:Y,border:'none',borderRadius:10,padding:13,fontSize:14,fontWeight:700,color:'#1a0a00',cursor:'pointer',fontFamily:PP}}>
                    Log Out
                  </motion.button>
                ) : (
                  <motion.div key="mab" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} style={{display:'flex',gap:10,flex:1}}>
                    <button onClick={()=>{setMenuOpen(false);navigate('/login');}} style={{flex:1,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:10,padding:13,fontSize:14,fontWeight:500,color:CR,cursor:'pointer',fontFamily:PP}}>Log In</button>
                    <button onClick={()=>{setMenuOpen(false);navigate('/login?tab=signup');}} style={{flex:1,background:Y,border:'none',borderRadius:10,padding:13,fontSize:14,fontWeight:700,color:'#1a0a00',cursor:'pointer',fontFamily:PP}}>Sign Up</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HERO */}
      <div ref={heroRef} style={{minHeight:'100vh',position:'relative',overflow:'hidden',display:'grid',gridTemplateColumns:isTablet?'1fr':'1fr 1fr',paddingTop:isMobile?64:0,zIndex:1}}>
        <motion.div style={{y:isTablet?0:txtY,background:'rgba(10,8,6,.5)',display:'flex',flexDirection:'column',justifyContent:'center',
          padding:isMobile?'48px 24px':isTablet?'80px 48px 64px':'0 56px 88px',position:'relative',zIndex:2,minHeight:isTablet?'auto':'100vh'}}>
          {!isTablet && <div style={{position:'absolute',right:0,top:'15%',bottom:'15%',width:1,background:'linear-gradient(to bottom,transparent,rgba(245,200,66,.28),transparent)'}} />}
          <motion.p initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:.3,duration:.6}} style={lbl({marginBottom:20})}>
            Since 2021 · Quezon City, PH
          </motion.p>
          <motion.h1 initial={{opacity:0,y:36}} animate={{opacity:1,y:0}} transition={{delay:.45,duration:.9,ease:[.16,1,.3,1]}}
            style={{fontFamily:PP,fontWeight:900,lineHeight:.9,letterSpacing:'-.03em',fontSize:isMobile?'clamp(52px,14vw,72px)':'clamp(48px,6vw,88px)',color:CR,margin:'0 0 24px'}}>
            The<br/><em style={{color:Y,fontStyle:'italic'}}>Crunch</em><br/>Fairview.
          </motion.h1>
          <motion.p initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:.65,duration:.7}} style={body({fontSize:isMobile?13:14,maxWidth:380,marginBottom:36})}>
            One of the leading Boneless Fried Chicken brands in the Philippines. Serving deliciousness at 250+ branches nationwide.
          </motion.p>
          <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:.82,duration:.6}} style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <BtnY onClick={goMenu}>Order Now</BtnY>
            <BtnGhost onClick={()=>document.getElementById('story')?.scrollIntoView({behavior:'smooth'})}>Our Story</BtnGhost>
          </motion.div>
        </motion.div>

        <div style={{position:'relative',overflow:'hidden',minHeight:isMobile?360:isTablet?480:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <motion.div style={{position:'absolute',inset:0,y:imgY,scale:imgScale}} initial={{opacity:0,scale:1.06}} animate={{opacity:1,scale:1}} transition={{duration:1.8,ease:[.16,1,.3,1]}}>
            <img src={IMG_HERO} alt="Boneless crunchy chicken" style={{width:'100%',height:'100%',objectFit:'contain',objectPosition:'center',display:'block'}} />
            <div style={{position:'absolute',inset:0,background:'linear-gradient(to right,rgba(10,8,6,.55) 0%,transparent 18%)'}} />
            <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(10,8,6,.5) 0%,transparent 30%)'}} />
          </motion.div>
          <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:1.1,duration:.6}}
            style={{position:'absolute',bottom:isMobile?24:48,left:isMobile?16:28,display:'flex',gap:isMobile?8:10,zIndex:10,flexWrap:'wrap'}}>
            {[{v:'250+',l:'Branches'},{v:'7',l:'Flavors'},{v:'2021',l:'Est.'}].map(s=>(
              <StatBadge key={s.l} value={s.v} label={s.l} style={isMobile?{padding:'10px 14px'}:{}} />
            ))}
          </motion.div>
        </div>

        {!isMobile && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:1.8}} style={{position:'absolute',bottom:28,left:'50%',transform:'translateX(-50%)',zIndex:20}}>
            <motion.div animate={{y:[0,8,0]}} transition={{repeat:Infinity,duration:2,ease:'easeInOut'}}
              style={{width:20,height:32,border:'1.5px solid rgba(245,200,66,.3)',borderRadius:12,display:'flex',justifyContent:'center',paddingTop:6}}>
              <motion.div animate={{y:[0,7,0],opacity:[1,.2,1]}} transition={{repeat:Infinity,duration:2,ease:'easeInOut'}}
                style={{width:3,height:6,borderRadius:3,background:Y}} />
            </motion.div>
          </motion.div>
        )}
      </div>

      <Marquee />

      {/* STORY */}
      <section id="story" style={{background:'rgba(14,12,10,.92)',padding:isMobile?'72px 0':'112px 0',position:'relative',zIndex:1}}>
        <div style={{maxWidth:1200,margin:'0 auto',padding:isMobile?'0 24px':isTablet?'0 40px':'0 48px',display:'grid',gridTemplateColumns:isTablet?'1fr':'5fr 4fr',gap:isTablet?48:80,alignItems:'center'}}>
          <Reveal dir={isTablet?'up':'left'}>
            <div style={{position:'relative',paddingBottom:isTablet?0:48,paddingRight:isTablet?0:48}}>
              <div style={{borderRadius:20,overflow:'hidden',height:isMobile?260:isTablet?380:460}}>
                <motion.img src={IMG_STORY} alt="The Crunch chicken" whileHover={{scale:1.04}} transition={{duration:.6,ease:[.16,1,.3,1]}}
                  style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center',display:'block'}} />
              </div>
              {!isMobile && (
                <motion.div animate={{y:[-4,4,-4]}} transition={{repeat:Infinity,duration:4.5,ease:'easeInOut'}}
                  style={{position:isTablet?'relative':'absolute',bottom:isTablet?'auto':0,right:isTablet?'auto':0,marginTop:isTablet?16:0,background:Y,borderRadius:18,padding:'20px 24px',minWidth:120,textAlign:'center',display:'inline-block'}}>
                  <div style={{fontFamily:PP,fontSize:44,fontWeight:900,color:'#1a0a00',lineHeight:1}}>7</div>
                  <div style={{fontFamily:PP,fontSize:9,fontWeight:700,color:'rgba(26,10,0,.5)',letterSpacing:'.18em',textTransform:'uppercase',marginTop:6}}>Signature Flavors</div>
                </motion.div>
              )}
              {!isTablet && (
                <motion.div animate={{y:[3,-3,3]}} transition={{repeat:Infinity,duration:5,ease:'easeInOut',delay:.6}}
                  style={{position:'absolute',top:-16,left:20,background:'rgba(14,12,10,.95)',border:'1px solid rgba(245,200,66,.2)',borderRadius:12,padding:'10px 18px',backdropFilter:'blur(16px)'}}>
                  <div style={lbl({fontSize:10,letterSpacing:'.1em'})}>Est. 2021</div>
                  <div style={{fontFamily:PP,fontSize:11,color:'rgba(237,233,226,.35)',fontWeight:300,marginTop:2}}>Fairview, QC</div>
                </motion.div>
              )}
            </div>
          </Reveal>
          <Reveal dir={isTablet?'up':'right'} delay={.1}>
            <div>
              <p style={lbl({marginBottom:14})}>Our Vision</p>
              <h2 style={{fontFamily:PP,fontWeight:900,color:CR,lineHeight:1.05,letterSpacing:'-.02em',margin:'0 0 24px',fontSize:isMobile?'clamp(32px,9vw,44px)':'clamp(32px,3.5vw,48px)'}}>
                Excellence<br/>in Every<br/><em style={{color:Y}}>Bite.</em>
              </h2>
              <div style={{width:40,height:2,background:'rgba(245,200,66,.3)',marginBottom:24}} />
              <p style={body({fontSize:isMobile?13.5:14.5,marginBottom:16})}>
                Through a shared commitment to excellence we are dedicated to the uncompromising quality of our food and service while taking exceptional care of our guests and staff.
              </p>
              <p style={body({fontSize:isMobile?13.5:14.5,marginBottom:36})}>
                We continuously strive to surpass our own accomplishments and be recognized as one of the most progressive and sustainable businesses in the country.
              </p>
              <div style={{display:'flex',gap:32,flexWrap:'wrap'}}>
                {[{v:'2021',l:'Founded'},{v:'250+',l:'Locations'}].map(s=>(
                  <div key={s.l}>
                    <div style={{fontFamily:PP,fontSize:isMobile?28:32,fontWeight:900,color:Y,lineHeight:1}}>{s.v}</div>
                    <div style={{fontFamily:PP,fontSize:9,fontWeight:600,color:'rgba(237,233,226,.28)',letterSpacing:'.15em',textTransform:'uppercase',marginTop:8}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* MISSION */}
      <section style={{background:'rgba(8,6,4,.92)',padding:isMobile?'80px 0':'100px 0',position:'relative',overflow:'hidden',zIndex:1}}>
        <div style={{position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px)',backgroundSize:'72px 72px'}} />
        <div style={{maxWidth:1200,margin:'0 auto',padding:isMobile?'0 24px':'0 48px',position:'relative'}}>
          <Reveal><p style={lbl({marginBottom:36})}>Our Mission</p></Reveal>
          {([{t:'Flavor',g:false,i:'0',d:.05},{t:'for Everyone,',g:true,i:isMobile?'4vw':'6vw',d:.1},{t:'Every Day.',g:false,i:'0',d:.14}] as {t:string;g:boolean;i:string;d:number}[]).map(({t,g,i,d})=>(
            <Reveal key={t} delay={d}>
              <h2 style={{fontFamily:PP,fontWeight:900,lineHeight:.9,letterSpacing:'-.04em',margin:'0 0 10px',paddingLeft:i,fontSize:isMobile?'clamp(44px,14vw,72px)':'clamp(52px,8.5vw,120px)',color:g?Y:CR,fontStyle:g?'italic':'normal'}}>{t}</h2>
            </Reveal>
          ))}
          <div style={{marginTop:42,display:'grid',gridTemplateColumns:isTablet?'1fr':'1fr 1fr',gap:isTablet?28:72,alignItems:'end'}}>
            <Reveal dir="left" delay={.16}>
              <p style={body({fontSize:isMobile?14:16,margin:0})}>To serve more people with a unique style of high quality boneless fried chicken, and to help Filipinos start a profitable and easy to manage business.</p>
            </Reveal>
            <Reveal dir={isTablet?'up':'right'} delay={.2}>
              <div style={{display:'flex',flexDirection:'column',alignItems:isTablet?'flex-start':'flex-end',gap:20}}>
                {!isTablet && <div style={{width:'100%',height:1,background:'rgba(245,200,66,.15)'}} />}
                <BtnY onClick={goMenu} style={{padding:'14px 40px',fontSize:13.5}}>See the Menu</BtnY>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* PERKS */}
      <section style={{background:'rgba(14,12,10,.92)',padding:isMobile?'72px 0':'96px 0',position:'relative',zIndex:1}}>
        <div style={{maxWidth:1200,margin:'0 auto',padding:isMobile?'0 24px':'0 48px'}}>
          <Reveal>
            <div style={{display:'flex',alignItems:isTablet?'flex-start':'flex-end',justifyContent:'space-between',marginBottom:48,gap:20,flexDirection:isTablet?'column':'row'}}>
              <div>
                <p style={lbl({marginBottom:12})}>Why The Crunch</p>
                <h2 style={{fontFamily:PP,fontWeight:900,color:CR,letterSpacing:'-.02em',margin:0,fontSize:isMobile?'clamp(26px,7vw,36px)':'clamp(30px,3.5vw,48px)'}}>What Sets Us Apart</h2>
              </div>
              {!isMobile && <p style={body({fontSize:13.5,maxWidth:260,lineHeight:1.8,margin:0,color:'rgba(237,233,226,.28)'})}>Six reasons why The Crunch has become the go-to chicken brand for Filipinos.</p>}
            </div>
          </Reveal>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr'}}>
            {PERKS.map((pk,i)=>(
              <Reveal key={pk.num} delay={i*.05}>
                <motion.div whileHover={{background:'rgba(245,200,66,.04)'}}
                  style={{padding:isMobile?'24px 0':'30px 32px',borderTop:'1px solid rgba(255,255,255,.06)',borderRight:!isMobile&&i%2===0?'1px solid rgba(255,255,255,.06)':'none',display:'flex',gap:20,alignItems:'flex-start',transition:'background .2s'}}>
                  <span style={{fontFamily:PP,fontSize:10,fontWeight:700,color:Y,letterSpacing:'.06em',minWidth:24,marginTop:2}}>{pk.num}</span>
                  <div>
                    <h3 style={{fontFamily:PP,fontSize:15,fontWeight:700,color:CR,margin:'0 0 7px'}}>{pk.title}</h3>
                    <p style={body({fontSize:13,lineHeight:1.8,margin:0,color:'rgba(237,233,226,.35)'})}>{pk.desc}</p>
                  </div>
                </motion.div>
              </Reveal>
            ))}
            <div style={{borderTop:'1px solid rgba(255,255,255,.06)',borderRight:isMobile?'none':'1px solid rgba(255,255,255,.06)'}} />
            <div style={{borderTop:'1px solid rgba(255,255,255,.06)'}} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{position:'relative',height:isMobile?'70vh':'85vh',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1}}>
        <div style={{position:'absolute',inset:0}}>
          <img src={IMG_HERO} alt="" style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center',filter:'brightness(.32) saturate(1.15)',display:'block'}} />
          <div style={{position:'absolute',inset:0,background:'rgba(10,8,6,.45)'}} />
          <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at center,transparent 30%,rgba(10,8,6,.7) 100%)',pointerEvents:'none'}} />
        </div>
        <div style={{position:'relative',zIndex:10,textAlign:'center',padding:isMobile?'0 24px':'0 40px',maxWidth:800,width:'100%'}}>
          <Reveal>
            <p style={lbl({marginBottom:20})}>Now Serving</p>
            <h2 style={{fontFamily:PP,fontWeight:900,color:CR,lineHeight:.92,letterSpacing:'-.035em',margin:'0 0 24px',fontSize:isMobile?'clamp(38px,11vw,60px)':'clamp(44px,7vw,96px)'}}>
              Ready to taste<br/><em style={{color:Y}}>The Crunch?</em>
            </h2>
            <p style={body({fontSize:isMobile?13.5:15.5,maxWidth:440,margin:'0 auto 40px'})}>
              Visit us today and experience the crispiest chicken in town. Dine in, takeout, or order for your whole crew.
            </p>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <BtnY onClick={goMenu} style={{padding:isMobile?'13px 36px':'15px 44px',fontSize:isMobile?13:14}}>Order Now</BtnY>
              <motion.button whileHover={{scale:1.04,y:-2}} whileTap={{scale:.97}} onClick={()=>navigate('/products')}
                style={{background:'rgba(255,255,255,.07)',backdropFilter:'blur(12px)',color:CR,border:'1px solid rgba(255,255,255,.15)',borderRadius:10,padding:isMobile?'13px 36px':'15px 44px',fontSize:isMobile?13:14,fontWeight:500,cursor:'pointer',fontFamily:PP}}>
                Back to Home
              </motion.button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{background:'rgba(8,6,4,.96)',borderTop:'1px solid rgba(255,255,255,.05)',padding:isMobile?'48px 24px 32px':'60px 48px 36px',position:'relative',zIndex:1}}>
        <div style={{maxWidth:1200,margin:'0 auto'}}>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':isTablet?'1fr 1fr':'2fr 1fr 1fr',gap:isMobile?36:48,marginBottom:40}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                <img src="/img/logo24.png" alt="The Crunch" style={{width:34,height:34,borderRadius:9,objectFit:'contain'}} />
                <span style={{fontFamily:PP,fontSize:16,fontWeight:800,color:CR}}>The <span style={{color:Y}}>Crunch</span></span>
              </div>
              <p style={body({fontSize:13,maxWidth:240,margin:0})}>Crispy, saucy, always fresh.<br/>Fairview, Dahlia, Quezon City.</p>
            </div>
            <div>
              <p style={{fontFamily:PP,fontSize:9,fontWeight:700,color:'rgba(237,233,226,.15)',letterSpacing:'.2em',textTransform:'uppercase',marginBottom:14}}>Navigate</p>
              {NAV.map(({l,p})=>(
                <motion.button key={l} whileHover={{x:3}} onClick={()=>goNav(p)}
                  style={{display:'block',background:'none',border:'none',cursor:'pointer',fontFamily:PP,fontSize:13.5,fontWeight:400,color:'rgba(237,233,226,.32)',padding:'5px 0',textAlign:'left',transition:'color .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.color=Y;}}
                  onMouseLeave={e=>{e.currentTarget.style.color='rgba(237,233,226,.32)';}}>
                  {l}
                </motion.button>
              ))}
            </div>
            <div>
              <p style={{fontFamily:PP,fontSize:9,fontWeight:700,color:'rgba(237,233,226,.15)',letterSpacing:'.2em',textTransform:'uppercase',marginBottom:14}}>Follow</p>
              {[{l:'Instagram',h:'https://www.instagram.com/thecrunchfairview'},{l:'Facebook',h:'https://www.facebook.com/thecrunchfairview'}].map(({l,h})=>(
                <motion.a key={l} href={h} target="_blank" rel="noopener noreferrer" whileHover={{x:3}}
                  style={{display:'block',fontFamily:PP,fontSize:13.5,fontWeight:400,color:'rgba(237,233,226,.32)',textDecoration:'none',padding:'5px 0',transition:'color .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.color=Y;}}
                  onMouseLeave={e=>{e.currentTarget.style.color='rgba(237,233,226,.32)';}}>
                  {l}
                </motion.a>
              ))}
            </div>
          </div>
          <div style={{borderTop:'1px solid rgba(255,255,255,.04)',paddingTop:24,display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
            <span style={{fontFamily:PP,fontSize:11.5,color:'rgba(237,233,226,.1)',fontWeight:300}}>© {new Date().getFullYear()} The Crunch Fairview Dahlia Quezon City · All rights reserved</span>
            <span style={{fontFamily:PP,fontSize:11.5,color:'rgba(237,233,226,.1)',fontWeight:300}}>Fairview, Dahlia, QC 1118</span>
          </div>
        </div>
      </footer>
    </div>
  );
}