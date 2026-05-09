import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { authApi } from "../lib/api";
import { useAuth } from "../context/authcontext";

const YELLOW = "#F5C518";
const SURFACE = "rgba(20, 12, 4, 0.72)";
const PANEL = "rgba(28, 18, 8, 0.86)";

const ROLE_MAP: Record<string, string> = {
  administrator: "/dashboard",
  cashier: "/orders",
  cook: "/orders",
  inventory_manager: "/inventory",
  customer: "/products",
};

type AuthMode = "signin" | "signup";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.42)",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function inputStyle(hasIcon = false): CSSProperties {
  return {
    width: "100%",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    padding: hasIcon ? "13px 42px 13px 14px" : "13px 14px",
    fontSize: 14,
    outline: "none",
  };
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  visible,
  onToggle,
  autoComplete,
  name,
}: {
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
  name: string;
}) {
  return (
    <Field label={label}>
      <div style={{ position: "relative" }}>
        <input
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          style={inputStyle(true)}
        />
        <button
          type="button"
          onClick={onToggle}
          style={{
            position: "absolute",
            right: 12,
            top: "50%",
            transform: "translateY(-50%)",
            border: "none",
            background: "none",
            color: "rgba(255,255,255,0.45)",
            cursor: "pointer",
            display: "flex",
          }}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </Field>
  );
}

