import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, useScroll, useTransform, useInView } from 'framer-motion'
import { Search, Flame, Crown, Clock, ChevronDown, Droplets, MapPin, Star, X, CalendarDays, MessageSquare, Send, CheckCircle, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useViewport } from '@/hooks/use-tablet'
import { api, resolveAssetUrl } from '@/lib/api'

// ── Constants & Types ──────────────────────────────────────────────────────
const NAV_H = 64, BANNER_H = 40, TAB_TOP = NAV_H + BANNER_H + 32
const PLACEHOLDER = '/img/placeholder.jpg'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CATEGORIES = ['All','Chicken','Sides','Drinks','Combos'] as const
type Category = typeof CATEGORIES[number]
const fmtPHP = (v:number) => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(v||0)
const BADGE_CFG: Record<string,{bg:string;dark?:boolean}> = {
  Bestseller:{bg:'#f5c842',dark:true}, Hot:{bg:'#ef4444'}, New:{bg:'#8b5cf6'},
  'Fan Fave':{bg:'#16a34a'}, 'Best Value':{bg:'#0284c7'}, 'Must Try':{bg:'#7c3aed'},
}
const G = '#f5c842', BG = '#060503'

interface Product{id:number;name:string;menuName:string;category:Category;rating:number;badge:string;description:string;price:number;spicy:boolean;img:string;isDrink?:boolean}
interface FlavorItem{name:string;accent:string;desc:string;img:string}
interface MenuItem{name:string;price:number;tag?:string;note?:string;img?:string}
interface MenuSection{id:string;title:string;subtext?:string;pills?:{label:string;spicy:boolean}[];items:MenuItem[];isDrink?:boolean}
interface Promo{id:string;title:string;subtitle?:string;description:string;img:string;badge?:string;badgeColor?:string;eventDate?:string;validUntil?:string;tag?:string;highlight?:boolean;discount?:string}
interface FeedbackPayload{product_id:number;customer_user_id:number|null;rating:number;comment:string}
interface FeedbackProductOption{id:number;name:string}
interface UserInfo{id:number;name:string;email:string;user_type?:string;role?:string}
const MAX_FB = 200

const normCat = (v:unknown):Category => {
  const r = String(v??'').toLowerCase()
  if(r.includes('drink')||r.includes('beverage')||r.includes('fruit soda')) return 'Drinks'
  if(r.includes('side')) return 'Sides'
  if(r.includes('combo')) return 'Combos'
  if(r.includes('chicken')||r.includes('rice meal')||r.includes('menu food')) return 'Chicken'
  return 'All'
}
const normImg = (v:unknown) => typeof v==='string'&&v.trim() ? resolveAssetUrl(v.trim()) : PLACEHOLDER
const mapProducts = (data:unknown[]):Product[] =>
  Array.isArray(data) ? data.map((r:any)=>({
    id:Number(r?.id??r?.product_id??0), name:String(r?.name??r?.product_name??'').trim(),
    menuName:String(r?.menuName??r?.name??'').trim(), category:normCat(r?.category),
    rating:Number(r?.rating??0), badge:String(r?.badge??'').trim(),
    description:String(r?.description??'').trim(), price:Number(r?.price??0),
    spicy:Boolean(r?.spicy), img:normImg(r?.image??r?.img), isDrink:normCat(r?.category)==='Drinks',
  })).filter(r=>r.id>0&&r.name) : []

const getCountdown = (d:string) => {
  const diff = new Date(d).getTime()-Date.now(); if(diff<=0) return null
  const days=Math.floor(diff/86400000), hrs=Math.floor((diff%86400000)/3600000)
  if(days>30) return null; return days>0?`${days}d ${hrs}h left`:`${hrs}h left`
}
const fmtDate = (d:string) => { const dt=new Date(d); return {day:String(dt.getDate()).padStart(2,'0'),month:MONTHS[dt.getMonth()]} }

