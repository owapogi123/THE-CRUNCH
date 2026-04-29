import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authApi } from "../lib/api";
import { useAuth } from "../context/authcontext";

if (typeof document !== "undefined" && !document.getElementById("login-fonts")) {
  const link = document.createElement("link");
  link.id = "login-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&display=swap";
  document.head.appendChild(link);
}

const YELLOW = "#F5C518";
const YELLOW_DARK = "#C9A010";

const ROLE_MAP: Record<string, string> = {
  administrator: "/dashboard",
  cashier: "/orders",
  cook: "/orders",
  inventory_manager: "/inventory",
  customer: "/products",
};

const baseInputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: "11px 14px",
  color: "#fff",
  fontSize: 13,
  fontFamily: "'Poppins', sans-serif",
  fontWeight: 400,
  outline: "none",
  boxSizing: "border-box" as const,
  transition: "border-color 0.25s, background 0.25s, box-shadow 0.25s",
};

// ── Time-based greeting helpers ──────────────────────────────────────────────

interface TimeGreeting {
  title: string;
  sub: string;
  iconType: "sun" | "moon" | "sunset" | "sunrise" | "cloud";
}

function getTimeGreeting(): TimeGreeting {
  const h = new Date().getHours();

  if (h >= 5 && h <= 8)
    return {
      iconType: "sunrise",
      title: "Good morning, early bird.",
      sub: "The day is just beginning — let's make it great.",
    };
  if (h >= 9 && h <= 11)
    return {
      iconType: "sun",
      title: "Good morning!",
      sub: "How are you doing today?",
    };
  if (h === 12)
    return {
      iconType: "sun",
      title: "Good noon!",
      sub: "Grab a bite — then let's get to work.",
    };
  if (h >= 13 && h <= 16)
    return {
      iconType: "cloud",
      title: "Good afternoon.",
      sub: "Hope your day's going well so far.",
    };
  if (h >= 17 && h <= 20)
    return {
      iconType: "sunset",
      title: "Good evening.",
      sub: "Please fulfill your needs — we're here for you.",
    };
  if (h >= 21 && h <= 23)
    return {
      iconType: "moon",
      title: "Good night.",
      sub: "Working late? We've got you covered.",
    };
  // 0–4 (midnight to early morning)
  return {
    iconType: "moon",
    title: "Burning the midnight oil?",
    sub: "We're still here — whenever you need us.",
  };
}

function TimeIcon({ type }: { type: TimeGreeting["iconType"] }) {
  const stroke = YELLOW;
  const sw = "1.8";
  const lc = "round";
  const lj = "round";

  if (type === "sun")
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj}>
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    );

  if (type === "sunrise")
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj}>
        <path d="M17 18a5 5 0 0 0-10 0" />
        <line x1="12" y1="2" x2="12" y2="9" />
        <line x1="4.22" y1="10.22" x2="5.64" y2="11.64" />
        <line x1="1" y1="18" x2="3" y2="18" />
        <line x1="21" y1="18" x2="23" y2="18" />
        <line x1="18.36" y1="11.64" x2="19.78" y2="10.22" />
        <line x1="23" y1="22" x2="1" y2="22" />
        <polyline points="8 6 12 2 16 6" />
      </svg>
    );

  if (type === "sunset")
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj}>
        <path d="M17 18a5 5 0 0 0-10 0" />
        <line x1="12" y1="9" x2="12" y2="2" />
        <line x1="4.22" y1="10.22" x2="5.64" y2="11.64" />
        <line x1="1" y1="18" x2="3" y2="18" />
        <line x1="21" y1="18" x2="23" y2="18" />
        <line x1="18.36" y1="11.64" x2="19.78" y2="10.22" />
        <line x1="23" y1="22" x2="1" y2="22" />
        <polyline points="16 5 12 9 8 5" />
      </svg>
    );

  if (type === "moon")
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );

  // cloud (afternoon default)
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke={stroke} strokeWidth={sw} strokeLinecap={lc} strokeLinejoin={lj}>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

