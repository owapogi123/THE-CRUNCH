import { useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Lock, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { authApi } from "../lib/api";
import crunchImg from "../assets/img/crunch22.png";
import crunchLogo from "../assets/img/crunchlogo.png";

/* ─── tokens (matches login.tsx) ─────────────────────────────────────── */
const Y = "#F5C518";
const SURFACE = "rgba(16,10,3,0.82)";
const PANEL = "rgba(22,14,5,0.90)";
const BORDER = "rgba(245,197,24,0.12)";
const TEXT_MUTED = "rgba(255,255,255,0.45)";

type Step = "email" | "code" | "newpassword" | "done";

/* ─── floating orbs ─────────────────────────────────────────────────── */
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
            position: "absolute", left: orb.x, top: orb.y,
            width: orb.size, height: orb.size, borderRadius: "50%",
            background: `radial-gradient(circle, ${Y}, transparent 70%)`,
            transform: "translate(-50%, -50%)", filter: "blur(2px)",
          }}
        />
      ))}
    </div>
  );
}

/* ─── field wrapper ─────────────────────────────────────────────────── */
function Field({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{
        fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
        color: TEXT_MUTED, fontWeight: 700, fontFamily: "'Poppins', sans-serif",
        display: "flex", alignItems: "center", gap: 5,
      }}>
        {icon && <span style={{ opacity: 0.6 }}>{icon}</span>}
        {label}
      </span>
      {children}
    </label>
  );
}

/* ─── text input ─────────────────────────────────────────────────────── */
function TextInput({
  name, type = "text", value, onChange, placeholder, autoComplete, icon, rightSlot,
}: {
  name: string; type?: string; value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string; autoComplete?: string;
  icon?: ReactNode; rightSlot?: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div
      animate={{ boxShadow: focused ? `0 0 0 2px ${Y}55` : "0 0 0 1px rgba(255,255,255,0.08)" }}
      style={{ position: "relative", borderRadius: 14, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}
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
        name={name} type={type} value={value} onChange={onChange}
        placeholder={placeholder} autoComplete={autoComplete}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: "100%", border: "none", background: "transparent", color: "#fff",
          padding: icon ? "13px 42px 13px 42px" : rightSlot ? "13px 42px 13px 14px" : "13px 14px",
          fontSize: 14, fontFamily: "'Poppins', sans-serif", outline: "none", boxSizing: "border-box",
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

/* ─── password input ─────────────────────────────────────────────────── */
function PasswordInput({ name, value, onChange, placeholder, autoComplete }: {
  name: string; value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string; autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <TextInput
      name={name} type={visible ? "text" : "password"}
      value={value} onChange={onChange}
      placeholder={placeholder} autoComplete={autoComplete}
      icon={<Lock size={15} />}
      rightSlot={
        <button type="button" onClick={() => setVisible(v => !v)}
          style={{ border: "none", background: "none", color: TEXT_MUTED, cursor: "pointer", display: "flex", padding: 0 }}>
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      }
    />
  );
}

/* ─── primary button ─────────────────────────────────────────────────── */
function PrimaryButton({ children, disabled, onClick }: {
  children: ReactNode; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <motion.button
      type="button" onClick={onClick} disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.015, boxShadow: `0 8px 32px ${Y}55` }}
      whileTap={disabled ? {} : { scale: 0.985 }}
      style={{
        border: "none", borderRadius: 14,
        background: disabled ? "rgba(245,197,24,0.35)" : `linear-gradient(135deg, ${Y} 0%, #e6b800 100%)`,
        color: "#111", padding: "14px 16px", fontWeight: 700,
        fontFamily: "'Poppins', sans-serif", fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        width: "100%", letterSpacing: "0.02em",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}
    >
      {children}
    </motion.button>
  );
}

/* ─── status message ─────────────────────────────────────────────────── */
function StatusMessage({ message, type }: { message: string; type: "error" | "success" }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p
          key={message}
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          style={{
            margin: 0, fontSize: 12, textAlign: "center",
            color: type === "error" ? "#fca5a5" : "#86efac",
            fontFamily: "'Poppins', sans-serif",
          }}
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/* ─── step progress dots ─────────────────────────────────────────────── */
function StepDots({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          animate={{
            width: i === current ? 22 : 6,
            background: i <= current ? Y : "rgba(255,255,255,0.15)",
          }}
          transition={{ duration: 0.3 }}
          style={{ height: 6, borderRadius: 999 }}
        />
      ))}
    </div>
  );
}

