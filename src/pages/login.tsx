import {
  useCallback, useEffect, useRef, useState,
  type ChangeEvent, type CSSProperties, type FormEvent, type InputHTMLAttributes, type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { authApi } from "../lib/api";
import { useAuth } from "../context/authcontext";
import crunchImg from "../assets/img/crunch22.png";
import crunchLogo from "../assets/img/crunchlogo.png";

/* ─── Constants ─────────────────────────────────────────────────────────── */

// Where the logo takes the user. Change this if your landing page lives elsewhere.
const LANDING_PATH = "/";

// Where each role goes after signing in
const ROLE_HOME_PATH: Record<string, string> = {
  administrator: "/dashboard",
  cashier: "/orders",
  cook: "/orders",
  inventory_manager: "/inventory",
  customer: "/products",
};

// Form rules
const MAX_LEN = 50;
const MIN_PASSWORD = 8;
const CODE_LEN = 6;

// Design tokens
const Y = "#F5C518";
const PANEL = "rgba(22,14,5,0.90)";
const BORDER = "rgba(245,197,24,0.12)";
const MUTED = "rgba(255,255,255,0.45)";

// Text shown on the left panel for each mode
const BRAND_COPY = {
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
} as const;

const HERO_TAGS = ["Boneless", "Crunchy", "Savory"];

// Background glow circles
const ORBS = [
  { x: "10%", y: "15%", size: 420, opacity: 0.05, delay: 0 },
  { x: "75%", y: "60%", size: 320, opacity: 0.04, delay: 1.2 },
  { x: "50%", y: "85%", size: 260, opacity: 0.03, delay: 2.4 },
];

/* ─── Types and helpers ─────────────────────────────────────────────────── */

type AuthMode = "signin" | "signup";
type Tone = "error" | "success";
type FormState = { name: string; email: string; password: string; confirmPassword: string };
type InputProps = { label: string; Icon?: LucideIcon; rightSlot?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "style">;

// Shape of errors thrown by authApi
interface ApiErrorLike {
  message?: string;
  status?: number;
  data?: { requiresEmailVerification?: boolean; email?: string };
}

const INITIAL_FORM: FormState = { name: "", email: "", password: "", confirmPassword: "" };
const normalizeEmail = (v: string) => v.trim().toLowerCase();
const sanitizeCode = (v: string) => v.replace(/\D/g, "").slice(0, CODE_LEN); // digits only
const errorText = (err: unknown, fallback: string) => (err as ApiErrorLike | null)?.message || fallback;

// Returns an error message if the sign up data is invalid, otherwise null
function validateSignUp({ name, email, password, confirmPassword }: FormState): string | null {
  if (!name.trim()) return "Please enter your full name.";
  if (name.trim().length > MAX_LEN) return `Full name must not exceed ${MAX_LEN} characters.`;
  if (email.trim().length > MAX_LEN) return `Email must not exceed ${MAX_LEN} characters.`;
  if (password.length > MAX_LEN) return `Password must not exceed ${MAX_LEN} characters.`;
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password !== confirmPassword) return "Passwords don't match.";
  return null;
}

// Shared styles
const stack: CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };
const description: CSSProperties = { margin: 0, color: MUTED, fontSize: 13, lineHeight: 1.7 };
const textButton: CSSProperties = { border: "none", background: "none", color: MUTED, cursor: "pointer", fontSize: 12, padding: 0 };

/* ─── UI building blocks ────────────────────────────────────────────────── */

/* Floating background glow */
function Orbs() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {ORBS.map((o, i) => (
        <motion.div
          key={i}
          animate={{ scale: [1, 1.12, 1], opacity: [o.opacity, o.opacity * 1.4, o.opacity] }}
          transition={{ duration: 7 + i * 1.5, repeat: Infinity, delay: o.delay, ease: "easeInOut" }}
          style={{
            position: "absolute", left: o.x, top: o.y, width: o.size, height: o.size, borderRadius: "50%",
            background: `radial-gradient(circle, ${Y}, transparent 70%)`, transform: "translate(-50%, -50%)", filter: "blur(2px)",
          }}
        />
      ))}
    </div>
  );
}

