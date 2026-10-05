import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { authApi } from "../lib/api";
import { useAuth } from "../context/authcontext";
import crunchImg from "../assets/img/crunch22.png";
import crunchLogo from "../assets/img/crunchlogo.png";

// Load Google Font 'Poppins' directly from CDN if not already in document
if (typeof document !== "undefined" && !document.getElementById("crunch-poppins-font")) {
  const fontLink = document.createElement("link");
  fontLink.id = "crunch-poppins-font";
  fontLink.rel = "stylesheet";
  fontLink.href =
    "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap";
  document.head.appendChild(fontLink);
}

// ── Application Navigation Paths ───────────────────────────────────────────
const HOME_PAGE_PATH = "/";

const ROLE_REDIRECT_PATHS: Record<string, string> = {
  administrator: "/dashboard",
  cashier: "/orders",
  cook: "/orders",
  inventory_manager: "/inventory",
  customer: "/products",
};

// ── Design Tokens ──────────────────────────────────────────────────────────
const FONT_FAMILY = "'Poppins', sans-serif";

const COLORS = {
  gold: "#f5c842",
  goldHover: "#ffd966",
  pageBackground: "#090807",
  cardBackground: "#12100d",
  inputBackground: "rgba(255, 255, 255, 0.04)",
  borderLine: "rgba(255, 255, 255, 0.08)",
  textMain: "#f6f4ee",
  textMuted: "rgba(246, 244, 238, 0.5)",
  errorRed: "#f87171",
  successGreen: "#4ade80",
};

// ── Simple Responsive Screen Hook ──────────────────────────────────────────
function useWindowWidth() {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowWidth;
}