/* ─── password strength bar ──────────────────────────────────────────── */
function StrengthBar({ password }: { password: string }) {
  if (!password.length) return null;
  const strength =
    password.length >= 12 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password) ? 4
    : password.length >= 10 && /[A-Z]/.test(password) && /[0-9]/.test(password) ? 3
    : password.length >= 8 ? 2 : 1;
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e"];
  const labels = ["Too short", "Acceptable", "Good", "Strong"];
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
        {[1, 2, 3, 4].map(lvl => (
          <motion.div
            key={lvl}
            animate={{ background: lvl <= strength ? colors[strength - 1] : "rgba(255,255,255,0.1)" }}
            transition={{ duration: 0.25 }}
            style={{ flex: 1, height: 3, borderRadius: 999 }}
          />
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 10, color: colors[strength - 1], fontFamily: "'Poppins', sans-serif", fontWeight: 600 }}>
        {labels[strength - 1]}
      </p>
    </motion.div>
  );
}

/* ─── left panel copy per step ───────────────────────────────────────── */
const LEFT = {
  email:  { eyebrow: "Account Recovery", heading: "Forgot your\npassword?",       sub: "Enter your registered email and we'll send a 6-digit reset code to your inbox." },
  code:   { eyebrow: "Check Your Email",  heading: "Enter the\ncode we sent",      sub: "A 6-digit code was sent to your inbox. It expires in 10 minutes." },
  newpassword: { eyebrow: "Almost There", heading: "Create a new\npassword",       sub: "Choose something strong. Your account will be secured immediately." },
  done:   { eyebrow: "All Done",          heading: "Password\nreset!",             sub: "Your password has been updated. Sign in with your new credentials." },
};

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════ */
export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep]       = useState<Step>("email");
  const [direction, setDir]   = useState(1);
  const [email, setEmail]     = useState("");
  const [code, setCode]       = useState("");
  const [newPw, setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResend] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  const ORDER: Step[] = ["email", "code", "newpassword", "done"];

  const goTo = (next: Step) => {
    setDir(ORDER.indexOf(next) > ORDER.indexOf(step) ? 1 : -1);
    setStep(next);
    setError(""); setSuccess("");
  };

  const left = LEFT[step];

  /* send code */
  const handleSendCode = async () => {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      goTo("code");
    } catch (e: any) { setError(e.message || "Could not send reset code."); }
    finally { setLoading(false); }
  };

  /* resend */
  const handleResend = async () => {
    setResend(true); setError(""); setSuccess("");
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSuccess("A new code has been sent.");
    } catch (e: any) { setError(e.message || "Could not resend."); }
    finally { setResend(false); }
  };

  /* proceed to reset after entering the emailed code */
  const handleVerifyCode = async () => {
    if (code.length !== 6) { setError("Enter the 6-digit code from your email."); return; }
    setError("");
    goTo("newpassword");
  };

  /* reset password */
  const handleReset = async () => {
    if (newPw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setError("Passwords don't match."); return; }
    setLoading(true); setError("");
    try {
      await authApi.resetPassword(email.trim().toLowerCase(), code, newPw);
      goTo("done");
    } catch (e: any) { setError(e.message || "Could not reset password."); }
    finally { setLoading(false); }
  };

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
            background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 28,
            overflow: "hidden",
            boxShadow: `0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(245,197,24,0.06), inset 0 1px 0 rgba(255,255,255,0.06)`,
            backdropFilter: "blur(24px)",
          }}
        >

          {/* ══ LEFT PANEL ══ */}
          <div style={{ position: "relative", overflow: "hidden", minHeight: 580, background: "#0a0600", display: "flex", flexDirection: "column" }}>
            {/* top bar */}
            <div style={{ position: "relative", zIndex: 4, padding: "24px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} style={{ width: 44, height: 44, cursor: "default" }}>
                <img src={crunchLogo} alt="The Crunch" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </motion.div>
              <AnimatePresence mode="wait">
                <motion.span
                  key={step}
                  initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.3 }}
                  style={{ color: Y, fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", fontFamily: "'Poppins', sans-serif" }}
                >
                  {left.eyebrow}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* hero image */}
            <motion.div
              initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              style={{ position: "relative", zIndex: 2, flex: 1, margin: "16px 16px 0", borderRadius: 18, overflow: "hidden", minHeight: 0 }}
            >
              <img src={crunchImg} alt="The Crunch" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 55%, rgba(8,5,1,0.85) 100%)", pointerEvents: "none" }} />
            </motion.div>

            {/* bottom text */}
            <div style={{ position: "relative", zIndex: 4, padding: "14px 24px 24px", flexShrink: 0 }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h1 style={{ margin: "0 0 6px", color: "#fff", fontSize: "clamp(20px, 2.2vw, 28px)", lineHeight: 1.15, fontWeight: 800, fontFamily: "'Poppins', sans-serif", whiteSpace: "pre-line" }}>
                    {left.heading}
                  </h1>
                  <p style={{ margin: 0, color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 1.75, fontFamily: "'Poppins', sans-serif" }}>
                    {left.sub}
                  </p>
                </motion.div>
              </AnimatePresence>

              <motion.div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 14 }}>
                {[{ icon: "🔥", label: "Boneless" }, { icon: "⚡", label: "Crunchy" }, { icon: "✨", label: "Savory" }].map((tag, i) => (
                  <motion.span key={tag.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.08 }}
                    style={{ padding: "5px 13px", borderRadius: 999, background: "rgba(245,197,24,0.08)", border: "1px solid rgba(245,197,24,0.18)", color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 600, fontFamily: "'Poppins', sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
                    {tag.icon} {tag.label}
                  </motion.span>
                ))}
              </motion.div>
            </div>
          </div>

          {/* ══ RIGHT PANEL ══ */}
          <div style={{ background: PANEL, position: "relative", overflow: "hidden" }}>
            {/* book spine shadow */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 12, background: "linear-gradient(to right, rgba(0,0,0,0.3), transparent)", pointerEvents: "none", zIndex: 2 }} />

            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                initial={{ rotateY: direction * -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: direction * 90, opacity: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 26 }}
                style={{ padding: "36px 32px", transformStyle: "preserve-3d", perspective: 1000, height: "100%", display: "flex", flexDirection: "column" }}
              >

                {/* ── STEP 1: ENTER EMAIL ── */}
                {step === "email" && (
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <motion.button type="button" onClick={() => navigate("/login")} whileHover={{ x: -3 }}
                      style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", color: TEXT_MUTED, cursor: "pointer", fontSize: 12, fontFamily: "'Poppins', sans-serif", padding: 0, marginBottom: 28 }}>
                      <ArrowLeft size={13} /> Back to Sign In
                    </motion.button>

                    <StepDots current={0} />

                    <div style={{ marginTop: 14, marginBottom: 24 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: Y, fontFamily: "'Poppins', sans-serif" }}>Step 1 of 3</p>
                      <h2 style={{ margin: "0 0 8px", color: "#fff", fontSize: 26, fontWeight: 800, fontFamily: "'Poppins', sans-serif", lineHeight: 1.1 }}>Enter your email</h2>
                      <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 13, lineHeight: 1.7, fontFamily: "'Poppins', sans-serif" }}>
                        We'll send a 6-digit reset code straight to your inbox.
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <StatusMessage message={error} type="error" />
                      <Field label="Email Address" icon={<Mail size={11} />}>
                        <TextInput name="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                          placeholder="you@example.com" autoComplete="email" icon={<Mail size={15} />} />
                      </Field>
                      <PrimaryButton onClick={handleSendCode} disabled={loading}>
                        {loading ? "Sending code…" : "Send Reset Code"}
                      </PrimaryButton>
                    </div>

                    <p style={{ marginTop: "auto", paddingTop: 24, color: TEXT_MUTED, fontSize: 12, fontFamily: "'Poppins', sans-serif", textAlign: "center" }}>
                      Remembered your password?{" "}
                      <button type="button" onClick={() => navigate("/login")}
                        style={{ border: "none", background: "none", color: Y, cursor: "pointer", fontWeight: 700, fontFamily: "'Poppins', sans-serif", fontSize: 12, padding: 0 }}>
                        Sign in
                      </button>
                    </p>
                  </div>
                )}

                {/* ── STEP 2: ENTER CODE ── */}
                {step === "code" && (
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <motion.button type="button" onClick={() => goTo("email")} whileHover={{ x: -3 }}
                      style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", color: TEXT_MUTED, cursor: "pointer", fontSize: 12, fontFamily: "'Poppins', sans-serif", padding: 0, marginBottom: 28 }}>
                      <ArrowLeft size={13} /> Back
                    </motion.button>

                    <StepDots current={1} />

                    <div style={{ marginTop: 14, marginBottom: 20 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: Y, fontFamily: "'Poppins', sans-serif" }}>Step 2 of 3</p>
                      <h2 style={{ margin: "0 0 8px", color: "#fff", fontSize: 26, fontWeight: 800, fontFamily: "'Poppins', sans-serif", lineHeight: 1.1 }}>Check your inbox</h2>
                      <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 13, lineHeight: 1.7, fontFamily: "'Poppins', sans-serif" }}>
                        Code sent to <strong style={{ color: "#fff" }}>{email}</strong>. Expires in 10 minutes.
                      </p>
                    </div>

                    {/* mail badge */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.15 }}
                      style={{ width: 54, height: 54, borderRadius: 16, background: "rgba(245,197,24,0.1)", border: `1px solid rgba(245,197,24,0.2)`, display: "grid", placeItems: "center", marginBottom: 18 }}
                    >
                      <Mail size={22} color={Y} />
                    </motion.div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <StatusMessage message={error} type="error" />
                      <StatusMessage message={success} type="success" />

                      <Field label="6-Digit Code">
                        <motion.input
                          value={code}
                          onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                          inputMode="numeric" maxLength={6} placeholder="• • • • • •"
                          whileFocus={{ boxShadow: `0 0 0 2px ${Y}55` }}
                          style={{
                            width: "100%", borderRadius: 14, border: "none",
                            background: "rgba(255,255,255,0.05)", color: Y,
                            padding: "16px 14px", fontSize: 28, fontWeight: 800,
                            fontFamily: "'Poppins', sans-serif", textAlign: "center",
                            letterSpacing: "0.45em", outline: "none", boxSizing: "border-box",
                            boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
                          }}
                        />
                      </Field>

                      <PrimaryButton onClick={handleVerifyCode} disabled={loading || code.length !== 6}>
                        {loading ? "Verifying…" : "Verify Code"}
                      </PrimaryButton>
                    </div>

                    <p style={{ marginTop: "auto", paddingTop: 24, color: TEXT_MUTED, fontSize: 12, fontFamily: "'Poppins', sans-serif", textAlign: "center" }}>
                      Didn't receive it?{" "}
                      <button type="button" onClick={handleResend} disabled={resending}
                        style={{ border: "none", background: "none", color: Y, cursor: resending ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "'Poppins', sans-serif", fontSize: 12, padding: 0, opacity: resending ? 0.6 : 1 }}>
                        {resending ? "Sending…" : "Resend code"}
                      </button>
                    </p>
                  </div>
                )}

                {/* ── STEP 3: NEW PASSWORD ── */}
                {step === "newpassword" && (
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <motion.button type="button" onClick={() => goTo("code")} whileHover={{ x: -3 }}
                      style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", color: TEXT_MUTED, cursor: "pointer", fontSize: 12, fontFamily: "'Poppins', sans-serif", padding: 0, marginBottom: 28 }}>
                      <ArrowLeft size={13} /> Back
                    </motion.button>

                    <StepDots current={2} />

                    <div style={{ marginTop: 14, marginBottom: 20 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: Y, fontFamily: "'Poppins', sans-serif" }}>Step 3 of 3</p>
                      <h2 style={{ margin: "0 0 8px", color: "#fff", fontSize: 26, fontWeight: 800, fontFamily: "'Poppins', sans-serif", lineHeight: 1.1 }}>New password</h2>
                      <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 13, lineHeight: 1.7, fontFamily: "'Poppins', sans-serif" }}>
                        Choose something strong — minimum 8 characters.
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <StatusMessage message={error} type="error" />

                      <Field label="New Password" icon={<Lock size={11} />}>
                        <PasswordInput name="newPassword" value={newPw} onChange={e => setNewPw(e.target.value)}
                          placeholder="Minimum 8 characters" autoComplete="new-password" />
                      </Field>

                      <StrengthBar password={newPw} />

                      <Field label="Confirm Password" icon={<Lock size={11} />}>
                        <PasswordInput name="confirmPassword" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                          placeholder="Re-enter your password" autoComplete="new-password" />
                      </Field>

                      <PrimaryButton onClick={handleReset} disabled={loading}>
                        {loading ? "Resetting…" : "Reset Password"}
                      </PrimaryButton>
                    </div>
                  </div>
                )}

                {/* ── STEP 4: DONE ── */}
                {step === "done" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 22, textAlign: "center" }}>
                    <motion.div
                      initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                      style={{ width: 74, height: 74, borderRadius: "50%", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", display: "grid", placeItems: "center" }}
                    >
                      <CheckCircle2 size={36} color="#22c55e" />
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                      <h2 style={{ margin: "0 0 10px", color: "#fff", fontSize: 26, fontWeight: 800, fontFamily: "'Poppins', sans-serif" }}>Password reset!</h2>
                      <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 13, lineHeight: 1.75, fontFamily: "'Poppins', sans-serif", maxWidth: 280 }}>
                        Your password has been updated. You can now sign in with your new credentials.
                      </p>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} style={{ width: "100%" }}>
                      <PrimaryButton onClick={() => navigate("/login")}>
                        Back to Sign In
                      </PrimaryButton>
                    </motion.div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>

        </motion.div>
      </div>
    </>
  );
}
