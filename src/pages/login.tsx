import {
  useEffect, useState,
  type ChangeEvent, type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { authApi } from "../lib/api";
import { useAuth } from "../context/authcontext";
import crunchImg from "../assets/img/crunch22.png";
import crunchLogo from "../assets/img/crunchlogo.png";

/* ─── tokens ─── */
const G    = "#FFD65A";
const BG   = "#131010";
const CARD = "rgba(19,16,16,0.78)";
const SURF = "rgba(255,214,90,0.06)";
const BORD = "rgba(255,214,90,0.14)";
const T1   = "#F5F3EE";
const T2   = "rgba(245,243,238,0.55)";
const T3   = "rgba(245,243,238,0.30)";
const ERR  = "#e05c5c";
const OK   = "#4ade80";

const ROLE_MAP: Record<string, string> = {
  administrator: "/dashboard", cashier: "/orders",
  cook: "/orders", inventory_manager: "/inventory", customer: "/products",
};
const DEV = [{ email: "admin@crunch.dev", password: "Crunch@2024!", role: "administrator", username: "Dev Admin" }];
type Mode = "signin" | "signup";
const MAX = 50;
const SPRING = { type: "spring", stiffness: 360, damping: 30 } as const;

/* ─── Field ─── */
function Field({ label, name, type = "text", value, onChange, placeholder, autoComplete, icon, rightSlot, maxLength, required }: {
  label: string; name: string; type?: string; value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string; autoComplete?: string; icon?: ReactNode;
  rightSlot?: ReactNode; maxLength?: number; required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: focused ? G : T3, transition: "color 0.18s" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", background: focused ? "rgba(255,214,90,0.08)" : SURF, border: `1px solid ${focused ? "rgba(255,214,90,0.36)" : BORD}`, borderRadius: 12, transition: "all 0.2s", padding: "0 13px" }}>
        {icon && <span style={{ color: focused ? G : T3, display: "flex", flexShrink: 0, transition: "color 0.18s" }}>{icon}</span>}
        <input name={name} type={type} value={value} onChange={onChange} placeholder={placeholder}
          autoComplete={autoComplete} required={required} maxLength={maxLength}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ flex: 1, border: "none", background: "transparent", color: T1, padding: icon ? "13px 9px" : "13px 0", fontSize: 13.5, fontFamily: "inherit", outline: "none", width: "100%" }} />
        {rightSlot && <span style={{ display: "flex", flexShrink: 0 }}>{rightSlot}</span>}
      </div>
    </div>
  );
}

/* ─── Password Field ─── */
function PwField({ label, name, value, onChange, placeholder, autoComplete, maxLength }: {
  label: string; name: string; value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string; autoComplete: string; maxLength?: number;
}) {
  const [vis, setVis] = useState(false);
  return (
    <Field label={label} name={name} type={vis ? "text" : "password"} value={value}
      onChange={onChange} placeholder={placeholder} autoComplete={autoComplete}
      maxLength={maxLength} required icon={<Lock size={14} />}
      rightSlot={
        <button type="button" onClick={() => setVis(v => !v)}
          style={{ border: "none", background: "none", color: T3, cursor: "pointer", display: "flex", padding: 0, transition: "color 0.15s" }}
          onMouseEnter={e => (e.currentTarget.style.color = T2)}
          onMouseLeave={e => (e.currentTarget.style.color = T3)}>
          {vis ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      } />
  );
}

/* ─── Gold Button ─── */
function GoldBtn({ children, disabled, onClick, type = "submit" }: {
  children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "submit" | "button";
}) {
  return (
    <motion.button type={type} onClick={onClick} disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.015, boxShadow: "0 10px 36px rgba(255,214,90,0.26)" }}
      whileTap={disabled ? {} : { scale: 0.985 }}
      style={{ border: "none", borderRadius: 12, background: disabled ? "rgba(255,214,90,0.14)" : "linear-gradient(135deg,#ffe270,#FFD65A,#d4a800)", color: disabled ? "rgba(255,255,255,0.22)" : "#1a1000", padding: "14px", fontWeight: 800, fontSize: 13.5, cursor: disabled ? "not-allowed" : "pointer", width: "100%", letterSpacing: "0.07em", fontFamily: "inherit" }}>
      {children}
    </motion.button>
  );
}

