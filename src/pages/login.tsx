import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { authApi } from "../lib/api";
import { useAuth } from "../context/authcontext";
import crunchImg from "../assets/img/crunch22.png";
import crunchLogo from "../assets/img/crunchlogo.png";

/* ─── tokens ──────────────────────────────────────────────────────────── */
const Y = "#F5C518";
const Y_DIM = "rgba(245,197,24,0.15)";
const SURFACE = "rgba(16,10,3,0.82)";
const PANEL = "rgba(22,14,5,0.90)";
const BORDER = "rgba(245,197,24,0.12)";
const TEXT_MUTED = "rgba(255,255,255,0.45)";

const ROLE_MAP: Record<string, string> = {
  administrator: "/dashboard",
  cashier: "/orders",
  cook: "/orders",
  inventory_manager: "/inventory",
  customer: "/products",
};

type AuthMode = "signin" | "signup";

/* ─── floating orbs background ─────────────────────────────────────────── */
function Orbs() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {[
        { x: "10%", y: "15%", size: 420, opacity: 0.05, delay: 0 },
        { x: "75%", y: "60%", size: 320, opacity: 0.04, delay: 1.2 },
        { x: "50%", y: "85%", size: 260, opacity: 0.03, delay: 2.4 },
      ].map((orb, i) => (
        <motion.div
          key={i}
          animate={{ scale: [1, 1.12, 1], opacity: [orb.opacity, orb.opacity * 1.4, orb.opacity] }}
          transition={{ duration: 7 + i * 1.5, repeat: Infinity, delay: orb.delay, ease: "easeInOut" }}
          style={{
            position: "absolute",
            left: orb.x,
            top: orb.y,
            width: orb.size,
            height: orb.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${Y}, transparent 70%)`,
            transform: "translate(-50%, -50%)",
            filter: "blur(2px)",
          }}
        />
      ))}
    </div>
  );
}

/* ─── field wrapper ─────────────────────────────────────────────────────── */
function Field({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <motion.label
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <span style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: TEXT_MUTED,
        fontWeight: 700,
        fontFamily: "'Poppins', sans-serif",
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}>
        {icon && <span style={{ opacity: 0.6 }}>{icon}</span>}
        {label}
      </span>
      {children}
    </motion.label>
  );
}

/* ─── text input ────────────────────────────────────────────────────────── */
function TextInput({
  name, type = "text", value, onChange, placeholder, autoComplete, required, icon, rightSlot,
}: {
  name: string; type?: string; value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string; autoComplete?: string; required?: boolean;
  icon?: ReactNode; rightSlot?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div
      animate={{ boxShadow: focused ? `0 0 0 2px ${Y}55` : "0 0 0 1px rgba(255,255,255,0.08)" }}
      style={{
        position: "relative",
        borderRadius: 14,
        background: "rgba(255,255,255,0.05)",
        overflow: "hidden",
        transition: "box-shadow 0.2s",
      }}
    >
      {icon && (
        <span style={{
          position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
          color: focused ? Y : TEXT_MUTED, transition: "color 0.2s", pointerEvents: "none",
        }}>
          {icon}
        </span>
      )}
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          color: "#fff",
          padding: icon ? "13px 42px 13px 42px" : rightSlot ? "13px 42px 13px 14px" : "13px 14px",
          fontSize: 14,
          fontFamily: "'Poppins', sans-serif",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {rightSlot && (
        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
          {rightSlot}
        </span>
      )}
    </motion.div>
  );
}

/* ─── password field ────────────────────────────────────────────────────── */
function PasswordField({
  label, name, value, onChange, placeholder, autoComplete,
}: {
  label: string; name: string; value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string; autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} icon={<Lock size={11} />}>
      <TextInput
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        icon={<Lock size={15} />}
        rightSlot={
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            style={{ border: "none", background: "none", color: TEXT_MUTED, cursor: "pointer", display: "flex", padding: 0 }}
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        }
      />
    </Field>
  );
}

/* ─── primary button ────────────────────────────────────────────────────── */
function PrimaryButton({ children, disabled, onClick, type = "submit" }: {
  children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "submit" | "button";
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.015, boxShadow: `0 8px 32px ${Y}55` }}
      whileTap={disabled ? {} : { scale: 0.985 }}
      style={{
        marginTop: 6,
        border: "none",
        borderRadius: 14,
        background: disabled ? "rgba(245,197,24,0.4)" : `linear-gradient(135deg, ${Y} 0%, #e6b800 100%)`,
        color: "#111",
        padding: "14px 16px",
        fontWeight: 700,
        fontFamily: "'Poppins', sans-serif",
        fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        width: "100%",
        letterSpacing: "0.03em",
        transition: "background 0.2s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {children}
    </motion.button>
  );
}

/* ─── verify email modal ──────────────────────────────────────────────── */
function VerifyEmailModal({
  open, email, code, error, success, isVerifying, isResending,
  onClose, onCodeChange, onVerify, onResend,
}: {
  open: boolean; email: string; code: string; error: string; success: string;
  isVerifying: boolean; isResending: boolean;
  onClose: () => void; onCodeChange: (v: string) => void;
  onVerify: () => void; onResend: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.82)", backdropFilter: "blur(14px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            style={{
              width: "min(460px, 100%)",
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: 22,
              boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 60px ${Y}18`,
              padding: "28px 28px 24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: Y_DIM, border: `1px solid ${Y}30`, display: "grid", placeItems: "center" }}>
                <Mail size={17} color={Y} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: Y, fontFamily: "'Poppins', sans-serif" }}>
                  Verify Email
                </p>
                <h2 style={{ margin: 0, color: "#fff", fontSize: 20, fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>
                  Enter your 6-digit code
                </h2>
              </div>
            </div>

            <p style={{ margin: "0 0 18px", color: TEXT_MUTED, fontSize: 13, lineHeight: 1.7, fontFamily: "'Poppins', sans-serif" }}>
              We sent a code to <strong style={{ color: "#fff" }}>{email || "your email"}</strong>. Expires in 10 minutes.
            </p>

            <AnimatePresence mode="wait">
              {error && (
                <motion.p key="e" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ margin: "0 0 12px", color: "#fca5a5", fontSize: 12, textAlign: "center", fontFamily: "'Poppins', sans-serif" }}>
                  {error}
                </motion.p>
              )}
              {success && (
                <motion.p key="s" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ margin: "0 0 12px", color: "#86efac", fontSize: 12, textAlign: "center", fontFamily: "'Poppins', sans-serif" }}>
                  {success}
                </motion.p>
              )}
            </AnimatePresence>

            <Field label="Verification Code">
              <motion.input
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="• • • • • •"
                whileFocus={{ boxShadow: `0 0 0 2px ${Y}55` }}
                style={{
                  width: "100%", borderRadius: 14, border: "none",
                  background: "rgba(255,255,255,0.05)",
                  color: Y, padding: "16px 14px", fontSize: 24, fontWeight: 700,
                  fontFamily: "'Poppins', sans-serif", textAlign: "center",
                  letterSpacing: "0.5em", outline: "none", boxSizing: "border-box",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
                }}
              />
            </Field>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <PrimaryButton onClick={onVerify} disabled={isVerifying || code.trim().length !== 6} type="button">
                {isVerifying ? "Verifying…" : "Verify"}
              </PrimaryButton>
              <motion.button
                type="button"
                onClick={onResend}
                disabled={isResending || !email}
                whileHover={isResending ? {} : { borderColor: `${Y}55` }}
                style={{
                  flex: 1, borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)", color: "#fff",
                  padding: "14px", fontWeight: 700, fontFamily: "'Poppins', sans-serif",
                  cursor: isResending ? "not-allowed" : "pointer", opacity: isResending ? 0.7 : 1, fontSize: 14,
                }}
              >
                {isResending ? "Sending…" : "Resend"}
              </motion.button>
            </div>

            <button type="button" onClick={onClose}
              style={{ marginTop: 14, width: "100%", background: "none", border: "none", color: TEXT_MUTED, cursor: "pointer", fontSize: 12, fontFamily: "'Poppins', sans-serif" }}>
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── main component ─────────────────────────────────────────────────────── */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [direction, setDirection] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ name: "", email: "", password: "", confirmPassword: "" });

  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [verificationSuccess, setVerificationSuccess] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("tab") === "signup") switchMode("signup");
    const email = params.get("verifyEmail");
    if (email) {
      setVerificationEmail(email.trim().toLowerCase());
      setVerificationOpen(true);
    }
  }, [location.search]);

  const switchMode = (next: AuthMode) => {
    const order: AuthMode[] = ["signin", "signup"];
    const d = order.indexOf(next) > order.indexOf(mode) ? 1 : -1;
    setDirection(d);
    setMode(next);
    setError("");
    setFormData(c => ({ ...c, password: "", confirmPassword: "" }));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) =>
    setFormData(c => ({ ...c, [e.target.name]: e.target.value }));

  const handleVerifyEmail = async () => {
    const em = verificationEmail.trim().toLowerCase();
    const cd = verificationCode.replace(/\D/g, "").slice(0, 6);
    if (!em || cd.length !== 6) { setVerificationError("Enter the 6-digit code."); return; }
    setIsVerifying(true); setVerificationError(""); setVerificationSuccess("");
    try {
      await authApi.verifyEmail(em, cd);
      setVerificationSuccess("Email verified! Your account is now active.");
      setFormData(c => ({ ...c, email: em, password: "", confirmPassword: "" }));
      switchMode("signin");
      setTimeout(() => { setVerificationOpen(false); setVerificationCode(""); }, 1200);
    } catch (err: any) { setVerificationError(err.message || "Could not verify."); }
    finally { setIsVerifying(false); }
  };

  const handleResendVerification = async () => {
    const em = verificationEmail.trim().toLowerCase();
    if (!em) { setVerificationError("Enter your email first."); return; }
    setIsResendingVerification(true);
    try {
      await authApi.resendVerification(em);
      setVerificationSuccess("New code sent.");
    } catch (err: any) { setVerificationError(err.message || "Could not resend."); }
    finally { setIsResendingVerification(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setIsLoading(true);
    try {
      if (mode === "signin") {
        const data = await authApi.login(formData.email, formData.password);
        login({ token: data.token, username: data.username, email: data.email, role: data.role, userId: String(data.userId), email_verified: data.email_verified });
        navigate(ROLE_MAP[data.role] ?? "/", { replace: true });
        return;
      }
      if (formData.password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (formData.password !== formData.confirmPassword) throw new Error("Passwords don't match.");
      const reg = await authApi.register(formData.name, formData.email, formData.password);
      const em = formData.email.trim().toLowerCase();
      setFormData({ name: formData.name, email: em, password: "", confirmPassword: "" });
      setVerificationEmail(em);
      setVerificationCode(""); setVerificationError("");
      setVerificationSuccess("Code sent. Enter it to activate your account.");
      setVerificationOpen(Boolean(reg.requiresEmailVerification));
    } catch (err: any) {
      if (mode === "signin" && err?.status === 403 && err?.data?.requiresEmailVerification) {
        const blockedEmail = err.data.email?.trim().toLowerCase() || formData.email.trim().toLowerCase();
        setVerificationEmail(blockedEmail); setVerificationCode("");
        setVerificationError(err.message || "Please verify your email first.");
        setVerificationSuccess(""); setVerificationOpen(true); setError("");
        return;
      }
      setError(err.message || "Authentication failed.");
    } finally { setIsLoading(false); }
  };

  /* left panel content per mode */
  const leftContent = useMemo(() => ({
    signin: {
      eyebrow: "Welcome Back",
      heading: "Sign in to\ncontinue your order",
      sub: "Customer accounts must verify their email first before sign-in is allowed.",
    },
    signup: {
      eyebrow: "New Here?",
      heading: "Create your\naccount today",
      sub: "We'll send a 6-digit code via email. Your account stays inactive until verified.",
    },
  })[mode], [mode]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        input::placeholder { color: rgba(255,255,255,0.25); }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        padding: "24px 16px", fontFamily: "'Poppins', sans-serif",
        background: "radial-gradient(ellipse at 20% 10%, rgba(245,197,24,0.05), transparent 40%), radial-gradient(ellipse at 80% 90%, rgba(245,197,24,0.03), transparent 40%), linear-gradient(135deg, #0a0600 0%, #060402 55%, #0c0802 100%)",
        position: "relative",
      }}>
        <Orbs />

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            width: "min(1000px, 100%)", position: "relative", zIndex: 1,
            display: "grid", gridTemplateColumns: "minmax(280px, 0.9fr) minmax(340px, 1fr)",
            background: SURFACE,
            border: `1px solid ${BORDER}`,
            borderRadius: 28,
            overflow: "hidden",
            boxShadow: `0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(245,197,24,0.06), inset 0 1px 0 rgba(255,255,255,0.06)`,
            backdropFilter: "blur(24px)",
            perspective: 1200,
          }}
        >
          {/* ── LEFT PANEL ── */}
          <div style={{
            position: "relative", overflow: "hidden", minHeight: 580,
            background: "#0a0600",
            display: "flex", flexDirection: "column",
          }}>

            {/* ── TOP BAR: logo + eyebrow ── */}
            <div style={{
              position: "relative", zIndex: 4,
              padding: "24px 24px 0",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <motion.div
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                style={{ width: 44, height: 44, cursor: "default" }}
              >
                <img src={crunchLogo} alt="The Crunch" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </motion.div>
              <AnimatePresence mode="wait">
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    color: Y, fontSize: 9, fontWeight: 800,
                    letterSpacing: "0.22em", textTransform: "uppercase",
                    fontFamily: "'Poppins', sans-serif",
                  }}
                >
                  {leftContent.eyebrow}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* ── HERO IMAGE ── */}
            <motion.div
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              style={{
                position: "relative", zIndex: 2,
                flex: 1,
                margin: "16px 16px 0",
                borderRadius: 18,
                overflow: "hidden",
                minHeight: 0,
              }}
            >
              <img
                src={crunchImg}
                alt="Boneless Crunchy Savory"
                style={{
                  width: "100%", height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  display: "block",
                }}
              />
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to bottom, transparent 55%, rgba(8,5,1,0.85) 100%)",
                pointerEvents: "none",
              }} />
            </motion.div>

            {/* ── BOTTOM TEXT BLOCK ── */}
            <div style={{ position: "relative", zIndex: 4, padding: "14px 24px 24px", flexShrink: 0 }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h1 style={{
                    margin: "0 0 6px", color: "#fff",
                    fontSize: "clamp(20px, 2.2vw, 28px)", lineHeight: 1.15,
                    fontWeight: 800, fontFamily: "'Poppins', sans-serif",
                    whiteSpace: "pre-line",
                  }}>
                    {leftContent.heading}
                  </h1>
                  <p style={{
                    margin: 0, color: "rgba(255,255,255,0.5)",
                    fontSize: 12, lineHeight: 1.75,
                    fontFamily: "'Poppins', sans-serif",
                  }}>
                    {leftContent.sub}
                  </p>
                </motion.div>
              </AnimatePresence>

              <motion.div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 14 }}>
                {[
                  { label: "Boneless" },
                  { label: "Crunchy" },
                  { label: "Savory" },
                ].map((tag, i) => (
                  <motion.span
                    key={tag.label}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.08, duration: 0.35 }}
                    style={{
                      padding: "5px 13px", borderRadius: 999,
                      background: "rgba(245,197,24,0.08)",
                      border: "1px solid rgba(245,197,24,0.18)",
                      color: "rgba(255,255,255,0.7)",
                      fontSize: 11, fontWeight: 600,
                      fontFamily: "'Poppins', sans-serif",
                      display: "flex", alignItems: "center", gap: 5,
                    }}
                  >
                    {tag.label}
                  </motion.span>
                ))}
              </motion.div>
            </div>
          </div>

          {/* ── RIGHT PANEL (book-page flip) ── */}
          <div style={{ background: PANEL, position: "relative", overflow: "hidden" }}>
            {/* edge shadow for book feel */}
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: 12,
              background: "linear-gradient(to right, rgba(0,0,0,0.3), transparent)",
              pointerEvents: "none", zIndex: 2,
            }} />

            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={mode}
                custom={direction}
                initial={{ rotateY: direction * -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: direction * 90, opacity: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 26 }}
                style={{ padding: "36px 32px", transformStyle: "preserve-3d", perspective: 1000 }}
              >
                {/* ── SIGN IN ── */}
                {mode === "signin" && (
                  <>
                    <TabSwitcher mode={mode} onSwitch={switchMode} />
                    <form onSubmit={handleSubmit} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                      <ErrorMessage message={error} />
                      <Field label="Email Address" icon={<Mail size={11} />}>
                        <TextInput name="email" type="email" value={formData.email} onChange={handleChange}
                          placeholder="you@example.com" autoComplete="email" required icon={<Mail size={15} />} />
                      </Field>
                      <PasswordField label="Password" name="password" value={formData.password}
                        onChange={handleChange} placeholder="Enter your password" autoComplete="current-password" />

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => navigate("/forgot-password")}
                          style={{ border: "none", background: "none", color: TEXT_MUTED, cursor: "pointer", fontSize: 12, fontFamily: "'Poppins', sans-serif", padding: 0 }}>
                          Forgot password?
                        </button>
                      </div>

                      <PrimaryButton disabled={isLoading}>
                        {isLoading ? "Signing in…" : "Sign In"}
                      </PrimaryButton>
                    </form>
                    <Footer mode={mode} onSwitch={switchMode} onOpenVerify={() => {
                      setVerificationEmail(formData.email.trim().toLowerCase());
                      setVerificationCode(""); setVerificationError(""); setVerificationSuccess("");
                      setVerificationOpen(true);
                    }} />
                  </>
                )}

                {/* ── SIGN UP ── */}
                {mode === "signup" && (
                  <>
                    <TabSwitcher mode={mode} onSwitch={switchMode} />
                    <form onSubmit={handleSubmit} style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                      <ErrorMessage message={error} />
                      <Field label="Full Name" icon={<User size={11} />}>
                        <TextInput name="name" value={formData.name} onChange={handleChange}
                          placeholder="Your full name" required icon={<User size={15} />} />
                      </Field>
                      <Field label="Email Address" icon={<Mail size={11} />}>
                        <TextInput name="email" type="email" value={formData.email} onChange={handleChange}
                          placeholder="you@example.com" autoComplete="email" required icon={<Mail size={15} />} />
                      </Field>
                      <PasswordField label="Password" name="password" value={formData.password}
                        onChange={handleChange} placeholder="Minimum 8 characters" autoComplete="new-password" />
                      <PasswordField label="Confirm Password" name="confirmPassword" value={formData.confirmPassword}
                        onChange={handleChange} placeholder="Re-enter your password" autoComplete="new-password" />
                      <PrimaryButton disabled={isLoading}>
                        {isLoading ? "Creating account…" : "Create Account"}
                      </PrimaryButton>
                    </form>
                    <Footer mode={mode} onSwitch={switchMode} onOpenVerify={() => {
                      setVerificationEmail(formData.email.trim().toLowerCase());
                      setVerificationCode(""); setVerificationError(""); setVerificationSuccess("");
                      setVerificationOpen(true);
                    }} />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <VerifyEmailModal
        open={verificationOpen} email={verificationEmail} code={verificationCode}
        error={verificationError} success={verificationSuccess}
        isVerifying={isVerifying} isResending={isResendingVerification}
        onClose={() => { setVerificationOpen(false); setVerificationCode(""); setVerificationSuccess(""); setVerificationError(""); }}
        onCodeChange={(v) => { setVerificationCode(v.replace(/\D/g, "").slice(0, 6)); setVerificationError(""); }}
        onVerify={handleVerifyEmail}
        onResend={handleResendVerification}
      />
    </>
  );
}

/* ─── small sub-components ──────────────────────────────────────────────── */
function TabSwitcher({ mode, onSwitch }: { mode: AuthMode; onSwitch: (m: AuthMode) => void }) {
  return (
    <div style={{ display: "inline-flex", gap: 6, padding: 5, borderRadius: 999, background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.08)` }}>
      {(["signin", "signup"] as const).map(tab => (
        <motion.button
          key={tab}
          type="button"
          onClick={() => onSwitch(tab)}
          animate={{ background: mode === tab ? Y : "transparent", color: mode === tab ? "#111" : "rgba(255,255,255,0.5)" }}
          transition={{ duration: 0.22 }}
          style={{ border: "none", borderRadius: 999, padding: "9px 20px", fontWeight: 700, fontFamily: "'Poppins', sans-serif", cursor: "pointer", fontSize: 13 }}
        >
          {tab === "signin" ? "Sign In" : "Sign Up"}
        </motion.button>
      ))}
    </div>
  );
}

function Footer({ mode, onSwitch, onOpenVerify }: { mode: AuthMode; onSwitch: (m: AuthMode) => void; onOpenVerify: () => void }) {
  return (
    <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 12, fontFamily: "'Poppins', sans-serif" }}>
        {mode === "signin" ? "Need an account? " : "Have an account? "}
        <button type="button" onClick={() => onSwitch(mode === "signin" ? "signup" : "signin")}
          style={{ border: "none", background: "none", color: Y, cursor: "pointer", fontWeight: 700, padding: 0, fontFamily: "'Poppins', sans-serif", fontSize: 12 }}>
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
      <button type="button" onClick={onOpenVerify}
        style={{ border: "none", background: "none", color: TEXT_MUTED, cursor: "pointer", fontSize: 12, fontFamily: "'Poppins', sans-serif" }}>
        Already have a code?
      </button>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p
          key={message}
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          style={{ margin: 0, color: "#fca5a5", fontSize: 12, textAlign: "center", fontFamily: "'Poppins', sans-serif" }}
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}