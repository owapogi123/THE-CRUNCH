import "./customer-nav.css";
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, User, LogOut, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/context/authcontext";
import { api } from "@/lib/api";

const NAV_H = 72;
const GOLD = "#C9A84C";
const GOLD_DARK = "#B8953A";
const CREAM = "#F5F0E8";
const CHARCOAL = "#282823";

interface NavLinkItem {
  label: string;
  path: string;
  exact?: boolean;
}

export const CUSTOMER_NAV_LINKS: NavLinkItem[] = [
  { label: "Home", path: "/", exact: true },
  { label: "About", path: "/aboutthecrunch", exact: true },
  { label: "Menu", path: "/usersmenu", exact: true },
];

// Keep the public navbar's store status in sync with usersmenu.tsx and Admin Settings.
interface StoreStatusSettings {
  weekdayOpenTime: string;
  weekdayCloseTime: string;
  weekendOpenTime: string;
  weekendCloseTime: string;
  storeStatusMode: "auto" | "manual_open" | "manual_closed";
  timezone: string;
}

const DEFAULT_STORE: StoreStatusSettings = {
  weekdayOpenTime: "10:00",
  weekdayCloseTime: "22:00",
  weekendOpenTime: "11:00",
  weekendCloseTime: "20:30",
  storeStatusMode: "auto",
  timezone: "Asia/Manila",
};

function parseTimeMins(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function isStoreOpen(settings: StoreStatusSettings, now = new Date()): boolean {
  if (settings.storeStatusMode === "manual_open") return true;
  if (settings.storeStatusMode === "manual_closed") return false;

  const timezone = settings.timezone || "Asia/Manila";
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(now);
  const weekend = weekday === "Sat" || weekday === "Sun";
  const openTime = weekend
    ? settings.weekendOpenTime
    : settings.weekdayOpenTime;
  const closeTime = weekend
    ? settings.weekendCloseTime
    : settings.weekdayCloseTime;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour =
    Number(parts.find((part) => part.type === "hour")?.value || 0) % 24;
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value || 0,
  );
  const current = hour * 60 + minute;
  const opening = parseTimeMins(openTime);
  const closing = parseTimeMins(closeTime);
  if (opening === null || closing === null) return false;
  // A closing time before the opening time indicates an overnight schedule.
  return closing <= opening
    ? current >= opening || current < closing
    : current >= opening && current < closing;
}

function readStoreSettings(data: Record<string, unknown>): StoreStatusSettings {
  const text = (key: keyof StoreStatusSettings) =>
    String(data?.[key] || DEFAULT_STORE[key]);
  const mode = data?.storeStatusMode;
  return {
    weekdayOpenTime: text("weekdayOpenTime"),
    weekdayCloseTime: text("weekdayCloseTime"),
    weekendOpenTime: text("weekendOpenTime"),
    weekendCloseTime: text("weekendCloseTime"),
    storeStatusMode:
      mode === "manual_open" || mode === "manual_closed" ? mode : "auto",
    timezone: text("timezone"),
  };
}