/* ─── Modal ─── */
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(10,8,8,0.85)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <motion.div initial={{ opacity: 0, y: 22, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }} transition={SPRING}
            style={{ width: "min(400px,100%)", background: "rgba(22,18,18,0.98)", border: `1px solid ${BORD}`, borderRadius: 20, boxShadow: "0 40px 80px rgba(0,0,0,0.75)", padding: "28px 24px 22px" }}>
            <h2 style={{ margin: "0 0 14px", color: T1, fontSize: 17, fontWeight: 700 }}>{title}</h2>
            {children}
            <button type="button" onClick={onClose}
              style={{ marginTop: 12, width: "100%", background: "none", border: `1px solid ${BORD}`, borderRadius: 10, color: T3, cursor: "pointer", fontSize: 13, fontFamily: "inherit", padding: "10px", transition: "border-color 0.15s,color 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T2; e.currentTarget.style.color = T2; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BORD; e.currentTarget.style.color = T3; }}>Close</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Google Icon ─── */
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

/* ─── Main ─── */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });

  const [vOpen, setVOpen] = useState(false);
  const [vEmail, setVEmail] = useState("");
  const [vCode, setVCode] = useState("");
  const [vErr, setVErr] = useState("");
  const [vOk, setVOk] = useState("");
  const [vBusy, setVBusy] = useState(false);
  const [vResend, setVResend] = useState(false);

  const [fOpen, setFOpen] = useState(false);
  const [fStep, setFStep] = useState<1 | 2>(1);
  const [fEmail, setFEmail] = useState("");
  const [fCode, setFCode] = useState("");
  const [fPw, setFPw] = useState("");
  const [fCPw, setFCPw] = useState("");
  const [fMsg, setFMsg] = useState("");
  const [fErr, setFErr] = useState("");
  const [fBusy, setFBusy] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("tab") === "signup") switchMode("signup");
    const e = p.get("verifyEmail");
    if (e) { setVEmail(e.trim().toLowerCase()); setVOpen(true); }
  }, [location.search]);

  const switchMode = (next: Mode) => { setMode(next); setError(""); setForm(c => ({ ...c, password: "", confirmPassword: "" })); };
  const ch = (e: ChangeEvent<HTMLInputElement>) => setForm(c => ({ ...c, [e.target.name]: e.target.value }));

  const openForgot = () => { setFEmail(form.email.trim().toLowerCase()); setFCode(""); setFPw(""); setFCPw(""); setFMsg(""); setFErr(""); setFStep(1); setFOpen(true); };
  const closeForgot = () => { setFOpen(false); setFStep(1); setFCode(""); setFPw(""); setFCPw(""); setFMsg(""); setFErr(""); };

  const sendReset = async () => {
    if (!fEmail.trim()) { setFErr("Enter your email."); return; }
    setFBusy(true); setFErr(""); setFMsg("");
    try { const d = await authApi.forgotPassword(fEmail.trim().toLowerCase()); setFMsg(d.message || "Code sent if email exists."); setFStep(2); }
    catch (e: any) { setFErr(e.message || "Could not send code."); }
    finally { setFBusy(false); }
  };

  const doReset = async () => {
    if (fPw.length < 8) { setFErr("Password must be at least 8 characters."); return; }
    if (fPw !== fCPw) { setFErr("Passwords don't match."); return; }
    setFBusy(true); setFErr(""); setFMsg("");
    try { await authApi.resetPassword(fEmail.trim().toLowerCase(), fCode, fPw); closeForgot(); switchMode("signin"); setError("Password reset. Sign in now."); }
    catch (e: any) { setFErr(e.message || "Could not reset password."); }
    finally { setFBusy(false); }
  };

  const verifyEmail = async () => {
    const cd = vCode.replace(/\D/g, "").slice(0, 6);
    if (cd.length !== 6) { setVErr("Enter the 6-digit code."); return; }
    setVBusy(true); setVErr(""); setVOk("");
    try { await authApi.verifyEmail(vEmail, cd); setVOk("Verified! You can sign in."); switchMode("signin"); setTimeout(() => { setVOpen(false); setVCode(""); }, 1200); }
    catch (e: any) { setVErr(e.message || "Could not verify."); }
    finally { setVBusy(false); }
  };

  const resendVerify = async () => {
    setVResend(true);
    try { await authApi.resendVerification(vEmail); setVOk("New code sent."); }
    catch (e: any) { setVErr(e.message || "Could not resend."); }
    finally { setVResend(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    if (mode === "signin") {
      const dev = DEV.find(a => a.email === form.email.trim().toLowerCase() && a.password === form.password);
      if (dev) { login({ token: "dev-token", username: dev.username, email: dev.email, role: dev.role, userId: "0", email_verified: true }); navigate(ROLE_MAP[dev.role] ?? "/", { replace: true }); setLoading(false); return; }
    }
    try {
      if (mode === "signin") {
        const d = await authApi.login(form.email, form.password);
        login({ token: d.token, username: d.username, email: d.email, role: d.role, userId: String(d.userId), email_verified: d.email_verified });
        navigate(ROLE_MAP[d.role] ?? "/", { replace: true }); return;
      }
      if (form.password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (form.password !== form.confirmPassword) throw new Error("Passwords don't match.");
      const reg = await authApi.register(form.name, form.email, form.password);
      const em = form.email.trim().toLowerCase();
      setVEmail(em); setVCode(""); setVErr(""); setVOk("Code sent. Check your email.");
      setVOpen(Boolean(reg.requiresEmailVerification));
    } catch (err: any) {
      if (mode === "signin" && err?.status === 403 && err?.data?.requiresEmailVerification) {
        const em = err.data.email?.trim().toLowerCase() || form.email.trim().toLowerCase();
        setVEmail(em); setVCode(""); setVErr(err.message || "Verify your email first."); setVOk(""); setVOpen(true); setError(""); return;
      }
      setError(err.message || "Authentication failed.");
    } finally { setLoading(false); }
  };

  const isSignup = mode === "signup";
  const codeInputStyle: React.CSSProperties = {
    width: "100%", borderRadius: 12, border: `1px solid ${BORD}`, background: SURF,
    color: G, padding: "14px", fontSize: 22, fontWeight: 700, fontFamily: "inherit",
    textAlign: "center", letterSpacing: "0.5em", outline: "none", boxSizing: "border-box", marginBottom: 12,
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        .cr *{font-family:'Inter',sans-serif;}
        input::placeholder{color:rgba(245,243,238,0.20);}
        ::-webkit-scrollbar{display:none;}
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active{
          -webkit-box-shadow:0 0 0 999px rgba(30,22,22,0.95) inset !important;
          -webkit-text-fill-color:#F5F3EE !important;
          caret-color:#F5F3EE;
          transition:background-color 9999s ease-in-out 0s;
        }
      `}</style>

      <div className="cr" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "28px 16px", background: BG, position: "relative", overflow: "hidden" }}>

        {/* ── Background: sharp left → blurred right ── */}
        <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden" }}>

          {/* Layer 1 — sharp base image (visible on the left) */}
          <img
            src={crunchImg}
            alt=""
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "center",
              filter: "blur(1px) saturate(0.55) brightness(0.38)",
            }}
          />

          {/* Layer 2 — blurred image masked to reveal only on the right */}
          <div
            style={{
              position: "absolute", inset: 0,
              backgroundImage: `url(${crunchImg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(7px) saturate(0.55) brightness(0.38)",
              transform: "scale(1.06)",
              WebkitMaskImage: "linear-gradient(to right, transparent 15%, rgba(0,0,0,0.5) 40%, black 65%)",
              maskImage:       "linear-gradient(to right, transparent 15%, rgba(0,0,0,0.5) 40%, black 65%)",
            }}
          />

          {/* Color overlays — preserved from original */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(19,16,16,0.72) 0%, rgba(232,153,81,0.18) 50%, rgba(19,16,16,0.85) 100%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 20%, rgba(255,214,90,0.10) 0%, transparent 55%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 75% 80%, rgba(232,153,81,0.14) 0%, transparent 50%)" }} />
        </div>

        {/* ── Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
          style={{ position: "relative", zIndex: 1, width: "min(415px,100%)", background: CARD, border: `1px solid ${BORD}`, borderRadius: 24, overflow: "hidden", backdropFilter: "blur(24px) saturate(1.4)", boxShadow: "0 0 0 1px rgba(255,214,90,0.06), 0 32px 80px rgba(0,0,0,0.65)" }}>

          {/* Image header */}
          <div style={{ position: "relative", height: 180, overflow: "hidden" }}>
            <img src={crunchImg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 55%", filter: "brightness(0.42) saturate(0.55)" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(232,153,81,0.18) 0%, transparent 35%, rgba(19,16,16,0.70) 72%, rgba(19,16,16,0.97) 100%)" }} />
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, rgba(255,214,90,0.7), rgba(232,153,81,0.5), transparent)" }} />

            {/* Logo */}
            <div style={{ position: "absolute", top: 14, left: 16, display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{ width: 38, height: 38, display: "grid", placeItems: "center" }}>
                <img src={crunchLogo} alt="Logo" style={{ width: 38, height: 38, objectFit: "contain" }} />
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: T1, letterSpacing: "-0.02em" }}>The Crunch Fairview</div>
                <div style={{ fontSize: 9.5, color: "rgba(255,214,90,0.55)", letterSpacing: "0.10em", marginTop: 2 }}>FAIRVIEW DAHLIA QUEZON CITY</div>
              </div>
            </div>

            {/* Heading */}
            <div style={{ position: "absolute", bottom: 16, left: 18 }}>
              <AnimatePresence mode="wait">
                <motion.div key={mode} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.22 }}>
                  <h1 style={{ margin: 0, color: T1, fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>
                    {isSignup ? "Create account" : "Sign in"}
                  </h1>
                  <p style={{ margin: "3px 0 0", color: T2, fontSize: 12.5 }}>
                    {isSignup ? "Staff access for The Crunch Fairview" : "Welcome back — your dashboard awaits"}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Form body */}
          <div style={{ padding: "22px 22px 20px" }}>
            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: "auto", marginBottom: 14 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  style={{ color: ERR, fontSize: 12, textAlign: "center", background: "rgba(224,92,92,0.09)", border: "1px solid rgba(224,92,92,0.18)", borderRadius: 8, padding: "8px 12px" }}>{error}</motion.p>
              )}
            </AnimatePresence>

            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <AnimatePresence>
                {isSignup && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}>
                    <Field label="Full Name" name="name" value={form.name} onChange={ch} placeholder="Your full name" required icon={<User size={14} />} maxLength={MAX} />
                  </motion.div>
                )}
              </AnimatePresence>

              <Field label="Email" name="email" type="email" value={form.email} onChange={ch} placeholder="you@crunch.ph" autoComplete="email" required icon={<Mail size={14} />} maxLength={MAX} />
              <PwField label="Password" name="password" value={form.password} onChange={ch} placeholder="Your password" autoComplete={isSignup ? "new-password" : "current-password"} maxLength={MAX} />

              <AnimatePresence>
                {isSignup && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}>
                    <PwField label="Confirm Password" name="confirmPassword" value={form.confirmPassword} onChange={ch} placeholder="Re-enter password" autoComplete="new-password" maxLength={MAX} />
                  </motion.div>
                )}
              </AnimatePresence>

              {!isSignup && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4 }}>
                  <button type="button" onClick={openForgot}
                    style={{ border: "none", background: "none", color: T3, cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: 0, transition: "color 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.color = G)}
                    onMouseLeave={e => (e.currentTarget.style.color = T3)}>Forgot password?</button>
                </div>
              )}

              <div style={{ marginTop: 4 }}>
                <GoldBtn disabled={loading}>
                  {loading ? (isSignup ? "Sending code…" : "Signing in…") : (isSignup ? "CREATE ACCOUNT" : "SIGN IN")}
                </GoldBtn>
              </div>
            </form>

            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
              <div style={{ flex: 1, height: 1, background: BORD }} />
              <span style={{ fontSize: 11, color: T3 }}>or</span>
              <div style={{ flex: 1, height: 1, background: BORD }} />
            </div>

            <motion.button type="button"
              whileHover={{ scale: 1.008, borderColor: "rgba(255,214,90,0.24)" }}
              whileTap={{ scale: 0.993 }}
              style={{ width: "100%", border: `1px solid ${BORD}`, borderRadius: 12, background: SURF, color: T1, padding: "13px", fontFamily: "inherit", fontWeight: 500, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, transition: "border-color 0.18s, background 0.18s" }}>
              <GoogleIcon /> Continue with Google
            </motion.button>

            <p style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: T3 }}>
              {isSignup ? "Already have an account? " : "No account yet? "}
              <button type="button" onClick={() => switchMode(isSignup ? "signin" : "signup")}
                style={{ border: "none", background: "none", color: G, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", padding: 0 }}>
                {isSignup ? "Sign in" : "Sign up free"}
              </button>
            </p>
            <p style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: T3 }}>Trouble signing in?</p>
          </div>
        </motion.div>
      </div>

      {/* ── Verify Modal ── */}
      <Modal open={vOpen} onClose={() => { setVOpen(false); setVCode(""); setVOk(""); setVErr(""); }} title="Verify your email">
        <p style={{ margin: "0 0 14px", color: T2, fontSize: 13, lineHeight: 1.7 }}>
          Code sent to <strong style={{ color: T1 }}>{vEmail || "your email"}</strong>. Expires in 10 minutes.
        </p>
        {vErr && <p style={{ margin: "0 0 8px", color: ERR, fontSize: 12, textAlign: "center" }}>{vErr}</p>}
        {vOk  && <p style={{ margin: "0 0 8px", color: OK,  fontSize: 12, textAlign: "center" }}>{vOk}</p>}
        <input value={vCode} onChange={e => { setVCode(e.target.value.replace(/\D/g,"").slice(0,6)); setVErr(""); }}
          inputMode="numeric" maxLength={6} placeholder="• • • • • •" style={codeInputStyle} />
        <div style={{ display: "flex", gap: 8 }}>
          <GoldBtn onClick={verifyEmail} disabled={vBusy || vCode.length !== 6} type="button">{vBusy ? "Verifying…" : "Verify"}</GoldBtn>
          <button type="button" onClick={resendVerify} disabled={vResend}
            style={{ flex: 1, borderRadius: 12, border: `1px solid ${BORD}`, background: SURF, color: T1, padding: "12px", fontWeight: 600, fontFamily: "inherit", cursor: vResend ? "not-allowed" : "pointer", opacity: vResend ? 0.5 : 1, fontSize: 13 }}>
            {vResend ? "Sending…" : "Resend"}
          </button>
        </div>
      </Modal>

      {/* ── Forgot Password Modal ── */}
      <Modal open={fOpen} onClose={closeForgot} title={fStep === 1 ? "Reset your password" : "Set new password"}>
        <p style={{ margin: "0 0 14px", color: T2, fontSize: 13, lineHeight: 1.7 }}>
          {fStep === 1 ? "Enter your email and we'll send a reset code." : "Enter the code and your new password."}
        </p>
        {fErr && <p style={{ margin: "0 0 8px", color: ERR, fontSize: 12, textAlign: "center" }}>{fErr}</p>}
        {fMsg && <p style={{ margin: "0 0 8px", color: OK,  fontSize: 12, textAlign: "center" }}>{fMsg}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <Field label="Email" name="fe" type="email" value={fEmail} onChange={e => { setFEmail(e.target.value); setFErr(""); }} placeholder="you@crunch.ph" icon={<Mail size={14} />} />
          {fStep === 2 && (<>
            <Field label="Reset Code" name="fc" value={fCode} onChange={e => { setFCode(e.target.value.replace(/\D/g,"").slice(0,6)); setFErr(""); }} placeholder="6-digit code" icon={<Lock size={14} />} />
            <PwField label="New Password" name="fp" value={fPw} onChange={e => { setFPw(e.target.value); setFErr(""); }} placeholder="Min 8 characters" autoComplete="new-password" />
            <PwField label="Confirm Password" name="fcp" value={fCPw} onChange={e => { setFCPw(e.target.value); setFErr(""); }} placeholder="Re-enter password" autoComplete="new-password" />
          </>)}
        </div>
        <div style={{ marginTop: 18 }}>
          <GoldBtn type="button" onClick={fStep === 1 ? sendReset : doReset}
            disabled={fBusy || !fEmail.trim() || (fStep === 2 && (!fCode || !fPw || !fCPw))}>
            {fBusy ? (fStep === 1 ? "Sending…" : "Resetting…") : (fStep === 1 ? "Send reset code" : "Reset password")}
          </GoldBtn>
        </div>
      </Modal>
    </>
  );
}