// ── CSS ────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700;1,900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
:root{
  --g:#f5c842;--gd:rgba(245,200,66,.1);--gb:rgba(245,200,66,.16);
  --bg:#060503;--s:rgba(255,255,255,.03);--b:rgba(255,255,255,.06);
  --t:#f0ede8;--tm:rgba(240,237,232,.4);--td:rgba(240,237,232,.16);
  --f:'Poppins',sans-serif;--r:18px;--pad:clamp(16px,4vw,52px);
}
.pad{padding-left:var(--pad);padding-right:var(--pad);max-width:1300px;margin:0 auto;width:100%}
.g2{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.g2m{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.gp{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.gf{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.tabs{display:flex;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
@media(max-width:640px){.g2,.gp{grid-template-columns:1fr}.gf{grid-template-columns:1fr 1fr}}
@media(max-width:860px){.g2m{grid-template-columns:1fr}}
@media(max-width:768px){.dn{display:none!important}.df{display:flex!important}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pdot{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes shimmer{from{transform:translateX(-100%)}to{transform:translateX(200%)}}
`

// ── Atoms ──────────────────────────────────────────────────────────────────
const s = {
  label:(x:React.CSSProperties={}):React.CSSProperties=>({fontFamily:'var(--f)',fontSize:9,fontWeight:700,letterSpacing:'.26em',textTransform:'uppercase' as const,color:'var(--g)',...x}),
  body:(x:React.CSSProperties={}):React.CSSProperties=>({fontFamily:'var(--f)',fontSize:13,color:'var(--tm)',lineHeight:1.85,fontWeight:300,...x}),
}

function Reveal({children,d=0,dir='up',style={}}:{children:React.ReactNode;d?:number;dir?:'up'|'left'|'right';style?:React.CSSProperties}){
  const ref=useRef(null); const v=useInView(ref,{once:false,margin:'-60px',amount:0})
  const init=dir==='up'?{opacity:0,y:32}:dir==='left'?{opacity:0,x:-28}:{opacity:0,x:28}
  return <motion.div ref={ref} initial={init} animate={v?{opacity:1,y:0,x:0}:init} transition={{delay:v?d*.08:0,duration:.6,ease:[.22,1,.36,1]}} style={style}>{children}</motion.div>
}

function Img({src,alt,style={}}:{src:string;alt:string;style?:React.CSSProperties}){
  const [ok,setOk]=useState(false),[err,setErr]=useState(false)
  return(
    <div style={{position:'relative',width:'100%',height:'100%',overflow:'hidden'}}>
      {!ok&&<div style={{position:'absolute',inset:0,background:'#0e0c09',overflow:'hidden'}}><div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,transparent,rgba(245,200,66,.04),transparent)',animation:'shimmer 1.8s infinite'}}/></div>}
      <img src={err?PLACEHOLDER:src} alt={alt} onLoad={()=>setOk(true)} onError={()=>{setErr(true);setOk(true)}} style={{width:'100%',height:'100%',objectFit:'cover',display:'block',opacity:ok?1:0,transition:'opacity .4s',...style}}/>
    </div>
  )
}

function Tag({children,color='var(--g)',bg='var(--gd)',border='var(--gb)'}:{children:React.ReactNode;color?:string;bg?:string;border?:string}){
  return <span style={{fontSize:9,fontWeight:700,padding:'3px 9px',borderRadius:999,background:bg,color,border:`1px solid ${border}`,letterSpacing:'.07em',textTransform:'uppercase',fontFamily:'var(--f)'}}>{children}</span>
}

// ── User Role Badge Bar ────────────────────────────────────────────────────
function UserRoleBadge({user}:{user:UserInfo}){
  const type = user.user_type ?? 'customer'
  const role = user.role ?? 'user'
  const roleColor: Record<string,string> = {
    admin:'#ef4444', manager:'#f97316', staff:'#8b5cf6', customer:'#22c55e', user:'#22c55e'
  }
  const ac = roleColor[role.toLowerCase()] ?? roleColor[type.toLowerCase()] ?? G
  return(
    <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} transition={{duration:.35,ease:[.22,1,.36,1]}}
      style={{position:'sticky',top:NAV_H+BANNER_H,zIndex:175,background:'rgba(6,5,3,.96)',backdropFilter:'blur(18px)',borderBottom:`1px solid ${ac}20`}}>
      <div className="pad" style={{display:'flex',alignItems:'center',gap:10,paddingTop:6,paddingBottom:6}}>
        <ShieldCheck size={11} color={ac}/>
        <span style={{fontFamily:'var(--f)',fontSize:11,fontWeight:600,color:'var(--tm)'}}>
          Logged in as <span style={{color:'var(--t)',fontWeight:700}}>{user.name}</span>
        </span>
        <div style={{width:1,height:9,background:'var(--b)'}}/>
        <span style={{fontSize:9,fontWeight:700,padding:'2px 9px',borderRadius:999,background:`${ac}14`,color:ac,border:`1px solid ${ac}30`,letterSpacing:'.08em',textTransform:'uppercase',fontFamily:'var(--f)'}}>{type}</span>
        <span style={{fontSize:9,fontWeight:700,padding:'2px 9px',borderRadius:999,background:`${ac}08`,color:ac,border:`1px solid ${ac}20`,letterSpacing:'.08em',textTransform:'uppercase',fontFamily:'var(--f)'}}>{role}</span>
      </div>
    </motion.div>
  )
}

// ── Product Card ───────────────────────────────────────────────────────────
function ProductCard({product:p,index,onOrder}:{product:Product;index:number;onOrder:()=>void}){
  const [hov,setHov]=useState(false); const ref=useRef(null)
  const v=useInView(ref,{once:false,margin:'-50px',amount:0})
  const badge=BADGE_CFG[p.badge]; const drk=!!p.isDrink
  const ac=drk?'rgba(147,210,255,':'rgba(245,200,66,'
  return(
    <motion.article ref={ref} initial={{opacity:0,y:28}} animate={v?{opacity:1,y:hov?-5:0}:{opacity:0,y:28}}
      transition={{delay:v?index*.055:0,duration:.55,ease:[.22,1,.36,1]}}
      onHoverStart={()=>setHov(true)} onHoverEnd={()=>setHov(false)}
      style={{borderRadius:22,overflow:'hidden',position:'relative',background:'rgba(10,8,5,.75)',backdropFilter:'blur(20px)',
        border:`1px solid ${hov?`${ac}.25)`:drk?'rgba(147,210,255,.08)':'rgba(255,255,255,.07)'}`,
        boxShadow:hov?`0 28px 60px rgba(0,0,0,.7),0 0 0 1px ${ac}.1)`:'0 2px 20px rgba(0,0,0,.4)',
        transition:'border-color .25s,box-shadow .25s'}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:1,background:hov?`linear-gradient(90deg,transparent,${ac}.45),transparent)`:'linear-gradient(90deg,transparent,rgba(255,255,255,.05),transparent)',transition:'background .3s'}}/>
      <div style={{position:'relative',aspectRatio:'4/3',overflow:'hidden'}}>
        <motion.div animate={{scale:hov?1.07:1}} transition={{duration:.65,ease:[.22,1,.36,1]}} style={{position:'absolute',inset:0}}>
          <Img src={p.img} alt={p.name}/>
        </motion.div>
        <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,transparent 40%,rgba(5,4,2,.95))'}}/>
        {badge&&<span style={{position:'absolute',top:12,left:12,zIndex:2,background:badge.bg,color:badge.dark?'#111':'#fff',fontSize:9,fontWeight:700,padding:'3px 10px',borderRadius:999,letterSpacing:'.06em',textTransform:'uppercase',boxShadow:`0 4px 12px ${badge.bg}55`}}>{p.badge}</span>}
        {p.spicy&&<motion.div animate={{rotate:hov?[0,-8,8,0]:0}} transition={{duration:.4}} style={{position:'absolute',top:12,right:12,zIndex:2,background:'rgba(239,68,68,.12)',border:'1px solid rgba(239,68,68,.25)',borderRadius:'50%',width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center'}}><Flame size={12} color="#ef4444"/></motion.div>}
        {p.rating>0&&<div style={{position:'absolute',bottom:10,left:12,zIndex:2,display:'flex',alignItems:'center',gap:4,background:'rgba(0,0,0,.65)',backdropFilter:'blur(8px)',border:'1px solid rgba(245,200,66,.18)',borderRadius:999,padding:'2px 8px'}}><Star size={8} color={G} fill={G}/><span style={{fontSize:10,fontWeight:600,color:G,fontFamily:'var(--f)'}}>{p.rating.toFixed(1)}</span></div>}
      </div>
      <div style={{padding:'14px 18px 18px'}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:5}}>
          <h3 style={{fontFamily:'var(--f)',fontSize:18,fontWeight:700,color:'var(--t)',lineHeight:1.15,letterSpacing:'-.01em'}}>{p.name}</h3>
          <Tag color='var(--td)' bg='transparent' border='var(--b)'>{p.category}</Tag>
        </div>
        <p style={s.body({fontSize:12,marginBottom:12})}>{p.description}</p>
        {drk&&<div style={{display:'flex',gap:5,marginBottom:12}}>{[{z:'16oz',pr:50},{z:'22oz',pr:60}].map(sz=><Tag key={sz.z} color='#93c5fd' bg='rgba(99,179,237,.06)' border='rgba(147,210,255,.14)'>{sz.z} · {fmtPHP(sz.pr)}</Tag>)}</div>}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          {!drk?<span style={{fontFamily:'var(--f)',fontSize:22,fontWeight:800,color:G,letterSpacing:'-.02em'}}>{fmtPHP(p.price)}</span>:<div/>}
          <motion.button whileHover={{scale:1.06}} whileTap={{scale:.95}} onClick={e=>{e.stopPropagation();onOrder()}}
            style={{background:drk?'rgba(99,179,237,.1)':'var(--g)',color:drk?'#93c5fd':'#0d0b08',border:drk?'1px solid rgba(147,210,255,.2)':'none',borderRadius:10,padding:'8px 20px',fontSize:11.5,fontWeight:700,cursor:'pointer',fontFamily:'var(--f)',letterSpacing:'.04em'}}>
            Order
          </motion.button>
        </div>
      </div>
    </motion.article>
  )
}

// ── Menu Row & Card ────────────────────────────────────────────────────────
function MenuRow({item,index}:{item:MenuItem;index:number}){
  const ref=useRef(null); const v=useInView(ref,{once:false,margin:'-20px',amount:0})
  return(
    <motion.div ref={ref} initial={{opacity:0,x:-6}} animate={v?{opacity:1,x:0}:{opacity:0,x:-6}} transition={{delay:v?index*.035:0,duration:.35}}
      style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,.035)'}}>
      {item.img&&<div style={{width:42,height:42,borderRadius:8,overflow:'hidden',flexShrink:0,border:'1px solid var(--b)'}}><Img src={item.img} alt={item.name}/></div>}
      <div style={{flex:1,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',minWidth:0}}>
        <span style={s.body({fontSize:12.5,fontWeight:400,color:'var(--tm)'})}>{item.name}</span>
        {item.tag&&<Tag>{item.tag}</Tag>}
      </div>
      <span style={{fontFamily:'var(--f)',fontSize:13,fontWeight:700,color:G,flexShrink:0}}>{fmtPHP(item.price)}</span>
    </motion.div>
  )
}

function MenuCard({section:sec,delay}:{section:MenuSection;delay:number}){
  const ref=useRef(null); const v=useInView(ref,{once:false,margin:'-50px',amount:0}); const drk=!!sec.isDrink
  return(
    <motion.div ref={ref} initial={{opacity:0,y:20}} animate={v?{opacity:1,y:0}:{opacity:0,y:20}} transition={{duration:.5,delay:v?delay:0}}
      style={{borderRadius:20,background:drk?'rgba(99,179,237,.03)':'var(--s)',border:`1px solid ${drk?'rgba(147,210,255,.09)':'var(--b)'}`,padding:'clamp(16px,2.5vw,24px)',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:0,left:20,right:20,height:1,background:drk?'linear-gradient(90deg,transparent,rgba(147,210,255,.2),transparent)':'linear-gradient(90deg,transparent,rgba(245,200,66,.18),transparent)'}}/>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        {drk&&<Droplets size={13} color="#93c5fd"/>}
        <h3 style={{fontFamily:'var(--f)',fontSize:18,fontWeight:700,color:'var(--t)'}}>{sec.title}</h3>
        <div style={{flex:1,height:1,background:'var(--b)'}}/>
      </div>
      {sec.subtext&&<p style={s.body({fontSize:11,marginBottom:10,fontStyle:'italic'})}>{sec.subtext}</p>}
      {sec.pills&&<div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>{sec.pills.map(o=><Tag key={o.label} color={o.spicy?'#ef4444':'var(--tm)'} bg={o.spicy?'rgba(239,68,68,.06)':'transparent'} border={o.spicy?'rgba(239,68,68,.18)':'var(--b)'}>{o.label}</Tag>)}</div>}
      {drk&&<div style={{display:'flex',gap:5,marginBottom:10}}>{[{l:'16oz',p:50},{l:'22oz',p:60}].map(z=><div key={z.l} style={{display:'flex',alignItems:'center',gap:4,background:'rgba(99,179,237,.06)',border:'1px solid rgba(147,210,255,.12)',borderRadius:999,padding:'3px 9px'}}><Droplets size={8} color="#93c5fd"/><span style={{fontSize:10,fontWeight:600,color:'#93c5fd',fontFamily:'var(--f)'}}>{z.l} · {fmtPHP(z.p)}</span></div>)}</div>}
      {sec.items.map((it,i)=><MenuRow key={`${sec.id}-${it.name}-${it.price}`} item={it} index={i}/>)}
    </motion.div>
  )
}

// ── Flavor Card ────────────────────────────────────────────────────────────
function FlavorCard({flavor:f,index,expanded,onToggle}:{flavor:FlavorItem;index:number;expanded:boolean;onToggle:()=>void}){
  const ref=useRef(null); const v=useInView(ref,{once:false,margin:'-30px',amount:0})
  return(
    <motion.div ref={ref} initial={{opacity:0,y:14}} animate={v?{opacity:1,y:0}:{opacity:0,y:14}} transition={{delay:v?index*.04:0,duration:.4}} style={{gridColumn:expanded?'span 2':'span 1'}}>
      <motion.button onClick={onToggle} whileHover={{scale:1.02}} whileTap={{scale:.97}}
        style={{width:'100%',background:expanded?`${f.accent}12`:'var(--s)',border:`1.5px solid ${expanded?f.accent:'var(--b)'}`,borderRadius:expanded?'12px 12px 0 0':12,padding:'11px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',fontFamily:'var(--f)',boxShadow:expanded?`0 0 20px ${f.accent}14`:'none',transition:'all .2s'}}>
        <span style={{fontSize:12.5,fontWeight:600,color:'var(--t)'}}>{f.name}</span>
        <motion.div animate={{rotate:expanded?180:0}} transition={{duration:.2}}><ChevronDown size={13} color={expanded?f.accent:'var(--td)'}/></motion.div>
      </motion.button>
      <AnimatePresence>
        {expanded&&<motion.div key="exp" initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} transition={{duration:.3,ease:[.22,1,.36,1]}} style={{overflow:'hidden',border:`1.5px solid ${f.accent}`,borderTop:'none',borderRadius:'0 0 12px 12px',background:'rgba(0,0,0,.55)'}}>
          <div style={{position:'relative',aspectRatio:'16/9',overflow:'hidden'}}>
            <Img src={f.img} alt={f.name}/>
            <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(0,0,0,.9),transparent 55%)'}}/>
            <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'10px 14px'}}>
              <p style={{fontFamily:'var(--f)',fontSize:16,fontWeight:700,color:'var(--t)',marginBottom:2}}>{f.name}</p>
              <p style={s.body({fontSize:11.5})}>{f.desc}</p>
            </div>
          </div>
        </motion.div>}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Promo Card ─────────────────────────────────────────────────────────────
function PromoCard({promo:p,index,large=false}:{promo:Promo;index:number;large?:boolean}){
  const [hov,setHov]=useState(false); const ref=useRef(null)
  const v=useInView(ref,{once:false,margin:'-50px',amount:0})
  const ac=p.badgeColor??G; const evd=p.eventDate?fmtDate(p.eventDate):null; const cd=p.validUntil?getCountdown(p.validUntil):null
  return(
    <motion.article ref={ref} initial={{opacity:0,y:24}} animate={v?{opacity:1,y:hov?-4:0}:{opacity:0,y:24}}
      transition={{delay:v?index*.06:0,duration:.5,ease:[.22,1,.36,1]}}
      onHoverStart={()=>setHov(true)} onHoverEnd={()=>setHov(false)}
      style={{borderRadius:20,overflow:'hidden',background:'rgba(10,8,5,.75)',backdropFilter:'blur(18px)',border:`1px solid ${hov?`${ac}40`:'var(--b)'}`,boxShadow:hov?'0 20px 50px rgba(0,0,0,.6)':'0 2px 20px rgba(0,0,0,.35)',transition:'border-color .25s,box-shadow .25s',display:'flex',flexDirection:'column'}}>
      <div style={{position:'relative',aspectRatio:large?'21/9':'16/9',overflow:'hidden',background:'#080604'}}>
        <motion.div animate={{scale:hov?1.06:1}} transition={{duration:.65,ease:[.22,1,.36,1]}} style={{position:'absolute',inset:0}}>
          <Img src={p.img||PLACEHOLDER} alt={p.title} style={{filter:hov?'brightness(1.05) saturate(1.15)':'brightness(.78)'}}/>
        </motion.div>
        <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,transparent 30%,rgba(5,4,2,.93))'}}/>
        {evd&&<div style={{position:'absolute',top:12,left:12,zIndex:3,background:ac,borderRadius:8,padding:'4px 8px',textAlign:'center',minWidth:36}}><div style={{fontSize:15,fontWeight:900,color:'#111',lineHeight:1,fontFamily:'var(--f)'}}>{evd.day}</div><div style={{fontSize:7,fontWeight:700,color:'#111',letterSpacing:'.08em',textTransform:'uppercase',fontFamily:'var(--f)'}}>{evd.month}</div></div>}
        {p.badge&&<span style={{position:'absolute',top:12,right:12,zIndex:3,background:`${ac}1e`,border:`1px solid ${ac}40`,backdropFilter:'blur(8px)',color:ac,fontSize:8,fontWeight:700,padding:'2px 9px',borderRadius:999,letterSpacing:'.08em',textTransform:'uppercase',fontFamily:'var(--f)'}}>{p.badge}</span>}
        {p.discount&&<div style={{position:'absolute',bottom:12,right:12,zIndex:3,background:ac,borderRadius:'50%',width:48,height:48,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 4px 16px ${ac}55`,transform:'rotate(-12deg)'}}><span style={{fontSize:8.5,fontWeight:900,color:'#111',textAlign:'center',padding:'0 3px',fontFamily:'var(--f)'}}>{p.discount}</span></div>}
      </div>
      <div style={{padding:'14px 16px 18px',flex:1,display:'flex',flexDirection:'column',gap:5}}>
        {p.tag&&<div style={{display:'flex',alignItems:'center',gap:5}}><CalendarDays size={8} color={ac}/><span style={s.label({color:ac,fontSize:8})}>{p.tag}</span></div>}
        <h3 style={{fontFamily:'var(--f)',fontSize:large?20:16,fontWeight:700,color:'var(--t)',lineHeight:1.15}}>{p.title}</h3>
        {p.subtitle&&<p style={{fontSize:11.5,fontWeight:500,color:ac,fontFamily:'var(--f)'}}>{p.subtitle}</p>}
        <p style={s.body({fontSize:12,flex:'1'})}>{p.description}</p>
        {cd&&<div style={{display:'inline-flex',alignItems:'center',gap:5,marginTop:3,background:'rgba(239,68,68,.07)',border:'1px solid rgba(239,68,68,.18)',borderRadius:999,padding:'3px 9px',alignSelf:'flex-start'}}><div style={{width:4,height:4,borderRadius:'50%',background:'#ef4444',animation:'pdot 1.2s infinite'}}/><span style={{fontSize:9,fontWeight:700,color:'#ef4444',fontFamily:'var(--f)'}}>{cd}</span></div>}
      </div>
    </motion.article>
  )
}