/* Small uppercase label above an input */
function Field({ label, Icon, children }: { label: string; Icon?: LucideIcon; children: ReactNode }) {
  return (
    <motion.label initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: MUTED, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
        {Icon && <Icon size={11} style={{ opacity: 0.6 }} />}
        {label}
      </span>
      {children}
    </motion.label>
  );
}

/* Label + input with a left icon and an optional right slot */
function InputField({ label, Icon, rightSlot, ...input }: InputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} Icon={Icon}>
      <motion.div
        animate={{ boxShadow: focused ? `0 0 0 2px ${Y}55` : "0 0 0 1px rgba(255,255,255,0.08)" }}
        style={{ position: "relative", borderRadius: 14, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}
      >
        {Icon && (
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex", color: focused ? Y : MUTED, transition: "color 0.2s", pointerEvents: "none" }}>
            <Icon size={15} />
          </span>
        )}
        <input
          {...input}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ width: "100%", border: "none", background: "transparent", color: "#fff", fontSize: 14, outline: "none", padding: `13px ${rightSlot ? 42 : 14}px 13px ${Icon ? 42 : 14}px` }}
        />
        {rightSlot && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>{rightSlot}</span>}
      </motion.div>
    </Field>
  );
}

/* Password input with a show / hide toggle */
function PasswordField(props: Omit<InputProps, "Icon" | "type" | "rightSlot">) {
  const [visible, setVisible] = useState(false);
  return (
    <InputField
      {...props}
      Icon={Lock}
      type={visible ? "text" : "password"}
      required
      rightSlot={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          style={{ ...textButton, display: "flex" }}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      }
    />
  );
}

/* Main yellow button. Pass `style` to override layout (e.g. inside a row). */
function PrimaryButton({ children, disabled, style }: { children: ReactNode; disabled?: boolean; style?: CSSProperties }) {
  return (
    <motion.button
      type="submit"
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.015, boxShadow: `0 8px 32px ${Y}55` }}
      whileTap={disabled ? {} : { scale: 0.985 }}
      style={{
        marginTop: 6, border: "none", borderRadius: 14, width: "100%", padding: "14px 16px", color: "#111",
        background: disabled ? "rgba(245,197,24,0.4)" : `linear-gradient(135deg, ${Y} 0%, #e6b800 100%)`,
        fontWeight: 700, fontSize: 14, letterSpacing: "0.03em", cursor: disabled ? "not-allowed" : "pointer", ...style,
      }}
    >
      {children}
    </motion.button>
  );
}