const NAVBAR_CSS = `
.navbar-root {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: ${NAV_H}px;
  display: flex;
  align-items: center;
  transition: background 0.25s, border-color 0.25s, box-shadow 0.25s;
  border-bottom: 1px solid transparent;
}
.navbar-root.scrolled {
  background: rgba(26, 26, 26, 0.92);
  backdrop-filter: blur(16px);
  border-bottom-color: rgba(89, 92, 86, 0.25);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
}
.navbar-inner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 clamp(20px, 5vw, 64px);
}
.nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: 0;
  cursor: pointer;
  color: ${CREAM};
  font-weight: 800;
  font-size: 18px;
  letter-spacing: -0.02em;
  font-family: 'Inter', system-ui, sans-serif;
}
.nav-brand span {
  display: none;
}
.nav-brand:hover span, .nav-brand:focus span {
  display: inline;
}
@media (min-width: 640px) {
  .nav-brand span {
    display: inline;
  }
}
.nav-center {
  gap: 10px;
  display: flex;
  justify-content: center;
}
.nav-links {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nav-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.nav-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(245, 240, 232, 0.58);
  padding: 0 4px;
}
.nav-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.nav-btn {
  border: 0;
  border-radius: 8px;
  min-height: 44px;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
  font-family: 'Inter', system-ui, sans-serif;
}
.nav-btn:active {
  transform: scale(0.97);
}
.nav-btn-gold {
  background: ${GOLD};
  color: ${CHARCOAL};
}
.nav-btn-gold:hover {
  background: ${GOLD_DARK};
}
.nav-btn-ghost {
  background: transparent;
  color: ${CREAM};
  border: 1px solid rgba(89, 92, 86, 0.25);
}
.nav-btn-ghost:hover {
  background: rgba(245, 232, 182, 0.08);
  border-color: rgba(201, 168, 76, 0.3);
  color: ${GOLD};
}
.nav-brand, button.nav-status, .nav-burger { border-radius: 8px; }
button.nav-status { padding: 8px 12px; border: 1px solid rgba(201,168,76,.25); max-width: 12rem; overflow-wrap: anywhere; }
.nav-burger {
  min-width: 44px; min-height: 44px; align-items: center; justify-content: center;
  display: none;
  background: none;
  border: 0;
  color: ${CREAM};
  cursor: pointer;
  padding: 8px;
}
@media (max-width: 768px) {
  .nav-links, .nav-status, .nav-right > .nav-btn { display: none; }
  .nav-burger { display: flex; }
}
.mobile-menu {
  position: absolute;
  top: ${NAV_H}px;
  left: 0;
  right: 0;
  background: rgba(11, 10, 8, 0.98);
  border-bottom: 1px solid rgba(89, 92, 86, 0.25);
  padding: 8px clamp(20px, 5vw, 64px) 18px;
  display: grid;
  gap: 8px;
}
.mobile-link {
  text-align: left;
  font-size: 15px;
  padding: 10px 14px;
}
.mobile-auth {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.mobile-auth .nav-btn {
  flex: 1;
}
`;