// ── Main Authentication Component ──────────────────────────────────────────
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login: authenticateUserInContext } = useAuth();
  const screenWidth = useWindowWidth();

  const isMobileScreen = screenWidth <= 640;
  const isTabletScreen = screenWidth > 640 && screenWidth <= 1024;

  // ── Form State ───────────────────────────────────────────────────────────
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [formErrorMessage, setFormErrorMessage] = useState("");
  const [formSuccessMessage, setFormSuccessMessage] = useState("");

  // ── Email Verification Modal State ───────────────────────────────────────
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [verificationSuccess, setVerificationSuccess] = useState("");
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);

  // ── Forgot Password Modal State ──────────────────────────────────────────
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<1 | 2>(1); // 1 = Request code, 2 = Reset
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordCode, setForgotPasswordCode] = useState("");
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [confirmNewPasswordValue, setConfirmNewPasswordValue] = useState("");
  const [forgotModalError, setForgotModalError] = useState("");
  const [forgotModalSuccess, setForgotModalSuccess] = useState("");
  const [isSubmittingForgotPassword, setIsSubmittingForgotPassword] = useState(false);

  // Read URL query parameters (?tab=signup or ?verifyEmail=...)
  useEffect(() => {
    const urlParameters = new URLSearchParams(location.search);
    if (urlParameters.get("tab") === "signup") {
      setAuthMode("signup");
    }
    const emailToVerify = urlParameters.get("verifyEmail");
    if (emailToVerify) {
      setVerificationEmail(emailToVerify.trim().toLowerCase());
      setIsVerifyModalOpen(true);
    }
  }, [location.search]);

  // Switch between Sign In and Sign Up tabs
  const switchAuthenticationMode = (newMode: "signin" | "signup") => {
    setAuthMode(newMode);
    setFormErrorMessage("");
    setFormSuccessMessage("");
    setAccountPassword("");
    setConfirmPassword("");
  };

  // ── Form Submit: Sign In & Sign Up ───────────────────────────────────────
  const handleMainFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormSubmitting) return;

    setFormErrorMessage("");
    setFormSuccessMessage("");
    setIsFormSubmitting(true);

    const cleanedEmail = emailAddress.trim().toLowerCase();

    try {
      if (authMode === "signin") {
        const loginResponse = await authApi.login(cleanedEmail, accountPassword);
        authenticateUserInContext({
          token: loginResponse.token,
          username: loginResponse.username,
          email: loginResponse.email,
          role: loginResponse.role,
          userId: String(loginResponse.userId),
          email_verified: loginResponse.email_verified,
        });

        const targetRedirectPath = ROLE_REDIRECT_PATHS[loginResponse.role] || HOME_PAGE_PATH;
        navigate(targetRedirectPath, { replace: true });
      } else {
        if (!fullName.trim()) throw new Error("Please enter your full name.");
        if (accountPassword.length < 8) throw new Error("Password must be at least 8 characters long.");
        if (accountPassword !== confirmPassword) throw new Error("Passwords do not match.");

        const registerResponse = await authApi.register(fullName.trim(), cleanedEmail, accountPassword);

        if (registerResponse.requiresEmailVerification) {
          setVerificationEmail(cleanedEmail);
          setVerificationSuccess("Account created! A 6-digit verification code was sent to your email.");
          setIsVerifyModalOpen(true);
        } else {
          switchAuthenticationMode("signin");
          setFormSuccessMessage("Account created successfully. You can now sign in.");
        }
      }
    } catch (networkError: any) {
      if (networkError?.status === 403 && networkError?.data?.requiresEmailVerification) {
        setVerificationEmail(networkError?.data?.email || cleanedEmail);
        setVerificationError(networkError.message || "Please verify your email first.");
        setIsVerifyModalOpen(true);
        return;
      }
      setFormErrorMessage(networkError?.message || "Authentication failed. Please check your credentials.");
    } finally {
      setIsFormSubmitting(false);
    }
  };

  // ── Verification Modal Submit ────────────────────────────────────────────
  const handleVerifyEmailSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanedCode = verificationCode.trim();
    if (cleanedCode.length !== 6) {
      setVerificationError("Please enter the complete 6-digit verification code.");
      return;
    }

    setIsVerifyingCode(true);
    setVerificationError("");
    setVerificationSuccess("");

    try {
      await authApi.verifyEmail(verificationEmail, cleanedCode);
      setVerificationSuccess("Email verified successfully! You may now sign in.");
      setTimeout(() => {
        setIsVerifyModalOpen(false);
        switchAuthenticationMode("signin");
        setEmailAddress(verificationEmail);
      }, 1200);
    } catch (networkError: any) {
      setVerificationError(networkError?.message || "Could not verify code. Please try again.");
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleResendVerificationCode = async () => {
    if (!verificationEmail) return;
    setIsResendingCode(true);
    setVerificationError("");
    setVerificationSuccess("");

    try {
      await authApi.resendVerification(verificationEmail);
      setVerificationSuccess("A fresh 6-digit code has been sent to your email.");
    } catch (networkError: any) {
      setVerificationError(networkError?.message || "Could not resend code. Please try again later.");
    } finally {
      setIsResendingCode(false);
    }
  };

  // ── Forgot Password Logic ────────────────────────────────────────────────
  const handleSendResetPasswordCode = async (event: FormEvent) => {
    event.preventDefault();
    const cleanedEmail = forgotPasswordEmail.trim().toLowerCase();
    if (!cleanedEmail) {
      setForgotModalError("Please enter your registered email address.");
      return;
    }

    setIsSubmittingForgotPassword(true);
    setForgotModalError("");
    setForgotModalSuccess("");

    try {
      const response = await authApi.forgotPassword(cleanedEmail);
      setForgotModalSuccess(response.message || "A reset code has been sent if that email exists.");
      setForgotPasswordStep(2);
    } catch (networkError: any) {
      setForgotModalError(networkError?.message || "Failed to send reset code.");
    } finally {
      setIsSubmittingForgotPassword(false);
    }
  };

  const handleResetPasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanedEmail = forgotPasswordEmail.trim().toLowerCase();
    const cleanedCode = forgotPasswordCode.trim();

    if (!cleanedCode || !newPasswordValue || !confirmNewPasswordValue) {
      setForgotModalError("Please complete all fields.");
      return;
    }
    if (newPasswordValue.length < 8) {
      setForgotModalError("New password must be at least 8 characters long.");
      return;
    }
    if (newPasswordValue !== confirmNewPasswordValue) {
      setForgotModalError("Passwords do not match.");
      return;
    }

    setIsSubmittingForgotPassword(true);
    setForgotModalError("");
    setForgotModalSuccess("");

    try {
      await authApi.resetPassword(cleanedEmail, cleanedCode, newPasswordValue);
      setIsForgotModalOpen(false);
      switchAuthenticationMode("signin");
      setEmailAddress(cleanedEmail);
      setFormSuccessMessage("Password reset successfully. You can now sign in.");
    } catch (networkError: any) {
      setForgotModalError(networkError?.message || "Could not reset password. Please check your code.");
    } finally {
      setIsSubmittingForgotPassword(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: COLORS.pageBackground,
        color: COLORS.textMain,
        display: "grid",
        placeItems: "center",
        padding: isMobileScreen ? "20px 14px" : "32px 20px",
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* ── Main Auth Card with Subtle Entrance Animation ────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: "100%",
          maxWidth: isTabletScreen ? 860 : 960,
          backgroundColor: COLORS.cardBackground,
          border: `1px solid ${COLORS.borderLine}`,
          borderRadius: 24,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: isMobileScreen ? "1fr" : "0.9fr 1.1fr",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* ── Left Side: Brand Panel ───────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: "#0d0b09",
            borderRight: isMobileScreen ? "none" : `1px solid ${COLORS.borderLine}`,
            borderBottom: isMobileScreen ? `1px solid ${COLORS.borderLine}` : "none",
            padding: isMobileScreen ? "24px 20px 20px" : "32px 28px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* Top Bar: Clickable Logo */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Link to={HOME_PAGE_PATH} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <img src={crunchLogo} alt="The Crunch Logo" style={{ width: 34, height: 34, objectFit: "contain" }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.textMain }}>
                The <span style={{ color: COLORS.gold }}>Crunch</span>
              </span>
            </Link>

            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: COLORS.gold,
              }}
            >
              {authMode === "signin" ? "WELCOME BACK" : "JOIN THE CRUNCH"}
            </span>
          </div>

          {/* Hero Banner Image */}
          <div
            style={{
              position: "relative",
              borderRadius: 16,
              overflow: "hidden",
              aspectRatio: isMobileScreen ? "16/9" : "4/3",
              backgroundColor: "#161310",
              margin: "12px 0 20px",
            }}
          >
            <img
              src={crunchImg}
              alt="Crispy Fried Chicken"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to top, rgba(13,11,9,0.85) 0%, transparent 60%)",
              }}
            />
          </div>

          {/* Bottom Headline & Tagline */}
          <div>
            <h1 style={{ fontSize: isMobileScreen ? 22 : 26, fontWeight: 800, lineHeight: 1.2, margin: "0 0 8px" }}>
              {authMode === "signin" ? "Sign in to order hot & crispy." : "Create your account today."}
            </h1>
            <p style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.6, margin: 0 }}>
              {authMode === "signin"
                ? "Sign in with your verified email to access your rewards and takeout orders."
                : "Enter your details to receive your 6-digit verification code and start ordering."}
            </p>
          </div>
        </div>

        {/* ── Right Side: Form Panel ──────────────────────────────────────── */}
        <div style={{ padding: isMobileScreen ? "28px 20px" : "36px 32px" }}>
          {/* Pill Switcher between Sign In and Sign Up */}
          <div
            style={{
              display: "inline-flex",
              gap: 4,
              padding: 4,
              borderRadius: 10,
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${COLORS.borderLine}`,
              marginBottom: 24,
            }}
          >
            <button
              type="button"
              onClick={() => switchAuthenticationMode("signin")}
              style={{
                border: 0,
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: FONT_FAMILY,
                cursor: "pointer",
                backgroundColor: authMode === "signin" ? COLORS.gold : "transparent",
                color: authMode === "signin" ? "#120d04" : COLORS.textMuted,
                transition: "all 0.15s",
              }}
            >
              SIGN IN
            </button>
            <button
              type="button"
              onClick={() => switchAuthenticationMode("signup")}
              style={{
                border: 0,
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: FONT_FAMILY,
                cursor: "pointer",
                backgroundColor: authMode === "signup" ? COLORS.gold : "transparent",
                color: authMode === "signup" ? "#120d04" : COLORS.textMuted,
                transition: "all 0.15s",
              }}
            >
              CREATE ACCOUNT
            </button>
          </div>

          {/* Feedback Alerts */}
          <AnimatePresence>
            {formErrorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: COLORS.errorRed,
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontSize: 12.5,
                  marginBottom: 16,
                }}
              >
                {formErrorMessage}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {formSuccessMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                style={{
                  backgroundColor: "rgba(34, 197, 94, 0.12)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  color: COLORS.successGreen,
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontSize: 12.5,
                  marginBottom: 16,
                }}
              >
                {formSuccessMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Authentication Form with Smooth Tab Cross-fade */}
          <AnimatePresence mode="wait">
            <motion.form
              key={authMode}
              onSubmit={handleMainFormSubmit}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              style={{ display: "grid", gap: 16 }}
            >
              {/* Full Name (Sign Up only) */}
              {authMode === "signup" && (
                <div>
                  <label style={labelStyle}>Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Juan Dela Cruz"
                    value={fullName}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setFullName(event.target.value)}
                    style={textInputStyle}
                  />
                </div>
              )}

              {/* Email Address */}
              <div>
                <label style={labelStyle}>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="juan@example.com"
                  value={emailAddress}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setEmailAddress(event.target.value)}
                  style={textInputStyle}
                />
              </div>

              {/* Password */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible(previous => !previous)}
                    style={{ background: "none", border: 0, color: COLORS.gold, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: FONT_FAMILY }}
                  >
                    {isPasswordVisible ? "HIDE" : "SHOW"}
                  </button>
                </div>
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  required
                  placeholder={authMode === "signup" ? "Minimum 8 characters" : "Enter your password"}
                  value={accountPassword}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setAccountPassword(event.target.value)}
                  style={textInputStyle}
                />
              </div>

              {/* Confirm Password (Sign Up only) */}
              {authMode === "signup" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Confirm Password</label>
                    <button
                      type="button"
                      onClick={() => setIsConfirmPasswordVisible(previous => !previous)}
                      style={{ background: "none", border: 0, color: COLORS.gold, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: FONT_FAMILY }}
                    >
                      {isConfirmPasswordVisible ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                  <input
                    type={isConfirmPasswordVisible ? "text" : "password"}
                    required
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setConfirmPassword(event.target.value)}
                    style={textInputStyle}
                  />
                </div>
              )}

              {/* Forgot Password Link (Sign In only) */}
              {authMode === "signin" && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotPasswordEmail(emailAddress);
                      setForgotPasswordStep(1);
                      setForgotModalError("");
                      setForgotModalSuccess("");
                      setIsForgotModalOpen(true);
                    }}
                    style={{ background: "none", border: 0, color: COLORS.textMuted, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: FONT_FAMILY }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Submit Action Button with Minimal Micro-Interaction */}
              <motion.button
                type="submit"
                disabled={isFormSubmitting}
                whileHover={isFormSubmitting ? {} : { scale: 1.012 }}
                whileTap={isFormSubmitting ? {} : { scale: 0.988 }}
                style={{
                  backgroundColor: COLORS.gold,
                  color: "#120d04",
                  border: 0,
                  borderRadius: 10,
                  padding: "13px 18px",
                  fontSize: 13.5,
                  fontWeight: 800,
                  cursor: isFormSubmitting ? "not-allowed" : "pointer",
                  letterSpacing: "0.04em",
                  fontFamily: FONT_FAMILY,
                  opacity: isFormSubmitting ? 0.6 : 1,
                  marginTop: 6,
                }}
              >
                {isFormSubmitting
                  ? authMode === "signin"
                    ? "SIGNING IN…"
                    : "CREATING ACCOUNT…"
                  : authMode === "signin"
                  ? "SIGN IN"
                  : "REGISTER & VERIFY"}
              </motion.button>
            </motion.form>
          </AnimatePresence>

          {/* Toggle bottom link */}
          <p style={{ marginTop: 24, fontSize: 13, color: COLORS.textMuted, textAlign: "center" }}>
            {authMode === "signin" ? "Don't have an account yet? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => switchAuthenticationMode(authMode === "signin" ? "signup" : "signin")}
              style={{ background: "none", border: 0, color: COLORS.gold, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: FONT_FAMILY }}
            >
              {authMode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </motion.div>

      {/* ── Modal: 6-Digit Email Verification ─────────────────────────────── */}
      <AnimatePresence>
        {isVerifyModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.78)",
              backdropFilter: "blur(8px)",
              zIndex: 1000,
              display: "grid",
              placeItems: "center",
              padding: 16,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25 }}
              style={{
                width: "min(420px, 100%)",
                backgroundColor: COLORS.cardBackground,
                border: `1px solid ${COLORS.borderLine}`,
                borderRadius: 20,
                padding: 24,
                boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
                fontFamily: FONT_FAMILY,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 6px" }}>Verify Your Email</h2>
              <p style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5, margin: "0 0 16px" }}>
                Enter the 6-digit code sent to <strong style={{ color: COLORS.textMain }}>{verificationEmail}</strong>.
              </p>

              {verificationError && (
                <p style={{ color: COLORS.errorRed, fontSize: 12.5, marginBottom: 12 }}>{verificationError}</p>
              )}
              {verificationSuccess && (
                <p style={{ color: COLORS.successGreen, fontSize: 12.5, marginBottom: 12 }}>{verificationSuccess}</p>
              )}

              <form onSubmit={handleVerifyEmailSubmit} style={{ display: "grid", gap: 14 }}>
                <input
                  type="text"
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  style={{
                    ...textInputStyle,
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: "0.4em",
                    textAlign: "center",
                  }}
                />

                <div style={{ display: "flex", gap: 8 }}>
                  <motion.button
                    type="submit"
                    disabled={isVerifyingCode || verificationCode.length !== 6}
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                    style={{
                      flex: 2,
                      backgroundColor: COLORS.gold,
                      color: "#120d04",
                      border: 0,
                      borderRadius: 10,
                      padding: "11px",
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: FONT_FAMILY,
                      opacity: isVerifyingCode || verificationCode.length !== 6 ? 0.5 : 1,
                    }}
                  >
                    {isVerifyingCode ? "VERIFYING…" : "VERIFY CODE"}
                  </motion.button>

                  <button
                    type="button"
                    onClick={handleResendVerificationCode}
                    disabled={isResendingCode}
                    style={{
                      flex: 1,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      color: COLORS.textMain,
                      border: `1px solid ${COLORS.borderLine}`,
                      borderRadius: 10,
                      padding: "11px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: FONT_FAMILY,
                    }}
                  >
                    {isResendingCode ? "SENDING…" : "RESEND"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsVerifyModalOpen(false)}
                  style={{ background: "none", border: 0, color: COLORS.textMuted, fontSize: 12, cursor: "pointer", marginTop: 4, fontFamily: FONT_FAMILY }}
                >
                  Close
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal: Forgot Password ────────────────────────────────────────── */}
      <AnimatePresence>
        {isForgotModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.78)",
              backdropFilter: "blur(8px)",
              zIndex: 1000,
              display: "grid",
              placeItems: "center",
              padding: 16,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25 }}
              style={{
                width: "min(420px, 100%)",
                backgroundColor: COLORS.cardBackground,
                border: `1px solid ${COLORS.borderLine}`,
                borderRadius: 20,
                padding: 24,
                boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
                fontFamily: FONT_FAMILY,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 6px" }}>
                {forgotPasswordStep === 1 ? "Forgot Password" : "Reset Your Password"}
              </h2>
              <p style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5, margin: "0 0 16px" }}>
                {forgotPasswordStep === 1
                  ? "Enter your account email to receive a password reset code."
                  : `Enter the code sent to ${forgotPasswordEmail} and your new password.`}
              </p>

              {forgotModalError && (
                <p style={{ color: COLORS.errorRed, fontSize: 12.5, marginBottom: 12 }}>{forgotModalError}</p>
              )}
              {forgotModalSuccess && (
                <p style={{ color: COLORS.successGreen, fontSize: 12.5, marginBottom: 12 }}>{forgotModalSuccess}</p>
              )}

              {forgotPasswordStep === 1 ? (
                <form onSubmit={handleSendResetPasswordCode} style={{ display: "grid", gap: 14 }}>
                  <input
                    type="email"
                    required
                    placeholder="Enter your registered email"
                    value={forgotPasswordEmail}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setForgotPasswordEmail(event.target.value)}
                    style={textInputStyle}
                  />
                  <motion.button
                    type="submit"
                    disabled={isSubmittingForgotPassword}
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                    style={{
                      backgroundColor: COLORS.gold,
                      color: "#120d04",
                      border: 0,
                      borderRadius: 10,
                      padding: "11px",
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: FONT_FAMILY,
                      opacity: isSubmittingForgotPassword ? 0.5 : 1,
                    }}
                  >
                    {isSubmittingForgotPassword ? "SENDING CODE…" : "SEND RESET CODE"}
                  </motion.button>
                </form>
              ) : (
                <form onSubmit={handleResetPasswordSubmit} style={{ display: "grid", gap: 14 }}>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    placeholder="6-digit reset code"
                    value={forgotPasswordCode}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setForgotPasswordCode(event.target.value)}
                    style={textInputStyle}
                  />
                  <input
                    type="password"
                    required
                    placeholder="New password (min. 8 characters)"
                    value={newPasswordValue}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setNewPasswordValue(event.target.value)}
                    style={textInputStyle}
                  />
                  <input
                    type="password"
                    required
                    placeholder="Confirm new password"
                    value={confirmNewPasswordValue}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setConfirmNewPasswordValue(event.target.value)}
                    style={textInputStyle}
                  />
                  <motion.button
                    type="submit"
                    disabled={isSubmittingForgotPassword}
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                    style={{
                      backgroundColor: COLORS.gold,
                      color: "#120d04",
                      border: 0,
                      borderRadius: 10,
                      padding: "11px",
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: FONT_FAMILY,
                      opacity: isSubmittingForgotPassword ? 0.5 : 1,
                    }}
                  >
                    {isSubmittingForgotPassword ? "UPDATING PASSWORD…" : "RESET PASSWORD"}
                  </motion.button>
                </form>
              )}

              <button
                type="button"
                onClick={() => setIsForgotModalOpen(false)}
                style={{
                  background: "none",
                  border: 0,
                  color: COLORS.textMuted,
                  fontSize: 12,
                  cursor: "pointer",
                  marginTop: 12,
                  width: "100%",
                  textAlign: "center",
                  fontFamily: FONT_FAMILY,
                }}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Shared Standard Input Style ────────────────────────────────────────────
const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: COLORS.textMuted,
  marginBottom: 6,
  fontFamily: FONT_FAMILY,
};

const textInputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  font: "inherit",
  fontFamily: FONT_FAMILY,
  fontSize: 13.5,
  color: COLORS.textMain,
  backgroundColor: COLORS.inputBackground,
  border: `1px solid ${COLORS.borderLine}`,
  borderRadius: 10,
  padding: "11px 14px",
  outline: "none",
};