/* Animated error / success message. Renders nothing when empty. */
function StatusMessage({ tone, message }: { tone: Tone; message: string }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p
          key={message}
          role={tone === "error" ? "alert" : "status"}
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          style={{ margin: 0, color: tone === "error" ? "#fca5a5" : "#86efac", fontSize: 12, textAlign: "center" }}
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/* Sign In / Sign Up pill switcher */
function TabSwitcher({ mode, onSwitch }: { mode: AuthMode; onSwitch: (m: AuthMode) => void }) {
  return (
    <div style={{ display: "inline-flex", gap: 6, padding: 5, borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {(["signin", "signup"] as const).map((tab) => (
        <motion.button
          key={tab}
          type="button"
          onClick={() => onSwitch(tab)}
          aria-pressed={mode === tab}
          animate={{ background: mode === tab ? Y : "transparent", color: mode === tab ? "#111" : "rgba(255,255,255,0.5)" }}
          transition={{ duration: 0.22 }}
          style={{ border: "none", borderRadius: 999, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
        >
          {tab === "signin" ? "Sign In" : "Sign Up"}
        </motion.button>
      ))}
    </div>
  );
}

/* ─── Left brand panel ──────────────────────────────────────────────────── */

function BrandPanel({ mode }: { mode: AuthMode }) {
  const copy = BRAND_COPY[mode];
  return (
    <div style={{ position: "relative", overflow: "hidden", minHeight: 580, background: "#0a0600", display: "flex", flexDirection: "column" }}>
      {/* Top bar: clickable logo (goes to the landing page) + eyebrow */}
      <div style={{ position: "relative", zIndex: 4, padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link to={LANDING_PATH} className="auth-brand-link" title="Back to home" aria-label="The Crunch – back to home">
          <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} style={{ width: "100%", height: "100%" }}>
            <img src={crunchLogo} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          </motion.div>
        </Link>
        <AnimatePresence mode="wait">
          <motion.span
            key={mode}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.3 }}
            style={{ color: Y, fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase" }}
          >
            {copy.eyebrow}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Hero image with a dark fade at the bottom so the text stays readable */}
      <motion.div
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        style={{ position: "relative", zIndex: 2, flex: 1, margin: "16px 16px 0", borderRadius: 18, overflow: "hidden", minHeight: 0 }}
      >
        <img src={crunchImg} alt="Boneless Crunchy Savory" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 55%, rgba(8,5,1,0.85) 100%)", pointerEvents: "none" }} />
      </motion.div>

      {/* Heading, description and tags */}
      <div style={{ position: "relative", zIndex: 4, padding: "14px 24px 24px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 style={{ margin: "0 0 6px", color: "#fff", fontSize: "clamp(20px, 2.2vw, 28px)", lineHeight: 1.15, fontWeight: 800, whiteSpace: "pre-line" }}>
              {copy.heading}
            </h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.75 }}>{copy.sub}</p>
          </motion.div>
        </AnimatePresence>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 14 }}>
          {HERO_TAGS.map((tag, i) => (
            <motion.span
              key={tag}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08, duration: 0.35 }}
              style={{ padding: "5px 13px", borderRadius: 999, background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.18)", color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 600 }}
            >
              {tag}
            </motion.span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Modal shell (shared by both modals) ───────────────────────────────── */

function ModalShell({ open, zIndex, Icon, eyebrow, title, onClose, children }: {
  open: boolean; zIndex: number; Icon: LucideIcon; eyebrow: string; title: string; onClose: () => void; children: ReactNode;
}) {
  // Close when the user presses Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ position: "fixed", inset: 0, zIndex, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            style={{ width: "min(460px, 100%)", background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 22, boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 60px ${Y}18`, padding: "28px 28px 24px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(245,197,24,0.15)", border: `1px solid ${Y}30`, display: "grid", placeItems: "center" }}>
                <Icon size={17} color={Y} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: Y }}>{eyebrow}</p>
                <h2 style={{ margin: 0, color: "#fff", fontSize: 20, fontWeight: 700 }}>{title}</h2>
              </div>
            </div>
            {children}
            <button type="button" onClick={onClose} style={{ ...textButton, marginTop: 14, width: "100%" }}>Close</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Hook: email verification ──────────────────────────────────────────── */

function useEmailVerification(onVerified: (email: string) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [v, setV] = useState({ email: "", code: "", error: "", success: "" });
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);

  // Delayed close after success (cancelled if the page unmounts)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const update = (patch: Partial<typeof v>) => setV((c) => ({ ...c, ...patch }));

  // Opens the modal for an email, with an optional starting message
  const open = useCallback((email: string, msg?: { error?: string; success?: string }) => {
    clearTimeout(closeTimer.current);
    setV({ email: normalizeEmail(email), code: "", error: msg?.error ?? "", success: msg?.success ?? "" });
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setV((c) => ({ ...c, code: "", error: "", success: "" }));
  }, []);

  const changeCode = (value: string) => update({ code: sanitizeCode(value), error: "" });

  const verify = async () => {
    const email = normalizeEmail(v.email);
    if (!email || v.code.length !== CODE_LEN) return update({ error: `Enter the ${CODE_LEN}-digit code.` });
    setBusy("verify");
    update({ error: "", success: "" });
    try {
      await authApi.verifyEmail(email, v.code);
      update({ success: "Email verified! Your account has been created." });
      onVerified(email);
      closeTimer.current = setTimeout(close, 1200); // let the user read the message first
    } catch (err) {
      update({ error: errorText(err, "Could not verify.") });
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    const email = normalizeEmail(v.email);
    if (!email) return update({ error: "Enter your email first." });
    setBusy("resend");
    update({ error: "", success: "" });
    try {
      await authApi.resendVerification(email);
      update({ success: "New code sent." });
    } catch (err) {
      update({ error: errorText(err, "Could not resend.") });
    } finally {
      setBusy(null);
    }
  };

  return { ...v, isOpen, busy, open, close, changeCode, verify, resend };
}

/* ─── Hook: forgot password ─────────────────────────────────────────────── */

interface ForgotForm {
  step: 1 | 2; // 1 = ask for email, 2 = enter code + new password
  email: string; code: string; newPassword: string; confirmPassword: string; message: string; error: string;
}
const EMPTY_FORGOT: ForgotForm = { step: 1, email: "", code: "", newPassword: "", confirmPassword: "", message: "", error: "" };

function useForgotPassword(onResetComplete: (email: string) => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [f, setF] = useState<ForgotForm>(EMPTY_FORGOT);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Updates fields and clears the current error
  const update = (patch: Partial<ForgotForm>) => setF((c) => ({ ...c, error: "", ...patch }));

  const open = useCallback((email: string) => {
    setF({ ...EMPTY_FORGOT, email: normalizeEmail(email) });
    setIsSubmitting(false);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setF(EMPTY_FORGOT);
    setIsSubmitting(false);
  }, []);

  const sendCode = async () => {
    const email = normalizeEmail(f.email);
    if (!email) return update({ error: "Enter your email first." });
    setIsSubmitting(true);
    update({ message: "" });
    try {
      const data = await authApi.forgotPassword(email);
      update({ message: data.message || "If that email is registered, a reset code has been sent.", step: 2 });
    } catch (err) {
      update({ error: errorText(err, "Could not send reset code.") });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetPassword = async () => {
    const email = normalizeEmail(f.email);
    if (!email || !f.code || !f.newPassword || !f.confirmPassword) return update({ error: "Complete all fields first." });
    if (f.newPassword.length < MIN_PASSWORD) return update({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
    if (f.newPassword !== f.confirmPassword) return update({ error: "Passwords don't match." });
    setIsSubmitting(true);
    update({ message: "" });
    try {
      await authApi.resetPassword(email, f.code, f.newPassword);
      close();
      onResetComplete(email);
    } catch (err) {
      update({ error: errorText(err, "Could not reset password.") });
      setIsSubmitting(false);
    }
  };

  return { ...f, isOpen, isSubmitting, open, close, update, sendCode, resetPassword };
}

/* ─── Modals ────────────────────────────────────────────────────────────── */

function VerifyEmailModal({ v }: { v: ReturnType<typeof useEmailVerification> }) {
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void v.verify(); }; // Enter key verifies
  return (
    <ModalShell open={v.isOpen} zIndex={50} Icon={Mail} eyebrow="Verify Email" title={`Enter your ${CODE_LEN}-digit code`} onClose={v.close}>
      <form onSubmit={onSubmit} style={stack}>
        <p style={description}>
          We sent a code to <strong style={{ color: "#fff" }}>{v.email || "your email"}</strong>. Expires in 10 minutes.
        </p>
        <StatusMessage tone="error" message={v.error} />
        <StatusMessage tone="success" message={v.success} />

        <Field label="Verification Code">
          <motion.input
            value={v.code}
            onChange={(e) => v.changeCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LEN}
            placeholder="• • • • • •"
            autoFocus
            whileFocus={{ boxShadow: `0 0 0 2px ${Y}55` }}
            style={{
              width: "100%", borderRadius: 14, border: "none", background: "rgba(255,255,255,0.05)", color: Y,
              padding: "16px 14px", fontSize: 24, fontWeight: 700, textAlign: "center", letterSpacing: "0.5em",
              outline: "none", boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
            }}
          />
        </Field>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <PrimaryButton disabled={v.busy === "verify" || v.code.length !== CODE_LEN} style={{ flex: 2, width: "auto", marginTop: 0 }}>
            {v.busy === "verify" ? "Verifying…" : "Verify"}
          </PrimaryButton>
          <motion.button
            type="button"
            onClick={() => void v.resend()}
            disabled={v.busy === "resend" || !v.email}
            whileHover={{ borderColor: `${Y}55` }}
            style={{ flex: 1, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#fff", padding: 14, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            {v.busy === "resend" ? "Sending…" : "Resend"}
          </motion.button>
        </div>
      </form>
    </ModalShell>
  );
}

function ForgotPasswordModal({ f }: { f: ReturnType<typeof useForgotPassword> }) {
  const stepOne = f.step === 1;

  // Button stays disabled until the needed fields are filled in
  const canSubmit = stepOne ? !!f.email.trim() : !!(f.email.trim() && f.code && f.newPassword && f.confirmPassword);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault(); // Enter key continues
    if (canSubmit && !f.isSubmitting) void (stepOne ? f.sendCode() : f.resetPassword());
  };

  return (
    <ModalShell open={f.isOpen} zIndex={60} Icon={Lock} eyebrow="Forgot Password" title={stepOne ? "Send reset code" : "Reset your password"} onClose={f.close}>
      <form onSubmit={onSubmit} style={stack}>
        <p style={description}>
          {stepOne
            ? `Enter your email and we’ll send a ${CODE_LEN}-digit reset code if the account exists.`
            : "Enter the reset code from your email and choose a new password."}
        </p>
        <StatusMessage tone="error" message={f.error} />
        <StatusMessage tone="success" message={f.message} />

        <InputField
          label="Email Address" Icon={Mail} name="forgotEmail" type="email" placeholder="you@example.com"
          autoComplete="email" required value={f.email} onChange={(e) => f.update({ email: e.target.value })}
        />
        {!stepOne && (
          <>
            <InputField
              label="Reset Code" Icon={Mail} name="resetCode" placeholder={`${CODE_LEN}-digit code`} autoComplete="one-time-code"
              inputMode="numeric" maxLength={CODE_LEN} required value={f.code} onChange={(e) => f.update({ code: sanitizeCode(e.target.value) })}
            />
            <PasswordField
              label="New Password" name="newPassword" placeholder={`Minimum ${MIN_PASSWORD} characters`} autoComplete="new-password"
              maxLength={MAX_LEN} value={f.newPassword} onChange={(e) => f.update({ newPassword: e.target.value })}
            />
            <PasswordField
              label="Confirm Password" name="confirmNewPassword" placeholder="Re-enter your new password" autoComplete="new-password"
              maxLength={MAX_LEN} value={f.confirmPassword} onChange={(e) => f.update({ confirmPassword: e.target.value })}
            />
          </>
        )}
        <PrimaryButton disabled={f.isSubmitting || !canSubmit}>
          {f.isSubmitting ? (stepOne ? "Sending…" : "Resetting…") : stepOne ? "Send reset code" : "Reset password"}
        </PrimaryButton>
      </form>
    </ModalShell>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ tone: Tone; text: string } | null>(null);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);

  const isSignUp = mode === "signup";
  const direction = isSignUp ? 1 : -1; // which way the "book page" flips

  // Switches tabs and clears passwords + old messages
  const switchMode = useCallback((next: AuthMode) => {
    setMode(next);
    setStatus(null);
    setFormData((c) => ({ ...c, password: "", confirmPassword: "" }));
  }, []);

  // Fills in the email and goes back to the sign in tab
  const goToSignIn = (email: string) => {
    switchMode("signin");
    setFormData((c) => ({ ...c, email, password: "", confirmPassword: "" }));
  };

  const verification = useEmailVerification(goToSignIn);
  const forgot = useForgotPassword((email) => {
    goToSignIn(email);
    setStatus({ tone: "success", text: "Password reset successfully. You can sign in now." });
  });

  // Supports links like /login?tab=signup and /login?verifyEmail=you@example.com
  const openVerification = verification.open;
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("tab") === "signup") switchMode("signup");
    const pendingEmail = params.get("verifyEmail");
    if (pendingEmail) openVerification(pendingEmail);
  }, [location.search, switchMode, openVerification]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) =>
    setFormData((c) => ({ ...c, [e.target.name]: e.target.value }));

  const handleSignIn = async () => {
    const data = await authApi.login(normalizeEmail(formData.email), formData.password);
    login({
      token: data.token, username: data.username, email: data.email, role: data.role,
      userId: String(data.userId), email_verified: data.email_verified,
    });
    navigate(ROLE_HOME_PATH[data.role] ?? LANDING_PATH, { replace: true });
  };

  const handleSignUp = async () => {
    const problem = validateSignUp(formData);
    if (problem) throw new Error(problem);

    const name = formData.name.trim();
    const email = normalizeEmail(formData.email);
    const result = await authApi.register(name, email, formData.password);
    setFormData({ name, email, password: "", confirmPassword: "" });

    if (result.requiresEmailVerification) {
      verification.open(email, { success: "Code sent. Enter it to activate your account." });
    } else {
      // No verification needed, so the account is ready to use
      switchMode("signin");
      setStatus({ tone: "success", text: "Account created. You can sign in now." });
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;
    setStatus(null);
    setIsLoading(true);
    try {
      await (isSignUp ? handleSignUp() : handleSignIn());
    } catch (err) {
      const apiError = err as ApiErrorLike;
      // Sign in was blocked because the email isn't verified yet, so open the verify modal
      if (!isSignUp && apiError?.status === 403 && apiError.data?.requiresEmailVerification) {
        verification.open(apiError.data.email || formData.email, { error: apiError.message || "Please verify your email first." });
        return;
      }
      setStatus({ tone: "error", text: errorText(err, "Authentication failed.") });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="auth-root"
      style={{
        minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px 16px", position: "relative",
        fontFamily: "'Poppins', sans-serif",
        background: "radial-gradient(ellipse at 20% 10%, rgba(245,197,24,0.05), transparent 40%), radial-gradient(ellipse at 80% 90%, rgba(245,197,24,0.03), transparent 40%), linear-gradient(135deg, #0a0600 0%, #060402 55%, #0c0802 100%)",
      }}
    >
      {/* Page styles (scoped to this page where possible) */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');
        .auth-root, .auth-root * { box-sizing: border-box; }
        .auth-root button, .auth-root input { font-family: inherit; }
        .auth-root input::placeholder { color: rgba(255,255,255,0.25); }
        .auth-brand-link { display: block; width: 44px; height: 44px; border-radius: 12px; outline: none; cursor: pointer; }
        .auth-brand-link:focus-visible { box-shadow: 0 0 0 2px ${Y}; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      <Orbs />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: "min(1000px, 100%)", position: "relative", zIndex: 1, display: "grid",
          gridTemplateColumns: "minmax(280px, 0.9fr) minmax(340px, 1fr)", background: "rgba(16,10,3,0.82)",
          border: `1px solid ${BORDER}`, borderRadius: 28, overflow: "hidden", backdropFilter: "blur(24px)", perspective: 1200,
          boxShadow: "0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(245,197,24,0.06), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <BrandPanel mode={mode} />

        {/* Right panel: book-page flip between sign in and sign up */}
        <div style={{ background: PANEL, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 12, background: "linear-gradient(to right, rgba(0,0,0,0.3), transparent)", pointerEvents: "none", zIndex: 2 }} />

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
              <TabSwitcher mode={mode} onSwitch={switchMode} />

              <form onSubmit={handleSubmit} style={{ ...stack, marginTop: 24 }}>
                <StatusMessage tone={status?.tone ?? "error"} message={status?.text ?? ""} />

                {/* Full name is only needed when creating an account */}
                {isSignUp && (
                  <InputField
                    label="Full Name" Icon={User} name="name" placeholder="Your full name" autoComplete="name"
                    required maxLength={MAX_LEN} value={formData.name} onChange={handleChange}
                  />
                )}
                <InputField
                  label="Email Address" Icon={Mail} name="email" type="email" placeholder="you@example.com" autoComplete="email"
                  required maxLength={isSignUp ? MAX_LEN : undefined} value={formData.email} onChange={handleChange}
                />
                <PasswordField
                  label="Password" name="password" value={formData.password} onChange={handleChange}
                  placeholder={isSignUp ? `Minimum ${MIN_PASSWORD} characters` : "Enter your password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"} maxLength={isSignUp ? MAX_LEN : undefined}
                />
                {isSignUp ? (
                  <PasswordField
                    label="Confirm Password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                    placeholder="Re-enter your password" autoComplete="new-password" maxLength={MAX_LEN}
                  />
                ) : (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => forgot.open(formData.email)} style={textButton}>Forgot password?</button>
                  </div>
                )}

                <PrimaryButton disabled={isLoading}>
                  {isLoading ? (isSignUp ? "Sending code…" : "Signing in…") : isSignUp ? "Send Verification Code" : "Sign In"}
                </PrimaryButton>
              </form>

              {/* "Need an account? Sign up" line */}
              <p style={{ margin: "20px 0 0", color: MUTED, fontSize: 12 }}>
                {isSignUp ? "Have an account? " : "Need an account? "}
                <button type="button" onClick={() => switchMode(isSignUp ? "signin" : "signup")} style={{ ...textButton, color: Y, fontWeight: 700 }}>
                  {isSignUp ? "Sign in" : "Sign up"}
                </button>
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      <VerifyEmailModal v={verification} />
      <ForgotPasswordModal f={forgot} />
    </div>
  );
}