export function Navbar({
  isOpen: controlledOpen,
  onOpenChange,
}: { isOpen?: boolean; onOpenChange?: (open: boolean) => void } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOpenStatus, setIsOpenStatus] = useState<boolean | null>(null);

  const isControlled =
    controlledOpen !== undefined && onOpenChange !== undefined;
  const open = isControlled ? controlledOpen : menuOpen;
  const setOpen = isControlled
    ? (val: boolean | ((prev: boolean) => boolean)) =>
        onOpenChange!(typeof val === "function" ? val(open) : val)
    : setMenuOpen;

  // Inject CSS
  useEffect(() => {
    const el = document.createElement("style");
    el.id = "navbar-css";
    el.innerHTML = NAVBAR_CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  // Use the same saved operating hours and manual overrides as the customer menu.
  // Refresh periodically, when the tab becomes visible, and on window focus so
  // updates in Administrator Settings also reach already-open public pages.
  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;
    const refreshStatus = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const data = await api.get<Record<string, unknown>>("/settings");
        if (!cancelled) setIsOpenStatus(isStoreOpen(readStoreSettings(data)));
      } catch {
        // A failed settings request is unknown status, not proof the store is closed.
        if (!cancelled) setIsOpenStatus(null);
      } finally {
        requestInFlight = false;
      }
    };
    void refreshStatus();
    const intervalId = window.setInterval(() => void refreshStatus(), 60_000);
    const onFocus = () => void refreshStatus();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshStatus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Scroll handler
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    if (open) setOpen(false);
  }, [location.pathname, open, setOpen]);

  // Active link detection
  const isActive = (path: string, exact = false) => {
    if (path === "/" && location.pathname === "/products") return true;
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const handleNav = (path: string) => {
    setOpen(false);
    if (path === "/usersmenu") {
      navigate("/usersmenu?showOrderModal=true");
    } else if (path === "/login" || path === "/login?tab=signup") {
      const returnTo = location.pathname;
      const separator = path.includes("?") ? "&" : "?";
      navigate(`${path}${separator}returnTo=${encodeURIComponent(returnTo)}`);
    } else {
      navigate(path);
    }
  };

  const handleLogout = () => {
    logout();
    setOpen(false);
    navigate("/");
  };

  const isAuthenticated = !!user;

  return (
    <>
      <motion.header
        className={`navbar-root ${isScrolled || open ? "scrolled" : ""}`}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="navbar-inner">
          <button
            className="nav-brand"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Back to top"
          >
            <img
              src="/img/logo24.webp"
              alt=""
              width={32}
              height={32}
              style={{ objectFit: "contain" }}
            />
            <span>
              The <span style={{ color: GOLD }}>Crunch</span>
            </span>
          </button>

          <nav className="nav-center" aria-label="Main navigation">
            <span
              className="nav-status"
              title="Store status follows Administrator Settings"
            >
              <span
                className="nav-dot"
                style={{
                  background:
                    isOpenStatus === null
                      ? "#a8a29e"
                      : isOpenStatus
                        ? "#22c55e"
                        : "#ef4444",
                }}
              />
              {isOpenStatus === null
                ? "Status unavailable"
                : isOpenStatus
                  ? "Open now"
                  : "Closed"}
            </span>
            <div className="nav-links">
              {CUSTOMER_NAV_LINKS.map(({ label, path, exact }) => (
                <motion.button
                  key={label}
                  aria-current={isActive(path, exact) ? "page" : undefined}
                  className={`customer-nav-link nav-link ${isActive(path, exact) ? "active" : ""}`}
                  onClick={() => handleNav(path)}
                  whileTap={{ scale: 0.97 }}
                >
                  <span>{label}</span>
                </motion.button>
              ))}
            </div>
          </nav>

          <div className="nav-right">
            {isAuthenticated ? (
              <>
                {user?.username && (
                  <button
                    className="nav-status"
                    onClick={() => {
                      navigate("/my-account");
                      setOpen(false);
                    }}
                    title="Open My Account"
                  >
                    <User size={14} />
                    {user.username}
                  </button>
                )}
                <motion.button
                  className="nav-btn nav-btn-gold"
                  onClick={handleLogout}
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <LogOut
                    size={14}
                    style={{ display: "inline-block", marginRight: 4 }}
                  />
                  Log Out
                </motion.button>
              </>
            ) : (
              <>
                <motion.button
                  className="nav-btn nav-btn-ghost"
                  onClick={() => {
                    handleNav("/login");
                  }}
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <LogIn
                    size={14}
                    style={{ display: "inline-block", marginRight: 4 }}
                  />
                  Log In
                </motion.button>
                <motion.button
                  className="nav-btn nav-btn-gold"
                  onClick={() => {
                    handleNav("/login?tab=signup");
                  }}
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <UserPlus
                    size={14}
                    style={{ display: "inline-block", marginRight: 4 }}
                  />
                  Sign Up
                </motion.button>
              </>
            )}
            <button
              className="nav-burger"
              onClick={() => setOpen((prev) => !prev)}
              aria-label="Toggle menu"
              aria-expanded={open}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              className="mobile-menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {CUSTOMER_NAV_LINKS.map(({ label, path, exact }) => (
                <motion.button
                  key={label}
                  aria-current={isActive(path, exact) ? "page" : undefined}
                  className={`customer-nav-link nav-link mobile-link ${isActive(path, exact) ? "active" : ""}`}
                  onClick={() => handleNav(path)}
                  whileTap={{ scale: 0.98 }}
                >
                  <span>{label}</span>
                </motion.button>
              ))}
              <div className="mobile-auth">
                {isAuthenticated ? (
                  <>
                    <motion.button
                      className="nav-btn nav-btn-ghost"
                      onClick={() => {
                        navigate("/my-account");
                        setOpen(false);
                      }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <User
                        size={14}
                        style={{ display: "inline-block", marginRight: 4 }}
                      />
                      My Account
                    </motion.button>
                    <motion.button
                      className="nav-btn nav-btn-gold"
                      onClick={handleLogout}
                      whileTap={{ scale: 0.97 }}
                    >
                      <LogOut
                        size={14}
                        style={{ display: "inline-block", marginRight: 4 }}
                      />
                      Log Out
                    </motion.button>
                  </>
                ) : (
                  <>
                    <motion.button
                      className="nav-btn nav-btn-ghost"
                      onClick={() => {
                        handleNav("/login");
                      }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <LogIn
                        size={14}
                        style={{ display: "inline-block", marginRight: 4 }}
                      />
                      Log In
                    </motion.button>
                    <motion.button
                      className="nav-btn nav-btn-gold"
                      onClick={() => {
                        handleNav("/login?tab=signup");
                      }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <UserPlus
                        size={14}
                        style={{ display: "inline-block", marginRight: 4 }}
                      />
                      Sign Up
                    </motion.button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>
    </>
  );
}