// ── Feedback ───────────────────────────────────────────────────────────────
function StarRating({value,onChange}:{value:number;onChange:(v:number)=>void}){
  const [hov,setHov]=useState(0)
  return(
    <div style={{display:'flex',gap:5}}>
      {[1,2,3,4,5].map(n=>{const a=n<=(hov||value); return(
        <motion.button key={n} whileHover={{scale:1.2}} whileTap={{scale:.9}} onMouseEnter={()=>setHov(n)} onMouseLeave={()=>setHov(0)} onClick={()=>onChange(n)} style={{background:'none',border:'none',padding:0,cursor:'pointer',lineHeight:0}}>
          <Star size={24} fill={a?G:'none'} color={a?G:'var(--td)'} style={{transition:'fill .12s,color .12s'}}/>
        </motion.button>
      )})}
    </div>
  )
}

function FeedbackModal({onClose,productOptions}:{onClose:()=>void;productOptions:FeedbackProductOption[]}){
  const {isMobile,isShortViewport}=useViewport()
  const [rating,setRating]=useState(0),[message,setMessage]=useState('')
  const [productId,setProductId]=useState<number|null>(productOptions[0]?.id??null)
  const [status,setStatus]=useState<'idle'|'submitting'|'success'|'error'>('idle')
  const [errMsg,setErrMsg]=useState(''),[focused,setFocused]=useState<string|null>(null)
  useEffect(()=>{setProductId(cur=>(cur&&productOptions.some(p=>p.id===cur))?cur:(productOptions[0]?.id??null))},[productOptions])
  const rawId=typeof window!=='undefined'?window.localStorage.getItem('userId'):null
  const userId=rawId&&Number.isInteger(+rawId)&&+rawId>0?+rawId:null
  const trimmed=message.trim(); const can=productId!==null&&rating>0&&trimmed.length>0&&trimmed.length<=MAX_FB
  const inp=(f:string):React.CSSProperties=>({fontFamily:'var(--f)',fontSize:12.5,color:'var(--t)',background:focused===f?'rgba(255,255,255,.07)':'rgba(255,255,255,.04)',border:`1px solid ${focused===f?'rgba(245,200,66,.4)':'var(--b)'}`,borderRadius:9,padding:'9px 12px',width:'100%',outline:'none',boxSizing:'border-box' as const,resize:'none' as const,transition:'border-color .18s,background .18s',boxShadow:focused===f?'0 0 0 3px rgba(245,200,66,.05)':'none'})
  const submit=async()=>{
    if(!can||productId===null) return; setStatus('submitting'); setErrMsg('')
    try{ await api.post('/feedback',{product_id:productId,customer_user_id:userId,rating,comment:trimmed} satisfies FeedbackPayload); setStatus('success') }
    catch(e:any){ setErrMsg(e?.message||'Failed to submit. Please try again.'); setStatus('error') }
  }
  return(
    <>
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',backdropFilter:'blur(5px)',zIndex:900}}/>
      <motion.div initial={{opacity:0,y:36,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:20,scale:.97}} transition={{type:'spring',damping:26,stiffness:240}}
        style={{position:'fixed',bottom:isMobile?14:90,right:isMobile?14:22,left:isMobile?14:'auto',width:isMobile?'auto':'min(390px,calc(100vw - 28px))',maxHeight:isShortViewport?'calc(100vh - 110px)':'calc(100vh - 130px)',overflowY:'auto',background:'rgba(12,10,7,.97)',border:'1px solid var(--gb)',borderRadius:isMobile?16:18,padding:isMobile?18:24,zIndex:901,boxShadow:'0 28px 70px rgba(0,0,0,.7)',backdropFilter:'blur(20px)'}}>
        <div style={{position:'absolute',top:0,left:20,right:20,height:1,background:'linear-gradient(90deg,transparent,rgba(245,200,66,.4),transparent)'}}/>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:18}}>
          <div><p style={{fontFamily:'var(--f)',fontSize:16,fontWeight:700,color:'var(--t)'}}>Share your thoughts</p><p style={s.body({fontSize:11,marginTop:2})}>Help us improve The Crunch</p></div>
          <motion.button whileHover={{scale:1.1}} whileTap={{scale:.9}} onClick={onClose} style={{background:'var(--s)',border:'1px solid var(--b)',borderRadius:'50%',width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}><X size={12} color="var(--tm)"/></motion.button>
        </div>
        <AnimatePresence mode="wait">
          {status==='success'?(
            <motion.div key="ok" initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:'16px 0',textAlign:'center'}}>
              <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:'spring',damping:14,stiffness:200,delay:.1}}><CheckCircle size={40} color="#22c55e"/></motion.div>
              <p style={{fontFamily:'var(--f)',fontSize:16,fontWeight:700,color:'var(--t)'}}>Thank you!</p>
              <p style={s.body({fontSize:11})}>Your feedback has been received.</p>
              <motion.button whileHover={{scale:1.03}} whileTap={{scale:.97}} onClick={onClose} style={{marginTop:4,background:'var(--gd)',border:'1px solid var(--gb)',borderRadius:9,padding:'8px 22px',fontSize:12,fontWeight:600,color:G,cursor:'pointer',fontFamily:'var(--f)'}}>Close</motion.button>
            </motion.div>
          ):(
            <motion.div key="form" style={{display:'flex',flexDirection:'column',gap:12}}>
              <div><p style={s.label({marginBottom:6})}>Rating</p><StarRating value={rating} onChange={setRating}/>{rating>0&&<motion.p initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} style={{fontFamily:'var(--f)',fontSize:10.5,color:G,marginTop:4,fontWeight:500}}>{['','Poor','Fair','Good','Great','Amazing!'][rating]}</motion.p>}</div>
              <div><p style={s.label({marginBottom:6})}>Product</p><select value={productId??''} onChange={e=>setProductId(+e.target.value||null)} onFocus={()=>setFocused('product')} onBlur={()=>setFocused(null)} style={inp('product')} disabled={productOptions.length===0||status==='submitting'}>{productOptions.length===0?<option value="">No products available</option>:productOptions.map(p=><option key={p.id} value={p.id} style={{color:'#111'}}>{p.name}</option>)}</select></div>
              <div><p style={s.label({marginBottom:6})}>Feedback</p><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Tell us about your experience…" rows={4} maxLength={MAX_FB} onFocus={()=>setFocused('msg')} onBlur={()=>setFocused(null)} style={inp('msg')}/><p style={s.body({fontSize:9.5,textAlign:'right',marginTop:2})}>{message.length}/{MAX_FB}</p></div>
              <AnimatePresence>{status==='error'&&<motion.p initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}} style={{fontFamily:'var(--f)',fontSize:11.5,color:'#ef4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.16)',borderRadius:7,padding:'6px 10px'}}>{errMsg}</motion.p>}</AnimatePresence>
              <motion.button whileHover={can?{scale:1.02}:{}} whileTap={can?{scale:.97}:{}} onClick={submit} disabled={!can||status==='submitting'}
                style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7,background:can?G:'rgba(245,200,66,.1)',border:'none',borderRadius:10,padding:'11px',fontSize:12,fontWeight:700,color:can?'#0d0b08':'rgba(245,200,66,.28)',cursor:can?'pointer':'default',fontFamily:'var(--f)',transition:'background .18s,color .18s'}}>
                {status==='submitting'?<span style={{display:'inline-block',width:13,height:13,border:'2px solid rgba(17,17,17,.3)',borderTopColor:'#111',borderRadius:'50%',animation:'spin .7s linear infinite'}}/>:<Send size={13}/>}
                {status==='submitting'?'Sending…':'Submit'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}