function VerifyEmailModal({
  open,
  email,
  code,
  error,
  success,
  isVerifying,
  isResending,
  onClose,
  onCodeChange,
  onVerify,
  onResend,
}: {
  open: boolean;
  email: string;
  code: string;
  error: string;
  success: string;
  isVerifying: boolean;
  isResending: boolean;
  onClose: () => void;
  onCodeChange: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,0.78)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            style={{
              width: "min(460px, 100%)",
              background: PANEL,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
              padding: 24,
            }}
          >
            <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: YELLOW }}>
              Verify Email
            </p>
            <h2 style={{ margin: "0 0 10px", color: "#fff", fontSize: 26 }}>
              Enter your 6-digit code
            </h2>
            <p style={{ margin: "0 0 16px", color: "rgba(255,255,255,0.62)", fontSize: 13, lineHeight: 1.7 }}>
              We sent a verification code to <strong style={{ color: "#fff" }}>{email || "your email"}</strong>. It expires in 10 minutes.
            </p>

            {error ? (
              <p style={{ margin: "0 0 12px", color: "#fca5a5", fontSize: 12, textAlign: "center" }}>{error}</p>
            ) : null}
            {success ? (
              <p style={{ margin: "0 0 12px", color: "#86efac", fontSize: 12, textAlign: "center" }}>{success}</p>
            ) : null}

            <Field label="Verification Code">
              <input
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                style={{
                  ...inputStyle(),
                  textAlign: "center",
                  letterSpacing: "0.35em",
                  fontSize: 20,
                  fontWeight: 700,
                }}
              />
            </Field>

            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onVerify}
                disabled={isVerifying || code.trim().length !== 6}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  border: "none",
                  background: YELLOW,
                  color: "#111",
                  padding: "13px 14px",
                  fontWeight: 700,
                  cursor: isVerifying ? "not-allowed" : "pointer",
                  opacity: isVerifying ? 0.7 : 1,
                }}
              >
                {isVerifying ? "Verifying..." : "Verify"}
              </button>
              <button
                type="button"
                onClick={onResend}
                disabled={isResending || !email}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  padding: "13px 14px",
                  fontWeight: 700,
                  cursor: isResending ? "not-allowed" : "pointer",
                  opacity: isResending ? 0.7 : 1,
                }}
              >
                {isResending ? "Sending..." : "Resend Code"}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                marginTop: 12,
                width: "100%",
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.45)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [verificationSuccess, setVerificationSuccess] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("tab") === "signup") {
      setMode("signup");
    }

    const email = params.get("verifyEmail");
    if (email) {
      setVerificationEmail(email.trim().toLowerCase());
      setVerificationOpen(true);
      setVerificationError("");
      setVerificationSuccess("");
      setMode("signin");
    }
  }, [location.search]);

  const title = useMemo(
    () =>
      mode === "signin"
        ? {
            eyebrow: "Welcome Back",
            heading: "Sign in to continue your order",
            sub: "Customer accounts must verify their email first before sign-in is allowed.",
          }
        : {
            eyebrow: "Create Account",
            heading: "Register and verify your email",
            sub: "We’ll create the customer account first, then send a 6-digit verification code through Resend.",
          },
    [mode],
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData((current) => ({
      ...current,
      [e.target.name]: e.target.value,
    }));
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormData((current) => ({
      ...current,
      password: "",
      confirmPassword: "",
      ...(nextMode === "signin" ? {} : { name: current.name }),
    }));
  };

  const handleVerifyEmail = async () => {
    const normalizedEmail = verificationEmail.trim().toLowerCase();
    const normalizedCode = verificationCode.replace(/\D/g, "").slice(0, 6);
    if (!normalizedEmail || normalizedCode.length !== 6) {
      setVerificationError("Enter the 6-digit verification code.");
      return;
    }

    setIsVerifying(true);
    setVerificationError("");
    setVerificationSuccess("");

    try {
      await authApi.verifyEmail(normalizedEmail, normalizedCode);
      setVerificationSuccess("Email verified successfully. Your account is now active and ready for sign-in.");
      setMode("signin");
      setFormData((current) => ({
        ...current,
        email: normalizedEmail,
        password: "",
        confirmPassword: "",
      }));
      window.setTimeout(() => {
        setVerificationOpen(false);
        setVerificationCode("");
      }, 1200);
    } catch (err: any) {
      setVerificationError(err.message || "Could not verify email.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendVerification = async () => {
    const normalizedEmail = verificationEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setVerificationError("Enter your email first.");
      return;
    }

    setIsResendingVerification(true);
    setVerificationError("");
    setVerificationSuccess("");

    try {
      await authApi.resendVerification(normalizedEmail);
      setVerificationSuccess("A new verification code has been sent.");
    } catch (err: any) {
      setVerificationError(err.message || "Could not resend the verification code.");
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (mode === "signin") {
        const data = await authApi.login(formData.email, formData.password);
        login({
          token: data.token,
          username: data.username,
          email: data.email,
          role: data.role,
          userId: String(data.userId),
          email_verified: data.email_verified,
        });
        navigate(ROLE_MAP[data.role] ?? "/", { replace: true });
        return;
      }

      if (formData.password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
      }
      if (formData.password !== formData.confirmPassword) {
        throw new Error("Passwords don't match.");
      }

      const registration = await authApi.register(
        formData.name,
        formData.email,
        formData.password,
      );
      const normalizedEmail = formData.email.trim().toLowerCase();
      setFormData({
        name: formData.name,
        email: normalizedEmail,
        password: "",
        confirmPassword: "",
      });
      setVerificationEmail(normalizedEmail);
      setVerificationCode("");
      setVerificationError("");
      setVerificationSuccess("Verification code sent. Enter it to activate your account.");
      setVerificationOpen(Boolean(registration.requiresEmailVerification));
    } catch (err: any) {
      if (
        mode === "signin" &&
        err?.status === 403 &&
        err?.data &&
        typeof err.data === "object" &&
        err.data !== null &&
        "requiresEmailVerification" in err.data &&
        err.data.requiresEmailVerification
      ) {
        const blockedEmail =
          typeof err.data.email === "string" && err.data.email.trim()
            ? err.data.email.trim().toLowerCase()
            : formData.email.trim().toLowerCase();
        setVerificationEmail(blockedEmail);
        setVerificationCode("");
        setVerificationError(err.message || "Please verify your email before signing in.");
        setVerificationSuccess("");
        setVerificationOpen(true);
        setError("");
        return;
      }
      setError(err.message || "Authentication failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px 16px",
          background:
            "radial-gradient(circle at top, rgba(245,197,24,0.18), transparent 28%), linear-gradient(135deg, #120b03 0%, #090603 55%, #1a1006 100%)",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            width: "min(980px, 100%)",
            display: "grid",
            gridTemplateColumns: "minmax(280px, 0.95fr) minmax(340px, 1fr)",
            background: SURFACE,
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 32px 90px rgba(0,0,0,0.45)",
            backdropFilter: "blur(18px)",
          }}
        >
          <div
            style={{
              position: "relative",
              padding: "32px 28px",
              background:
                "linear-gradient(180deg, rgba(245,197,24,0.12) 0%, rgba(15,10,5,0.5) 24%, rgba(12,8,4,0.94) 100%)",
              minHeight: 560,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: YELLOW,
                color: "#111",
                display: "grid",
                placeItems: "center",
                fontWeight: 900,
                fontSize: 18,
                marginBottom: 18,
              }}
            >
              TC
            </div>
            <p style={{ margin: "0 0 12px", color: YELLOW, fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              {title.eyebrow}
            </p>
            <h1 style={{ margin: "0 0 14px", color: "#fff", fontSize: "clamp(28px, 3vw, 42px)", lineHeight: 1.08 }}>
              {title.heading}
            </h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.65)", fontSize: 14, lineHeight: 1.75, maxWidth: 420 }}>
              {mode === "signup"
                ? "We'll send a 6-digit verification code through Resend, and your customer account stays inactive until that code is verified."
                : title.sub}
            </p>

            <div
              style={{
                marginTop: 28,
                padding: 18,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <p style={{ margin: "0 0 8px", color: "#fff", fontWeight: 700, fontSize: 14 }}>
                Verification flow
              </p>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 1.7 }}>
                Sign up, receive a 6-digit code by email, verify it, then sign in with an activated customer account.
              </p>
            </div>
          </div>

          <div style={{ padding: "32px 28px", background: PANEL }}>
            <div style={{ display: "inline-flex", gap: 8, padding: 6, borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {[
                { id: "signin" as const, label: "Sign In" },
                { id: "signup" as const, label: "Sign Up" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchMode(tab.id)}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "10px 18px",
                    background: mode === tab.id ? YELLOW : "transparent",
                    color: mode === tab.id ? "#111" : "rgba(255,255,255,0.6)",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              {error ? (
                <p style={{ margin: 0, color: "#fca5a5", fontSize: 12, textAlign: "center" }}>{error}</p>
              ) : null}

              {mode === "signup" ? (
                <Field label="Full Name">
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your full name"
                    required
                    style={inputStyle()}
                  />
                </Field>
              ) : null}

              <Field label="Email Address">
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  style={inputStyle()}
                />
              </Field>

              <PasswordField
                label="Password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder={mode === "signup" ? "Minimum 8 characters" : "Enter your password"}
                visible={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />

              {mode === "signup" ? (
                <PasswordField
                  label="Confirm Password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Re-enter your password"
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((current) => !current)}
                  autoComplete="new-password"
                />
              ) : null}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  marginTop: 4,
                  border: "none",
                  borderRadius: 12,
                  background: YELLOW,
                  color: "#111",
                  padding: "14px 16px",
                  fontWeight: 800,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  opacity: isLoading ? 0.75 : 1,
                }}
              >
                {isLoading
                  ? mode === "signin"
                    ? "Signing in..."
                    : "Creating account..."
                  : mode === "signin"
                    ? "Sign In"
                    : "Create Account"}
              </button>
            </form>

            <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.48)", fontSize: 12 }}>
                {mode === "signin" ? "Need an account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                  style={{ border: "none", background: "none", color: YELLOW, cursor: "pointer", fontWeight: 700, padding: 0 }}
                >
                  {mode === "signin" ? "Sign up" : "Sign in"}
                </button>
              </p>

              <button
                type="button"
                onClick={() => {
                  setVerificationEmail(formData.email.trim().toLowerCase());
                  setVerificationCode("");
                  setVerificationError("");
                  setVerificationSuccess("");
                  setVerificationOpen(true);
                }}
                style={{ border: "none", background: "none", color: "rgba(255,255,255,0.62)", cursor: "pointer", fontSize: 12 }}
              >
                Already have a code?
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      <VerifyEmailModal
        open={verificationOpen}
        email={verificationEmail}
        code={verificationCode}
        error={verificationError}
        success={verificationSuccess}
        isVerifying={isVerifying}
        isResending={isResendingVerification}
        onClose={() => {
          setVerificationOpen(false);
          setVerificationCode("");
          setVerificationSuccess("");
          setVerificationError("");
        }}
        onCodeChange={(value) => {
          setVerificationCode(value.replace(/\D/g, "").slice(0, 6));
          setVerificationError("");
        }}
        onVerify={handleVerifyEmail}
        onResend={handleResendVerification}
      />
    </>
  );
}