// ── Shared field wrapper ─────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
}
function Field({ label, children, extra }: FieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{
          fontFamily: "'Poppins', sans-serif",
          fontSize: 10,
          fontWeight: 500,
          color: "rgba(255,255,255,0.38)",
          letterSpacing: "0.9px",
          textTransform: "uppercase",
        }}>
          {label}
        </label>
        {extra}
      </div>
      {children}
    </div>
  );
}

// ── Framer Motion page variants ──────────────────────────────────────────────

const pageVariants = {
  enter: (dir: number) => ({
    rotateY: dir > 0 ? 80 : -80,
    opacity: 0,
    scale: 0.96,
  }),
  center: { rotateY: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({
    rotateY: dir > 0 ? -80 : 80,
    opacity: 0,
    scale: 0.96,
  }),
};

// ── Sign In Form ─────────────────────────────────────────────────────────────

function SignInForm({ formData, handleChange, handleSubmit, isLoading, error, showPassword, setShowPassword, goToSignUp }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginBottom: 26 }}>
        <p style={{
          fontFamily: "'Poppins', sans-serif", fontSize: 10, fontWeight: 600,
          color: YELLOW, letterSpacing: "1.6px", textTransform: "uppercase", margin: "0 0 10px",
        }}>Welcome back</p>
        <h1 style={{
          fontFamily: "'Poppins', sans-serif", fontSize: 26, fontWeight: 700,
          color: "#fff", margin: 0, lineHeight: 1.2, letterSpacing: "-0.3px",
        }}>
          Sign in to your<br />
          <span style={{ fontWeight: 300, fontStyle: "italic", color: "rgba(255,255,255,0.45)", fontSize: 24 }}>
            Account
          </span>
        </h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
        <AnimatePresence>
          {error && (
            <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ margin: 0, fontSize: 12, color: "#fca5a5", fontFamily: "'Poppins', sans-serif", textAlign: "center" }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <Field label="Email Address">
          <input className="lf-input" style={baseInputStyle}
            name="email" type="email" required autoComplete="email"
            value={formData.email} onChange={handleChange} placeholder="you@example.com" />
        </Field>

        <Field label="Password" extra={
          <a href="#" style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textDecoration: "none", fontFamily: "'Poppins', sans-serif" }}
            onMouseEnter={e => (e.currentTarget.style.color = YELLOW)}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}>
            Forgot password?
          </a>
        }>
          <div style={{ position: "relative" }}>
            <input className="lf-input" style={{ ...baseInputStyle, paddingRight: 42 }}
              name="password" type={showPassword ? "text" : "password"}
              required autoComplete="current-password"
              value={formData.password} onChange={handleChange} placeholder="••••••••" />
            <button type="button" className="lf-eye" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <button type="submit" className="lf-submit" disabled={isLoading} style={{ marginTop: 8 }}>
          {isLoading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: "'Poppins', sans-serif" }}>
        No account yet?{" "}
        <button type="button" onClick={goToSignUp} style={{
          background: "none", border: "none", color: YELLOW, fontWeight: 600,
          cursor: "pointer", fontSize: 12, fontFamily: "'Poppins', sans-serif",
        }}>
          Sign up
        </button>
      </p>
    </div>
  );
}

// ── Sign Up Form ─────────────────────────────────────────────────────────────