function FeedbackButton(){
  const {isMobile}=useViewport(); const [open,setOpen]=useState(false); const [products,setProducts]=useState<FeedbackProductOption[]>([])
  useEffect(()=>{api.get<unknown[]>('/products?item_type=menu_item').then((data:unknown[])=>{if(!Array.isArray(data)) return; setProducts(data.filter((d:any)=>Number.isInteger(d.id)&&typeof d.name==='string'&&String(d.item_type??'menu_item').trim().toLowerCase()==='menu_item').map((d:any)=>({id:+d.id,name:String(d.name).trim()})))}).catch(()=>{})},[])
  return(
    <>
      <AnimatePresence>{open&&<FeedbackModal onClose={()=>setOpen(false)} productOptions={products}/>}</AnimatePresence>
      <motion.button initial={{scale:0,opacity:0}} animate={{scale:1,opacity:1}} transition={{delay:1.2,type:'spring',damping:18,stiffness:260}}
        whileHover={{scale:1.08}} whileTap={{scale:.93}} onClick={()=>setOpen(v=>!v)}
        style={{position:'fixed',bottom:isMobile?16:26,right:isMobile?14:22,zIndex:800,display:'flex',alignItems:'center',gap:7,background:G,border:'none',borderRadius:999,padding:isMobile?'10px 15px':'10px 18px',fontSize:11.5,fontWeight:700,color:'#0d0b08',cursor:'pointer',fontFamily:'var(--f)',boxShadow:'0 6px 24px rgba(245,200,66,.28)',letterSpacing:'.03em'}}>
        <MessageSquare size={14}/>{open?'Close':'Feedback'}
      </motion.button>
    </>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
interface ProductsProps{isAuthenticated?:boolean;onLogout?:()=>void}

export default function Products({isAuthenticated=false,onLogout}:ProductsProps){
  const navigate=useNavigate(); const {isPhone}=useViewport()
  const [products,setProducts]=useState<Product[]>([]),[flavors,setFlavors]=useState<FlavorItem[]>([])
  const [menuSections,setMenuSections]=useState<MenuSection[]>([]),[promos,setPromos]=useState<Promo[]>([])
  const [loadingP,setLoadingP]=useState(true),[loadingF,setLoadingF]=useState(true)
  const [loadingM,setLoadingM]=useState(true),[loadingR,setLoadingR]=useState(true)
  const [category,setCategory]=useState<Category>('All'),[search,setSearch]=useState('')
  const [isOpen,setIsOpen]=useState(false),[expandedFlavor,setExpandedFlavor]=useState<string|null>(null)
  const [mobileOpen,setMobileOpen]=useState(false),[searchFocused,setSearchFocused]=useState(false)
  const [currentUser,setCurrentUser]=useState<UserInfo|null>(null)
  const {scrollY}=useScroll(); const heroY=useTransform(scrollY,[0,600],[0,80]); const heroO=useTransform(scrollY,[0,400],[1,.35])

  useEffect(()=>{
    const check=()=>{ const n=new Date(),d=n.getDay(),t=n.getHours()+n.getMinutes()/60; setIsOpen((d>=1&&d<=5&&t>=10&&t<22)||((d===0||d===6)&&t>=11&&t<20.5)) }
    check(); const id=setInterval(check,60000); return()=>clearInterval(id)
  },[])

  useEffect(()=>{ const el=document.createElement('style'); el.id='crunch-lux2'; if(!document.getElementById('crunch-lux2')){el.innerHTML=CSS;document.head.appendChild(el)} return()=>{ document.getElementById('crunch-lux2')?.remove() } },[])

  // Fetch logged-in user info
  useEffect(()=>{
    if(!isAuthenticated){setCurrentUser(null);return}
    api.get<UserInfo>('/api/me').then((d:UserInfo)=>setCurrentUser(d)).catch(()=>{})
  },[isAuthenticated])

  const fetch=<T,>(url:string,set:(d:T[])=>void,setL:(v:boolean)=>void,map?:(d:unknown[])=>T[])=>{
    let c=false; setL(true)
    api.get<unknown[]>(url).then((d:unknown)=>{ if(!c){const r=Array.isArray(d)?d:[]; set(map?map(r):(r as T[])); setL(false)} }).catch(()=>{if(!c)setL(false)})
    return()=>{c=true}
  }

  useEffect(()=>fetch<Product>('/api/products?item_type=menu_item',setProducts,setLoadingP,mapProducts),[])
  useEffect(()=>fetch<FlavorItem>('/api/flavors',setFlavors,setLoadingF),[])
  useEffect(()=>fetch<MenuSection>('/api/menu-sections',setMenuSections,setLoadingM),[])
  useEffect(()=>fetch<Promo>('/api/promos',setPromos,setLoadingR),[])

  const filtered=products.filter(p=>(category==='All'||p.category===category)&&p.name.toLowerCase().includes(search.toLowerCase()))
  const topPick=filtered.find(p=>p.badge==='Bestseller')??filtered[0]??null
  const handleOrder=useCallback(()=>navigate('/usersmenu?showOrderModal=true'),[navigate])
  const handleLogout=useCallback(()=>{onLogout?.();navigate('/products')},[onLogout,navigate])
  const navLinks=[{label:'Home',action:()=>navigate('/')},{label:'Menu',action:handleOrder},{label:'About',action:()=>navigate('/aboutthecrunch')}]

  const Skel=({h,r=18}:{h:number;r?:number})=>(
    <div style={{borderRadius:r,background:'rgba(255,255,255,.03)',border:'1px solid var(--b)',height:h,overflow:'hidden',position:'relative'}}>
      <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,transparent,rgba(245,200,66,.03),transparent)',animation:'shimmer 1.8s infinite'}}/>
    </div>
  )

  // Sticky offset: if user badge bar is showing, push tab bar down an extra 32px
  const tabTop = isAuthenticated && currentUser ? NAV_H + BANNER_H + 32 : NAV_H + BANNER_H

  return(
    <div style={{fontFamily:'var(--f)',background:BG,minHeight:'100vh',color:'var(--t)',position:'relative'}}>

      {/* NAV */}
      <motion.header initial={{y:-70,opacity:0}} animate={{y:0,opacity:1}} transition={{duration:.65,ease:[.22,1,.36,1]}}
        style={{position:'sticky',top:0,zIndex:200,height:NAV_H,background:'rgba(6,5,3,.93)',backdropFilter:'blur(28px)',borderBottom:'1px solid var(--b)',display:'flex',alignItems:'center'}}>
        <div className="pad" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <button onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} style={{background:'none',border:'none',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:8}}>
            <img src="/img/logo24.png" alt="The Crunch" style={{width:32,height:32,objectFit:'contain'}}/>
            {!isPhone&&<span style={{fontFamily:'var(--f)',fontWeight:800,fontSize:20,color:'var(--t)',letterSpacing:'-.025em'}}>The <span style={{color:G}}>Crunch</span></span>}
          </button>
          <nav className="dn" style={{display:'flex',gap:2,alignItems:'center'}}>
            {navLinks.map(({label,action})=>(
              <button key={label} onClick={action} style={{color:'var(--tm)',fontSize:12.5,fontWeight:500,padding:'7px 13px',borderRadius:9,background:'none',border:'none',cursor:'pointer',fontFamily:'var(--f)',transition:'color .18s,background .18s'}}
                onMouseEnter={e=>{e.currentTarget.style.color='var(--t)';e.currentTarget.style.background='var(--s)'}}
                onMouseLeave={e=>{e.currentTarget.style.color='var(--tm)';e.currentTarget.style.background='transparent'}}>
                {label}
              </button>
            ))}
            <div style={{width:1,height:14,background:'var(--b)',margin:'0 5px'}}/>
            {isAuthenticated?(
              <motion.button whileHover={{scale:1.02}} whileTap={{scale:.97}} onClick={handleLogout} style={{background:G,border:'none',borderRadius:9,padding:'7px 18px',fontSize:12,fontWeight:700,color:'#0d0b08',cursor:'pointer',fontFamily:'var(--f)'}}>Log Out</motion.button>
            ):(
              <>
                <motion.button whileHover={{scale:1.02}} whileTap={{scale:.97}} onClick={()=>navigate('/login')} style={{background:'var(--s)',border:'1px solid var(--b)',borderRadius:9,padding:'7px 15px',fontSize:12,fontWeight:600,color:'var(--t)',cursor:'pointer',fontFamily:'var(--f)'}}>Log In</motion.button>
                <motion.button whileHover={{scale:1.02}} whileTap={{scale:.97}} onClick={()=>navigate('/login?tab=signup')} style={{background:G,border:'none',borderRadius:9,padding:'7px 18px',fontSize:12,fontWeight:700,color:'#0d0b08',cursor:'pointer',fontFamily:'var(--f)'}}>Sign Up</motion.button>
              </>
            )}
          </nav>
          <button onClick={()=>setMobileOpen(v=>!v)} className="df" style={{display:'none',background:'none',border:'none',cursor:'pointer',color:'var(--t)',padding:7,borderRadius:9,alignItems:'center',justifyContent:'center'}}>
            {mobileOpen?<X size={19}/>:<svg width="19" height="19" viewBox="0 0 19 19" fill="none"><rect x="2" y="3.5" width="15" height="2" rx="1" fill="#f0ede8"/><rect x="2" y="8.5" width="11" height="2" rx="1" fill="rgba(240,237,232,.45)"/><rect x="2" y="13.5" width="15" height="2" rx="1" fill="#f0ede8"/></svg>}
          </button>
        </div>
        <AnimatePresence>
          {mobileOpen&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} transition={{duration:.28,ease:[.22,1,.36,1]}}
            style={{position:'absolute',top:NAV_H,left:0,right:0,background:'rgba(8,7,4,.97)',backdropFilter:'blur(22px)',borderBottom:'1px solid var(--b)',overflow:'hidden',zIndex:300,display:'flex',flexDirection:'column',padding:'8px 18px 16px',gap:2}}>
            {navLinks.map(({label,action})=><button key={label} onClick={()=>{action();setMobileOpen(false)}} style={{background:'none',border:'none',textAlign:'left',padding:'10px 7px',fontSize:14,fontWeight:500,color:'var(--tm)',cursor:'pointer',fontFamily:'var(--f)',borderRadius:9}}>{label}</button>)}
            <div style={{height:1,background:'var(--b)',margin:'5px 0'}}/>
            <div style={{display:'flex',gap:8}}>
              {isAuthenticated?<button onClick={()=>{handleLogout();setMobileOpen(false)}} style={{flex:1,background:G,border:'none',borderRadius:10,padding:'11px',fontSize:12.5,fontWeight:700,color:'#0d0b08',cursor:'pointer',fontFamily:'var(--f)'}}>Log Out</button>:<>
                <button onClick={()=>{navigate('/login');setMobileOpen(false)}} style={{flex:1,background:'var(--s)',border:'1px solid var(--b)',borderRadius:10,padding:'11px',fontSize:12.5,fontWeight:600,color:'var(--t)',cursor:'pointer',fontFamily:'var(--f)'}}>Log In</button>
                <button onClick={()=>{navigate('/login?tab=signup');setMobileOpen(false)}} style={{flex:1,background:G,border:'none',borderRadius:10,padding:'11px',fontSize:12.5,fontWeight:700,color:'#0d0b08',cursor:'pointer',fontFamily:'var(--f)'}}>Sign Up</button>
              </>}
            </div>
          </motion.div>}
        </AnimatePresence>
      </motion.header>

      {/* BANNER */}
      <div style={{position:'sticky',top:NAV_H,zIndex:190,height:BANNER_H,background:'rgba(8,7,4,.95)',backdropFilter:'blur(18px)',borderBottom:'1px solid rgba(245,200,66,.06)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,flexWrap:'wrap',padding:'0 14px'}}>
          <div style={{display:'flex',alignItems:'center',gap:5,background:isOpen?'rgba(34,197,94,.08)':'rgba(239,68,68,.08)',border:`1px solid ${isOpen?'rgba(34,197,94,.22)':'rgba(239,68,68,.22)'}`,borderRadius:999,padding:'2px 10px'}}>
            <motion.div animate={{scale:[1,1.5,1]}} transition={{duration:1.8,repeat:Infinity}} style={{width:5,height:5,borderRadius:'50%',background:isOpen?'#22c55e':'#ef4444'}}/>
            <span style={s.label({color:isOpen?'#22c55e':'#ef4444',fontSize:8.5})}>{isOpen?'Open Now':'Closed'}</span>
          </div>
          <div style={{width:1,height:9,background:'var(--b)'}}/>
          <Clock size={9} color={G}/>
          {[{label:'Mon – Fri',hours:'10 AM – 10 PM'},{label:'Sat – Sun',hours:'11 AM – 8:30 PM'}].map(({label,hours})=>(
            <span key={label} style={{fontSize:10.5,color:'var(--tm)',whiteSpace:'nowrap',fontFamily:'var(--f)'}}><span style={{color:'var(--t)',fontWeight:600}}>{label}</span> {hours}</span>
          ))}
        </div>
      </div>

      {/* USER ROLE BADGE — only when authenticated + data loaded */}
      <AnimatePresence>
        {isAuthenticated&&currentUser&&<UserRoleBadge user={currentUser}/>}
      </AnimatePresence>

      {/* HERO */}
      <div style={{position:'relative',minHeight:'90vh',display:'flex',alignItems:'center',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 25% 55%,rgba(245,200,66,.08) 0%,transparent 52%), radial-gradient(ellipse at 78% 18%,rgba(245,200,66,.05) 0%,transparent 44%)',zIndex:0}}/>
        <div style={{position:'absolute',inset:0,backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 79px,rgba(255,255,255,.012) 80px),repeating-linear-gradient(90deg,transparent,transparent 79px,rgba(255,255,255,.012) 80px)',zIndex:0}}/>
        <motion.div className="pad" style={{y:heroY,opacity:heroO,position:'relative',zIndex:1,paddingTop:90,paddingBottom:90}}>
          <motion.div initial={{opacity:0,x:-14}} animate={{opacity:1,x:0}} transition={{delay:.28,duration:.55}} style={{display:'flex',alignItems:'center',gap:9,marginBottom:18}}>
            <div style={{width:28,height:1,background:`linear-gradient(90deg,${G},transparent)`,flexShrink:0}}/>
            <span style={s.label()}>The Crunch Fairview</span>
          </motion.div>
          <motion.h1 initial={{opacity:0,y:38}} animate={{opacity:1,y:0}} transition={{delay:.42,duration:.8,ease:[.22,1,.36,1]}}
            style={{fontFamily:'var(--f)',fontSize:'clamp(64px,11.5vw,136px)',fontWeight:800,color:'var(--t)',margin:'0 0 20px',lineHeight:.88,letterSpacing:'-.03em'}}>
            Our<br/><em style={{color:G,fontStyle:'italic'}}>Menu.</em>
          </motion.h1>
          <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:.6}} style={s.body({fontSize:'clamp(13px,1.3vw,14.5px)',maxWidth:320,marginBottom:36})}>
            Fresh, hot, and fan-favorite — discover what makes The Crunch unforgettable.
          </motion.p>
          <motion.div initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} transition={{delay:.52}} style={{position:'relative',width:'min(340px,100%)'}}>
            <Search size={12} style={{position:'absolute',left:16,top:'50%',transform:'translateY(-50%)',color:searchFocused?'rgba(245,200,66,.55)':'var(--td)',pointerEvents:'none',zIndex:1,transition:'color .18s'}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search the menu…"
              onFocus={()=>setSearchFocused(true)} onBlur={()=>setSearchFocused(false)}
              style={{width:'100%',padding:'12px 40px 12px 40px',borderRadius:12,border:`1px solid ${searchFocused?'rgba(245,200,66,.32)':'var(--b)'}`,fontSize:13,outline:'none',background:searchFocused?'rgba(255,255,255,.07)':'rgba(255,255,255,.04)',backdropFilter:'blur(14px)',boxSizing:'border-box',fontFamily:'var(--f)',color:'var(--t)',transition:'border-color .18s,background .18s',boxShadow:searchFocused?'0 0 0 3px rgba(245,200,66,.05)':'none'}}/>
            {search&&<button onClick={()=>setSearch('')} style={{position:'absolute',right:13,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--td)',display:'flex',alignItems:'center'}}><X size={12}/></button>}
          </motion.div>
        </motion.div>
        <motion.div initial={{scaleX:0}} animate={{scaleX:1}} transition={{delay:.95,duration:1.1,ease:[.22,1,.36,1]}} style={{position:'absolute',bottom:0,left:0,right:0,height:1,background:'linear-gradient(90deg,transparent,rgba(245,200,66,.22) 30%,rgba(245,200,66,.22) 70%,transparent)',transformOrigin:'left',zIndex:1}}/>
      </div>

      {/* TABS */}
      <div style={{position:'sticky',top:tabTop,zIndex:180,background:'rgba(6,5,3,.97)',backdropFilter:'blur(22px)',borderBottom:'1px solid var(--b)'}}>
        <div className="pad tabs">
          {CATEGORIES.map(cat=>(
            <button key={cat} onClick={()=>setCategory(cat)}
              style={{position:'relative',padding:'13px 16px',border:'none',background:'none',cursor:'pointer',fontWeight:category===cat?700:400,fontSize:12.5,fontFamily:'var(--f)',whiteSpace:'nowrap',color:category===cat?G:'var(--td)',transition:'color .18s',display:'flex',alignItems:'center',gap:4}}>
              {cat==='Drinks'&&<Droplets size={10} color={category===cat?G:'var(--td)'}/>}
              {cat}
              {category===cat&&<motion.div layoutId="tab-ind" style={{position:'absolute',bottom:0,left:6,right:6,height:2,background:G,borderRadius:'2px 2px 0 0'}}/>}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {category==='Drinks'&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} style={{overflow:'hidden',background:'rgba(245,200,66,.02)',borderBottom:'1px solid rgba(245,200,66,.06)'}}>
          <div className="pad" style={{paddingTop:8,paddingBottom:8,display:'flex',alignItems:'center',gap:8}}>
            <Droplets size={11} color={G}/><span style={s.body({fontSize:11.5})}>Fruit Soda available in <strong style={{color:G}}>16oz ({fmtPHP(50)})</strong> and <strong style={{color:G}}>22oz ({fmtPHP(60)})</strong>.</span>
          </div>
        </motion.div>}
      </AnimatePresence>

      {/* CONTENT */}
      <div className="pad" style={{paddingTop:52,paddingBottom:90,position:'relative',zIndex:1}}>

        {/* Featured */}
        {!search&&!loadingP&&topPick&&(
          <Reveal style={{marginBottom:64}}>
            <motion.div whileHover="hov" style={{borderRadius:24,overflow:'hidden',position:'relative',cursor:'pointer',background:'#080604',aspectRatio:'21/9',minHeight:240,maxHeight:420}}>
              <motion.div variants={{hov:{scale:1.05}}} transition={{duration:.65,ease:[.22,1,.36,1]}} style={{position:'absolute',inset:0}}>
                <Img src={topPick.img||PLACEHOLDER} alt={topPick.name} style={{filter:'brightness(.7) saturate(1.1)'}}/>
              </motion.div>
              <div style={{position:'absolute',inset:0,background:'linear-gradient(105deg,rgba(5,4,2,.95) 0%,rgba(5,4,2,.4) 50%,rgba(5,4,2,.08) 100%)'}}/>
              <div style={{position:'absolute',top:24,left:28}}>
                <div style={{display:'inline-flex',alignItems:'center',gap:7,background:'var(--gd)',border:'1px solid var(--gb)',borderRadius:999,padding:'5px 14px',backdropFilter:'blur(10px)'}}>
                  <Crown size={9} color={G}/><span style={s.label()}>Top Pick</span>
                </div>
              </div>
              <div style={{position:'absolute',bottom:'clamp(18px,3.5vw,32px)',left:'clamp(18px,2.8vw,32px)',right:'clamp(18px,2.8vw,32px)'}}>
                <motion.h2 variants={{hov:{x:5}}} transition={{duration:.25}} style={{fontFamily:'var(--f)',margin:'0 0 7px',fontSize:'clamp(22px,4vw,52px)',fontWeight:800,color:'var(--t)',lineHeight:1.05,letterSpacing:'-.025em'}}>{topPick.name}</motion.h2>
                <p style={s.body({marginBottom:16,maxWidth:440,fontSize:'clamp(11.5px,1vw,13.5px)'})}>{topPick.description}</p>
                <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                  <span style={s.body({fontSize:11.5})}>{topPick.category}</span>
                  <span style={{fontFamily:'var(--f)',fontSize:'clamp(18px,2.2vw,26px)',fontWeight:800,color:G,letterSpacing:'-.02em'}}>{fmtPHP(topPick.price)}</span>
                  <motion.button whileHover={{scale:1.05}} whileTap={{scale:.95}} onClick={handleOrder} style={{marginLeft:'auto',background:G,border:'none',borderRadius:11,padding:'clamp(9px,1.1vw,12px) clamp(18px,2vw,28px)',fontSize:11.5,fontWeight:700,color:'#0d0b08',cursor:'pointer',fontFamily:'var(--f)',letterSpacing:'.04em'}}>Order Now</motion.button>
                </div>
              </div>
            </motion.div>
          </Reveal>
        )}

        {!loadingP&&<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:28}}>
          <div style={{width:24,height:1,background:`linear-gradient(90deg,${G},transparent)`,flexShrink:0}}/>
          <span style={s.label({color:'var(--td)',fontSize:8.5})}>{filtered.length} item{filtered.length!==1?'s':''}</span>
          <div style={{flex:1,height:1,background:'var(--b)'}}/>
        </div>}

        {loadingP?<div className="g2">{Array.from({length:6}).map((_,i)=><Skel key={i} h={400}/>)}</div>:(
          <AnimatePresence mode="wait"><div key={category+search} className="g2">{filtered.map((p,i)=><ProductCard key={p.id} product={p} index={i} onOrder={handleOrder}/>)}</div></AnimatePresence>
        )}

        {!loadingP&&filtered.length===0&&(
          <motion.div initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} style={{textAlign:'center',padding:'70px 0'}}>
            <p style={{fontFamily:'var(--f)',fontSize:20,fontWeight:700,color:'var(--tm)',marginBottom:5}}>Nothing found</p>
            <p style={s.body({fontSize:12.5})}>Try a different search or category</p>
            {search&&<motion.button whileHover={{scale:1.04}} whileTap={{scale:.96}} onClick={()=>setSearch('')} style={{marginTop:16,background:'var(--gd)',border:'1px solid var(--gb)',borderRadius:10,padding:'8px 20px',fontSize:11.5,fontWeight:600,color:G,cursor:'pointer',fontFamily:'var(--f)'}}>Clear search</motion.button>}
          </motion.div>
        )}

        {/* Promos */}
        <Reveal style={{marginTop:88}}>
          <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10}}><div style={{width:24,height:1,background:`linear-gradient(90deg,${G},transparent)`}}/><span style={s.label()}>Year-Round Events</span></div>
          <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:14,marginBottom:36}}>
            <h2 style={{fontFamily:'var(--f)',fontSize:'clamp(28px,4vw,50px)',fontWeight:800,color:'var(--t)',letterSpacing:'-.02em',lineHeight:1.05}}>Deals &amp; <em style={{color:G,fontStyle:'italic'}}>Promos</em></h2>
            <p style={s.body({maxWidth:220,fontSize:12.5})}>Holiday specials, payday bundles, and limited-time flavors.</p>
          </div>
          {loadingR?<div className="gp">{Array.from({length:3}).map((_,i)=><Skel key={i} h={280}/>)}</div>:promos.length===0?<p style={{textAlign:'center',padding:'50px 0',...s.body({fontSize:13.5})}}>No active promos right now. Check back soon!</p>:(
            <>
              {promos.filter(p=>p.highlight).length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,500px),1fr))',gap:18,marginBottom:18}}>{promos.filter(p=>p.highlight).map((p,i)=><PromoCard key={p.id} promo={p} index={i} large/>)}</div>}
              {promos.filter(p=>!p.highlight).length>0&&<div className="gp">{promos.filter(p=>!p.highlight).map((p,i)=><PromoCard key={p.id} promo={p} index={promos.filter(x=>x.highlight).length+i}/>)}</div>}
            </>
          )}
        </Reveal>

        {/* Flavors */}
        {(loadingF||flavors.length>0)&&(
          <Reveal style={{marginTop:88}}>
            <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10}}><div style={{width:24,height:1,background:`linear-gradient(90deg,${G},transparent)`}}/><span style={s.label()}>Available in every chicken</span></div>
            <h2 style={{fontFamily:'var(--f)',fontSize:'clamp(28px,4vw,50px)',fontWeight:800,color:'var(--t)',letterSpacing:'-.02em',lineHeight:1.05,marginBottom:8}}>Signature <em style={{color:G,fontStyle:'italic'}}>Flavors</em></h2>
            <p style={s.body({maxWidth:340,marginBottom:28,fontSize:12.5})}>Tap any flavor to preview it.</p>
            {loadingF?<div className="gf">{Array.from({length:6}).map((_,i)=><Skel key={i} h={46} r={12}/>)}</div>:(
              <div className="gf">{flavors.map((f,i)=><FlavorCard key={f.name} flavor={f} index={i} expanded={expandedFlavor===f.name} onToggle={()=>setExpandedFlavor(expandedFlavor===f.name?null:f.name)}/>)}</div>
            )}
          </Reveal>
        )}

        {/* Full Menu */}
        {(loadingM||menuSections.length>0)&&(
          <Reveal style={{marginTop:88}}>
            <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:10}}><div style={{width:24,height:1,background:`linear-gradient(90deg,${G},transparent)`}}/><span style={s.label()}>Full Menu</span></div>
            <h2 style={{fontFamily:'var(--f)',fontSize:'clamp(28px,4vw,50px)',fontWeight:800,color:'var(--t)',letterSpacing:'-.02em',lineHeight:1.05,marginBottom:36}}>Everything <em style={{color:G,fontStyle:'italic'}}>We Offer</em></h2>
            {loadingM?<div className="g2m">{Array.from({length:4}).map((_,i)=><Skel key={i} h={300}/>)}</div>:<div className="g2m">{menuSections.map((sec,i)=><MenuCard key={sec.id} section={sec} delay={i*.06}/>)}</div>}
          </Reveal>
        )}
      </div>

      {/* FOOTER */}
      <footer style={{borderTop:'1px solid var(--b)',padding:'clamp(32px,5vw,48px) 0 32px',position:'relative',zIndex:1}}>
        <div className="pad">
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:28,marginBottom:36}}>
            <div>
              <span style={{fontFamily:'var(--f)',fontWeight:800,fontSize:17,color:'var(--t)'}}>The <span style={{color:G}}>Crunch</span></span>
              <p style={s.body({fontSize:12.5,marginBottom:12,marginTop:6,maxWidth:190})}>6 Falcon St., cor Dahlia Fairview,<br/>Quezon City, Philippines</p>
              <motion.a href="https://www.google.com/maps/place/The+Crunch+-+Fairview+Branch/@14.7002687,121.0662915,21z" target="_blank" rel="noopener noreferrer" whileHover={{scale:1.03}} whileTap={{scale:.97}}
                style={{display:'inline-flex',alignItems:'center',gap:6,background:'var(--gd)',border:'1px solid var(--gb)',borderRadius:9,padding:'6px 12px',textDecoration:'none'}}>
                <MapPin size={11} color={G}/><span style={{fontSize:11.5,fontWeight:600,color:G,fontFamily:'var(--f)'}}>View on Google Maps</span>
              </motion.a>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <span style={s.label({color:'var(--td)'})}>Follow Us</span>
              {[{label:'Instagram',href:'https://www.instagram.com/thecrunchfairview'},{label:'Facebook',href:'https://www.facebook.com/thecrunchfairview'}].map(({label,href})=>(
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                  style={{fontFamily:'var(--f)',fontSize:15,fontWeight:600,color:'var(--tm)',textDecoration:'none',transition:'color .18s'}}
                  onMouseEnter={e=>e.currentTarget.style.color=G} onMouseLeave={e=>e.currentTarget.style.color='var(--tm)'}>
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div style={{paddingTop:18,borderTop:'1px solid rgba(255,255,255,.035)',textAlign:'center'}}>
            <span style={s.body({fontSize:11})}>© {new Date().getFullYear()} The Crunch Fairview. All rights reserved.</span>
          </div>
        </div>
      </footer>

      <FeedbackButton/>
    </div>
  )
}