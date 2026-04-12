import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authApi } from "../lib/api";

// ── Inject fonts ──────────────────────────────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("login-fonts")) {
  const link = document.createElement("link");
  link.id = "login-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,700&display=swap";
  document.head.appendChild(link);
}

// ── Field component ───────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  children: React.ReactNode;
  delay?: number;
  extra?: React.ReactNode;
}
function Field({ label, children, delay = 0, extra }: FieldProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.23, 1, 0.32, 1] }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <label style={{
          fontFamily: "'Poppins', sans-serif",
          fontSize: 11,
          fontWeight: 500,
          color: "rgba(255,255,255,0.4)",
          letterSpacing: "0.7px",
          textTransform: "uppercase",
        }}>
          {label}
        </label>
        {extra}
      </div>
      {children}
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
  });

  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("tab") === "signup") setIsLogin(false);
  }, [location.search]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    setTilt({ x: dy * -5, y: dx * 5 });
  };

  const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const persistAuth = (data: {
    token: string;
    username: string;
    role: string;
    userId: number | string;
  }) => {
    localStorage.setItem("authToken", data.token);
    localStorage.setItem("isAuthenticated", "true");
    localStorage.setItem("userName", data.username);
    localStorage.setItem("userRole", data.role);
    localStorage.setItem("userId", String(data.userId));
    window.dispatchEvent(new Event("authChange"));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (isLogin) {
      try {
        const data = await authApi.login(formData.email, formData.password);
        persistAuth(data);
        const roleHomeMap: Record<string, string> = {
          administrator: "/dashboard",
          cashier: "/orders",
          cook: "/orders",
          inventory_manager: "/inventory",
          customer: "/products",
        };
        navigate(roleHomeMap[data.role] ?? "/");
      } catch (err: any) {
        setError(err.message || "Invalid credentials.");
      } finally {
        setIsLoading(false);
      }
    } else {
      const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/;
      if (!passwordRegex.test(formData.password)) {
        setError("Password must be at least 8 characters with letters and numbers.");
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
        persistAuth(data);
        navigate("/products");
      } catch (err: any) {
        if (
          err.message?.toLowerCase().includes("login") ||
          err.message?.toLowerCase().includes("credential")
        ) {
          setError("");
          setIsLogin(true);
          setFormData({ email: formData.email, password: "", confirmPassword: "", name: "" });
        } else {
          setError(err.message || "Failed to register.");
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  const switchTab = (login: boolean) => {
    setIsLogin(login);
    setError("");
    setFormData({ email: "", password: "", confirmPassword: "", name: "" });
    setShowPassword(false);
    setShowConfirm(false);
  };

  const YELLOW = "#F5C518";
  const YELLOW_DARK = "#D4A800";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 12,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: "0 2px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
    padding: "13px 16px",
    color: "#fff",
    fontSize: 14,
    fontFamily: "'Poppins', sans-serif",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.3s ease, background 0.3s ease, box-shadow 0.35s ease",
  };

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -300px 0; }
          100% { background-position: 300px 0; }
        }

        .login-input:focus {
          border-color: rgba(245,197,24,0.55) !important;
          background: rgba(255,255,255,0.12) !important;
          box-shadow: 0 0 0 3px rgba(245,197,24,0.10), inset 0 1px 0 rgba(255,255,255,0.14) !important;
        }
        .login-input::placeholder {
          color: rgba(255,255,255,0.18);
        }

        .tab-pill {
          background: none;
          border: none;
          cursor: pointer;
          font-family: 'Poppins', sans-serif;
          font-size: 13px;
          font-weight: 500;
          padding: 10px 24px;
          position: relative;
          transition: color 0.3s ease;
        }
        .tab-pill::after {
          content: '';
          position: absolute;
          bottom: -1px; left: 0; right: 0;
          height: 2px;
          background: #F5C518;
          border-radius: 2px 2px 0 0;
          transform: scaleX(0);
          transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .tab-pill.active  { color: #F5C518; font-weight: 600; }
        .tab-pill.active::after { transform: scaleX(1); }
        .tab-pill.inactive { color: rgba(255,255,255,0.32); }
        .tab-pill.inactive:hover { color: rgba(255,255,255,0.55); }

        .submit-btn {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          font-family: 'Poppins', sans-serif;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          background: #F5C518;
          color: #0a0a0a;
          letter-spacing: 0.2px;
          transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.23,1,0.32,1), background 0.3s ease;
        }
        .submit-btn:hover:not(:disabled) {
          background: #D4A800;
          transform: translateY(-1px);
        }
        .submit-btn:active:not(:disabled) {
          transform: scale(0.985);
        }
        .submit-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .submit-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
          background-size: 300px 100%;
          animation: shimmer 2.6s infinite;
        }

        .eye-btn {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.25);
          display: flex;
          align-items: center;
          padding: 0;
          transition: color 0.2s;
        }
        .eye-btn:hover { color: #F5C518; }

        @media (max-width: 480px) {
          .login-card { padding: 28px 20px 24px !important; }
        }
      `}</style>

      <div style={{
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Poppins', sans-serif",
        overflow: "hidden",
      }}>

        {/* ── Background image ── */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "url('https://shorturl.at/IyJkH')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }} />

        {/* ── Dark overlay ── */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, rgba(5,3,1,0.84) 0%, rgba(10,7,2,0.72) 50%, rgba(14,9,0,0.82) 100%)",
        }} />

        {/* ── Warm bottom vignette ── */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 50% 110%, rgba(212,134,10,0.20) 0%, transparent 55%)",
          pointerEvents: "none",
        }} />

        {/* ── Logo top-left ── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          style={{
            position: "absolute", top: 32, left: 36, zIndex: 10,
            display: "inline-flex", alignItems: "center", gap: 10,
          }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "#F5C518",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(245,197,24,0.38)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l19-9-9 19-2-8-8-2z" />
            </svg>
          </div>
          <span style={{
            color: "#fff",
            fontFamily: "'Poppins', sans-serif",
            fontWeight: 600, fontSize: 14,
            textShadow: "0 1px 8px rgba(0,0,0,0.6)",
          }}>
            The Crunch Dahlia Fairview Branch
          </span>
        </motion.div>

        {/* ── Card wrapper ── */}
        <div style={{
          position: "relative", zIndex: 5,
          width: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "100px 24px 40px",
        }}>

          {/* ── Card ── */}
          <motion.div
            ref={cardRef}
            className="login-card"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 24,
              padding: "36px 36px 32px",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.6), inset 0 0 0 0.5px rgba(255,255,255,0.05)",
              transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              transition: "transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Inner top-edge glow */}
            <div style={{
              position: "absolute", top: 0, left: "20%", right: "20%", height: 1,
              background: "linear-gradient(90deg, transparent, rgba(245,197,24,0.30), transparent)",
              pointerEvents: "none",
            }} />

            {/* ── Heading ── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              style={{ marginBottom: 24 }}
            >
              <h1 style={{
                fontFamily: "'Poppins', sans-serif",
                fontSize: 22, fontWeight: 700,
                color: "#fff", margin: "0 0 6px",
                letterSpacing: "-0.3px",
              }}>
                {isLogin ? "Welcome back" : "Create account"}
              </h1>
              <p style={{
                color: "rgba(255,255,255,0.28)",
                fontSize: 13, fontWeight: 300, margin: 0,
              }}>
                {isLogin ? "Sign in to your workspace" : "Get started with your team"}
              </p>
            </motion.div>

            {/* ── Tab switcher ── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              style={{
                display: "inline-flex",
                marginBottom: 26,
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <button
                className={`tab-pill ${isLogin ? "active" : "inactive"}`}
                onClick={() => switchTab(true)}
              >
                Sign In
              </button>
              <button
                className={`tab-pill ${!isLogin ? "active" : "inactive"}`}
                onClick={() => switchTab(false)}
              >
                Sign Up
              </button>
            </motion.div>

            {/* ── Form ── */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* ── Error message — clean text only, no box ── */}
              <AnimatePresence>
                {error && (
                  <motion.p
                    key="error"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontFamily: "'Poppins', sans-serif",
                      color: "#fca5a5",
                      textAlign: "center",
                    }}
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* ── Full name — sign up only ── */}
              <AnimatePresence>
                {!isLogin && (
                  <motion.div
                    key="name-field"
                    initial={{ opacity: 0, height: 0, y: -8 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <Field label="Full Name" delay={0.28}>
                      <input
                        className="login-input"
                        style={inputStyle}
                        id="name"
                        name="name"
                        type="text"
                        required={!isLogin}
                        autoComplete="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Your full name"
                      />
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Email ── */}
              <Field label="Email Address" delay={0.3}>
                <input
                  className="login-input"
                  style={inputStyle}
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                />
              </Field>

              {/* ── Password ── */}
              <Field
                label="Password"
                delay={0.36}
                extra={
                  isLogin ? (
                    <a
                      href="#"
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.28)",
                        textDecoration: "none",
                        fontFamily: "'Poppins', sans-serif",
                        letterSpacing: "0.3px",
                        transition: "color 0.2s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = YELLOW)}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.28)")}
                    >
                      Forgot password?
                    </a>
                  ) : undefined
                }
              >
                <div style={{ position: "relative" }}>
                  <input
                    className="login-input"
                    style={{ ...inputStyle, paddingRight: 44 }}
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    required
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {!isLogin && (
                  <p style={{
                    marginTop: 6, fontSize: 11,
                    color: "rgba(255,255,255,0.18)",
                    fontFamily: "'Poppins', sans-serif",
                  }}>
                    Min. 8 characters with letters and numbers.
                  </p>
                )}
              </Field>

              {/* ── Confirm password — sign up only ── */}
              <AnimatePresence>
                {!isLogin && (
                  <motion.div
                    key="confirm-field"
                    initial={{ opacity: 0, height: 0, y: -8 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -8 }}
                    transition={{ duration: 0.3, delay: 0.05, ease: [0.23, 1, 0.32, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <Field label="Confirm Password" delay={0}>
                      <div style={{ position: "relative" }}>
                        <input
                          className="login-input"
                          style={{ ...inputStyle, paddingRight: 44 }}
                          id="confirmPassword"
                          name="confirmPassword"
                          type={showConfirm ? "text" : "password"}
                          autoComplete="new-password"
                          required={!isLogin}
                          value={formData.confirmPassword}
                          onChange={handleChange}
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          className="eye-btn"
                          onClick={() => setShowConfirm(!showConfirm)}
                        >
                          {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Submit ── */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.42 }}
                style={{ marginTop: 4 }}
              >
                <button
                  type="submit"
                  className="submit-btn"
                  disabled={isLoading}
                >
                  {isLoading ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
                </button>
              </motion.div>
            </form>

            {/* ── Switch link ── */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              style={{
                textAlign: "center",
                marginTop: 22,
                fontSize: 13,
                color: "rgba(255,255,255,0.25)",
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              {isLogin ? "No account yet? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => switchTab(!isLogin)}
                style={{
                  background: "none",
                  border: "none",
                  color: YELLOW,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "'Poppins', sans-serif",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  transition: "color 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = YELLOW_DARK)}
                onMouseLeave={e => (e.currentTarget.style.color = YELLOW)}
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </motion.p>
          </motion.div>
        </div>
      </div>
    </>
  );
}