function SignUpForm({ formData, handleChange, handleSubmit, isLoading, error, showPassword, setShowPassword, showConfirm, setShowConfirm, goToSignIn }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontFamily: "'Poppins', sans-serif", fontSize: 10, fontWeight: 600,
          color: YELLOW, letterSpacing: "1.6px", textTransform: "uppercase", margin: "0 0 10px",
        }}>Get started</p>
        <h1 style={{
          fontFamily: "'Poppins', sans-serif", fontSize: 26, fontWeight: 700,
          color: "#fff", margin: 0, lineHeight: 1.2, letterSpacing: "-0.3px",
        }}>
          Create your<br />
          <span style={{ fontWeight: 300, fontStyle: "italic", color: "rgba(255,255,255,0.45)", fontSize: 24 }}>
            Account
          </span>
        </h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
        <AnimatePresence>
          {error && (
            <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ margin: 0, fontSize: 12, color: "#fca5a5", fontFamily: "'Poppins', sans-serif", textAlign: "center" }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <Field label="Full Name">
          <input className="lf-input" style={baseInputStyle}
            name="name" type="text" required autoComplete="name"
            value={formData.name} onChange={handleChange} placeholder="Your full name" />
        </Field>

        <Field label="Email">
          <input className="lf-input" style={baseInputStyle}
            name="email" type="email" required autoComplete="email"
            value={formData.email} onChange={handleChange} placeholder="you@example.com" />
        </Field>

        <Field label="Password">
          <div style={{ position: "relative" }}>
            <input className="lf-input" style={{ ...baseInputStyle, paddingRight: 42 }}
              name="password" type={showPassword ? "text" : "password"}
              required autoComplete="new-password"
              value={formData.password} onChange={handleChange} placeholder="Min. 8 characters" />
            <button type="button" className="lf-eye" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <Field label="Confirm Password">
          <div style={{ position: "relative" }}>
            <input className="lf-input" style={{ ...baseInputStyle, paddingRight: 42 }}
              name="confirmPassword" type={showConfirm ? "text" : "password"}
              required autoComplete="new-password"
              value={formData.confirmPassword} onChange={handleChange} placeholder="••••••••" />
            <button type="button" className="lf-eye" onClick={() => setShowConfirm(!showConfirm)}>
              {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <button type="submit" className="lf-submit" disabled={isLoading} style={{ marginTop: 6 }}>
          {isLoading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: "'Poppins', sans-serif" }}>
        Already have an account?{" "}
        <button type="button" onClick={goToSignIn} style={{
          background: "none", border: "none", color: YELLOW, fontWeight: 600,
          cursor: "pointer", fontSize: 12, fontFamily: "'Poppins', sans-serif",
        }}>
          Sign in
        </button>
      </p>
    </div>
  );
}

// ── Main Login Page ──────────────────────────────────────────────────────────

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [direction, setDirection] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "", confirmPassword: "", name: "" });

  // ── Real-time greeting — updates every minute ──
  const [greeting, setGreeting] = useState<TimeGreeting>(() => getTimeGreeting());

  useEffect(() => {
    const tick = () => setGreeting(getTimeGreeting());
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Tab from URL param ──
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("tab") === "signup") { setDirection(1); setIsLogin(false); }
  }, [location.search]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (isLogin) {
      try {
        const data = await authApi.login(formData.email, formData.password);
        login({
          token: data.token,
          username: data.username,
          role: data.role,
          userId: String(data.userId),
        });
        navigate(ROLE_MAP[data.role] ?? "/", { replace: true });
      } catch (err: any) {
        setError(err.message || "Invalid credentials.");
      } finally {
        setIsLoading(false);
      }
    } else {
      if (formData.password.length < 8) {
        setError("Password must be at least 8 characters.");
        setIsLoading(false);
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords don't match!");
        setIsLoading(false);
        return;
      }
      try {
        await authApi.register(formData.name, formData.email, formData.password);
        const data = await authApi.login(formData.email, formData.password);
        login({
          token: data.token,
          username: data.username,
          role: data.role,
          userId: String(data.userId),
        });
        navigate(ROLE_MAP[data.role] ?? "/products", { replace: true });
      } catch (err: any) {
        if (
          err.message?.toLowerCase().includes("login") ||
          err.message?.toLowerCase().includes("credential")
        ) {
          setError("");
          switchTab(true);
          setFormData({ email: formData.email, password: "", confirmPassword: "", name: "" });
        } else {
          setError(err.message || "Failed to register.");
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  const switchTab = (toLogin: boolean) => {
    setDirection(toLogin ? -1 : 1);
    setIsLogin(toLogin);
    setError("");
    setFormData({ email: "", password: "", confirmPassword: "", name: "" });
    setShowPassword(false);
    setShowConfirm(false);
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }

        .lf-input:focus {
          border-color: rgba(245,197,24,0.55) !important;
          background: rgba(255,255,255,0.11) !important;
          box-shadow: 0 0 0 3px rgba(245,197,24,0.08) !important;
        }
        .lf-input::placeholder {
          color: rgba(255,255,255,0.20);
          font-family: 'Poppins', sans-serif;
        }

        .lf-eye {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: rgba(255,255,255,0.25); display: flex; align-items: center; padding: 0;
          transition: color 0.2s;
        }
        .lf-eye:hover { color: ${YELLOW}; }

        .lf-submit {
          width: 100%; padding: 13px; border-radius: 10px; border: none;
          font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 13px;
          cursor: pointer; background: ${YELLOW}; color: #111;
          letter-spacing: 0.2px; transition: background 0.25s, transform 0.2s;
          position: relative; overflow: hidden;
        }
        .lf-submit:hover:not(:disabled) { background: ${YELLOW_DARK}; transform: translateY(-1px); }
        .lf-submit:active:not(:disabled) { transform: scale(0.985); }
        .lf-submit:disabled { opacity: 0.35; cursor: not-allowed; }
        .lf-submit::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          background-size: 200% 100%; animation: lf-shimmer 2.4s infinite;
        }
        @keyframes lf-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .lf-spine {
          position: absolute; left: 42%; top: 5%; bottom: 5%; width: 1px;
          background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.09) 20%, rgba(255,255,255,0.09) 80%, transparent);
          pointer-events: none; z-index: 10;
        }

        @media (max-width: 640px) {
          .lf-left { display: none !important; }
          .lf-book {
            max-width: 100% !important;
            border-radius: 16px !important;
            min-height: auto !important;
          }
          .lf-page-wrap { padding: 30px 22px 24px !important; }
        }
      `}</style>

      <div style={{
        minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Poppins', sans-serif",
        position: "relative", overflow: "hidden",
        padding: "20px 16px",
      }}>

        {/* ── Background ── */}
        <div style={{ position: "absolute", inset: 0 }}>
          <img src="/src/assets/img/crunch22.png" alt=""
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              filter: "blur(22px) brightness(0.30) saturate(0.60)",
              transform: "scale(1.1)",
            }}
          />
        </div>

        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(160deg, rgba(6,4,1,0.55) 0%, rgba(10,6,1,0.45) 50%, rgba(14,9,1,0.60) 100%)",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 50% 105%, rgba(200,130,0,0.14) 0%, transparent 55%)",
          pointerEvents: "none",
        }} />

        {/* ── Logo ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ position: "absolute", top: 22, left: 26, zIndex: 20, display: "flex", alignItems: "center", gap: 9 }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 7, background: YELLOW,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 14px rgba(245,197,24,0.35)", flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l19-9-9 19-2-8-8-2z" />
            </svg>
          </div>
          <span style={{ color: "#fff", fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 13 }}>
            The Crunch Dahlia
          </span>
        </motion.div>

        {/* ── Book card ── */}
        <motion.div
          className="lf-book"
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, ease: [0.23, 1, 0.32, 1] }}
          style={{
            position: "relative", zIndex: 5,
            width: "100%", maxWidth: 800,
            display: "flex",
            borderRadius: 20,
            overflow: "hidden",
            background: "rgba(16,10,2,0.52)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(32px)",
            WebkitBackdropFilter: "blur(32px)",
            boxShadow: "0 40px 100px rgba(0,0,0,0.72), inset 0 0 0 0.5px rgba(255,255,255,0.05)",
            minHeight: 540,
            perspective: 1400,
          }}
        >
          <div className="lf-spine" />

          {/* ── Left panel ── */}
          <div
            className="lf-left"
            style={{
              width: "42%", flexShrink: 0,
              display: "flex", flexDirection: "column",
              position: "relative", overflow: "hidden",
              borderRight: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div style={{ flex: "0 0 62%", position: "relative", overflow: "hidden" }}>
              <img
                src="/src/assets/img/crunch22.png"
                alt="The Crunch Dahlia"
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }}
              />
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: "50%",
                background: "linear-gradient(to bottom, transparent, rgba(12,8,2,0.92))",
                pointerEvents: "none",
              }} />
              <div style={{ position: "absolute", top: 18, left: 20, display: "flex", gap: 5, zIndex: 2 }}>
                {[true, false].map((isSignIn, i) => (
                  <div key={i} style={{
                    width: isLogin === isSignIn ? 18 : 5,
                    height: 5, borderRadius: 3,
                    background: isLogin === isSignIn ? YELLOW : "rgba(255,255,255,0.25)",
                    transition: "width 0.35s ease, background 0.35s ease",
                  }} />
                ))}
              </div>
            </div>

            <div style={{
              flex: 1,
              background: "rgba(12,8,2,0.82)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              padding: "18px 22px 22px",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
            }}>
              {/*
               * ── REAL-TIME GREETING ──
               * `greeting` state updates every minute via the setInterval in useEffect.
               * The AnimatePresence key on the title causes a smooth fade when it changes.
               */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={greeting.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: "rgba(245,197,24,0.13)",
                      border: "1px solid rgba(245,197,24,0.22)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <TimeIcon type={greeting.iconType} />
                    </div>
                    <p style={{
                      fontFamily: "'Poppins', sans-serif", fontSize: 15, fontWeight: 700,
                      color: "#fff", margin: 0, lineHeight: 1.3,
                    }}>
                      {greeting.title}
                    </p>
                  </div>

                  <p style={{
                    fontFamily: "'Poppins', sans-serif", fontSize: 12, fontWeight: 300,
                    color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.65,
                  }}>
                    {greeting.sub}
                  </p>
                </motion.div>
              </AnimatePresence>

              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: YELLOW, flexShrink: 0 }} />
                <span style={{
                  fontSize: 10, color: "rgba(255,255,255,0.22)",
                  fontFamily: "'Poppins', sans-serif", fontWeight: 500, letterSpacing: "0.8px",
                }}>
                  FAIRVIEW BRANCH
                </span>
              </div>
            </div>
          </div>

          {/* ── Right panel ── */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden", perspective: 1400 }}>
            <AnimatePresence custom={direction} mode="wait">
              <motion.div
                key={isLogin ? "signin" : "signup"}
                custom={direction}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  rotateY: { duration: 0.42, ease: [0.23, 1, 0.32, 1] },
                  opacity: { duration: 0.22 },
                  scale: { duration: 0.42, ease: [0.23, 1, 0.32, 1] },
                }}
                className="lf-page-wrap"
                style={{
                  position: "absolute", inset: 0,
                  padding: "36px 32px 28px",
                  display: "flex", flexDirection: "column",
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  willChange: "transform",
                }}
              >
                {isLogin
                  ? <SignInForm
                      formData={formData} handleChange={handleChange}
                      handleSubmit={handleSubmit} isLoading={isLoading} error={error}
                      showPassword={showPassword} setShowPassword={setShowPassword}
                      goToSignUp={() => switchTab(false)}
                    />
                  : <SignUpForm
                      formData={formData} handleChange={handleChange}
                      handleSubmit={handleSubmit} isLoading={isLoading} error={error}
                      showPassword={showPassword} setShowPassword={setShowPassword}
                      showConfirm={showConfirm} setShowConfirm={setShowConfirm}
                      goToSignIn={() => switchTab(true)}
                    />
                }
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </>
  );
}