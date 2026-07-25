import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { staffApi } from "../lib/api";
import type { StaffMember } from "../lib/api";
import { useNotifications, useConfirm } from "../lib/NotificationContext";
import { useAuth } from "../context/authcontext";
import { useViewport } from "@/hooks/use-tablet";

// ─── Types ───────────────────────────────────────────────────────────────────
type Role = "administrator" | "cashier" | "cook" | "inventory_manager";

interface FormState {
  name: string;
  email: string;
  password: string;
  role: AssignableRole;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES: Role[] = ["administrator", "cashier", "cook", "inventory_manager"];

const ROLE_LABEL: Record<AssignableRole, string> = {
  administrator: "Admin",
  cashier: "Cashier",
  inventory_manager: "Inventory Mgr",
};

const ROLE_COLORS: Record<Role, { bg: string; color: string }> = {
  administrator: { bg: "#edf2ff", color: "#3b5bdb" },
  cashier:       { bg: "#e6fcf5", color: "#0ca678" },
  cook:          { bg: "#fff4e6", color: "#e67700" },
  inventory_manager: { bg: "#f3f0ff", color: "#7048e8" },
};

const AVATAR_COLORS: [string, string][] = [
  ["#fde8e8", "#c0392b"], ["#e8f8ee", "#27ae60"],
  ["#fef6e4", "#f39c12"], ["#eaf3fb", "#2980b9"], ["#f0eef8", "#6c5ce7"],
];

const DEFAULT_FORM: FormState = { name: "", email: "", password: "", role: "cashier" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getAvatarColor = (name: string): [string, string] => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
};

const getInitials = (name: string) =>
  name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
};

const isAuthError = (err: unknown): boolean => {
  if (typeof err !== "object" || err === null || !("message" in err)) return false;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && /invalid or expired token|no token provided/i.test(msg);
};

// ─── Validation ───────────────────────────────────────────────────────────────
const validateForm = (form: FormState): string => {
  const name = form.name.trim();
  const email = form.email.trim().toLowerCase();

  if (!name || name.length < 2) return "Full name must be at least 2 characters.";
  if (!/^[A-Za-z][A-Za-z.' -]*$/.test(name)) return "Name may only contain letters, spaces, apostrophes, hyphens, and periods.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email address.";
  if (form.password.length < 8) return "Password must be at least 8 characters.";
  if (!/(?=.*[A-Za-z])(?=.*\d)/.test(form.password)) return "Password must include at least 1 letter and 1 number.";
  return "";
};

// ─── Subcomponents ────────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const [bg, fg] = getAvatarColor(name);
  return (
    <div style={{ width: 34, height: 34, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
      {getInitials(name)}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const key = role as Role;
  const style = ROLE_COLORS[key] ?? { bg: "#f0f4f8", color: "#4a5568" };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: style.bg, color: style.color }}>
      {ROLE_LABEL[key] ?? role}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#a0aec0", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: "#2d3748" }}>{value}</div>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  const [showPass, setShowPass] = useState(false);
  const isPassword = type === "password";
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#718096", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type={isPassword && showPass ? "text" : type}
          value={value}
          placeholder={placeholder}
          maxLength={100}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: isPassword ? "9px 38px 9px 12px" : "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "'Poppins', sans-serif", background: "#f8f9fa", color: "#2d3748", outline: "none", boxSizing: "border-box" }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPass((s) => !s)}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#a0aec0", fontSize: 13, padding: 0 }}>
            {showPass ? "🙈" : "👁"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StaffAccounts() {
  const { addNotification } = useNotifications();
  const confirm = useConfirm();
  const { user, logout } = useAuth();
  const { isMobile, isTablet } = useViewport();

  const [employees, setEmployees] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<Role | "all">("all");

  // ── Auth error helper ──────────────────────────────────────────────────────
  const handleAuthError = useCallback((err: unknown, fallback: string) => {
    if (isAuthError(err)) {
      logout();
      addNotification({ id: crypto.randomUUID(), type: "error", label: "Session expired. Please log in again." });
      return true;
    }
    addNotification({ id: crypto.randomUUID(), type: "error", label: getErrorMessage(err, fallback) });
    return false;
  }, [logout, addNotification]);

  // ── Fetch staff ────────────────────────────────────────────────────────────
  const fetchStaff = useCallback(async () => {
    if (!user?.token) return;
    setIsLoading(true);
    try {
      const data = await staffApi.getAll(user.token);
      setEmployees(data);
    } catch (err) {
      handleAuthError(err, "Failed to load staff accounts.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.token, handleAuthError]);

  useEffect(() => { void fetchStaff(); }, [fetchStaff]);

  // ── Filtered employees ─────────────────────────────────────────────────────
  const filtered = employees.filter((e) => {
    const matchSearch = e.username.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "all" || e.role === filterRole;
    return matchSearch && matchRole;
  });

  // ── Add employee ───────────────────────────────────────────────────────────
  const handleAdd = async () => {
    setSubmitted(true);
    const error = validateForm(form);
    if (error) { addNotification({ id: crypto.randomUUID(), type: "warning", label: error }); return; }
    if (!user?.token) return;

    setIsLoading(true);
    try {
      await staffApi.create(user.token, {
        username: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
      });
      await fetchStaff();
      closeModal();
      addNotification({ id: crypto.randomUUID(), type: "success", label: "Staff account created." });
    } catch (err) {
      handleAuthError(err, "Failed to create account.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Remove employee ────────────────────────────────────────────────────────
  const handleRemove = async (id: number, name: string) => {
    const ok = await confirm({
      title: "Delete staff account?",
      message: (<>Permanently remove <strong>{name}</strong>'s account. This cannot be undone.</>),
      confirmLabel: "Delete account",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok || !user?.token) return;
    try {
      await staffApi.delete(user.token, id);
      await fetchStaff(); // re-fetch from server instead of client-side filter
      addNotification({ id: crypto.randomUUID(), type: "success", label: "Staff account deleted." });
    } catch (err) {
      handleAuthError(err, "Failed to delete account.");
    }
  };

  const closeModal = () => { setShowModal(false); setForm(DEFAULT_FORM); setSubmitted(false); };
  const updateField = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const formError = submitted ? validateForm(form) : "";
  const isFormValid = validateForm(form) === "";

  // ─── Styles ────────────────────────────────────────────────────────────────
  const S = {
    page:    { minHeight: "100vh", background: "#fff", fontFamily: "'Poppins', sans-serif", color: "#1a202c" },
    content: { padding: isMobile ? "78px 14px 22px" : isTablet ? "84px 18px 28px" : "32px 36px 32px 88px" },
    th:      { padding: "12px 16px", textAlign: "left" as const, fontSize: 11, fontWeight: 600, color: "#a0aec0", letterSpacing: "0.07em", textTransform: "uppercase" as const, borderBottom: "1px solid #e2e8f0" },
    td:      { padding: "13px 16px", verticalAlign: "middle" as const, borderBottom: "1px solid #f7f8fa" },
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <Sidebar />
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <div style={S.content}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>Staff Accounts</div>
            <div style={{ fontSize: 12, color: "#a0aec0", marginTop: 3 }}>Manage employee access and roles</div>
          </div>
          <button onClick={() => setShowModal(true)}
            style={{ background: "#1a202c", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif", cursor: "pointer" }}>
            + Add Employee
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 20, marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid #f0f4f8" }}>
          <StatCard label="Total" value={employees.length} />
          <StatCard label="Active" value={employees.filter((e) => e.is_active !== false).length} />
          <StatCard label="Inactive" value={employees.filter((e) => e.is_active === false).length} />
          {ROLES.map((r) => (
            <StatCard key={r} label={ROLE_LABEL[r]} value={employees.filter((e) => e.role === r).length} />
          ))}
        </div>

        {/* Search & Filter */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            style={{ flex: 1, minWidth: 180, padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "'Poppins', sans-serif", background: "#f8f9fa", color: "#2d3748", outline: "none" }}
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as Role | "all")}
            style={{ padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "'Poppins', sans-serif", background: "#f8f9fa", color: "#2d3748", outline: "none" }}>
            <option value="all">All Roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>

        {/* Table */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflowX: "auto", marginBottom: 40 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["#", "Employee", "Role", "Email", "Status", ""].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "64px 20px", fontSize: 13, color: "#94a3b8" }}>Loading staff accounts...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "64px 20px", fontSize: 13, color: "#cbd5e0" }}>
                  {search || filterRole !== "all" ? "No results match your search." : "No employees yet. Add one above."}
                </td></tr>
              ) : (
                <AnimatePresence initial={false}>
                  {filtered.map((emp, i) => (
                    <motion.tr key={emp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <td style={{ ...S.td, fontSize: 12, color: "#cbd5e0", width: 32 }}>{i + 1}</td>
                      <td style={S.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={emp.username} />
                          <span style={{ fontWeight: 600, color: "#2d3748" }}>{emp.username}</span>
                        </div>
                      </td>
                      <td style={S.td}><RoleBadge role={emp.role} /></td>
                      <td style={{ ...S.td, color: "#a0aec0" }}>{emp.email}</td>
                      <td style={S.td}>
                        {emp.is_active === false
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "#c53030" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fc8181" }} />Inactive</span>
                          : <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "#276749" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#38a169" }} />Active</span>
                        }
                      </td>
                      <td style={S.td}>
                        <button onClick={() => void handleRemove(emp.id, emp.username)}
                          style={{ background: "none", border: "1px solid #fed7d7", borderRadius: 7, padding: "5px 13px", fontSize: 11, fontWeight: 500, fontFamily: "'Poppins', sans-serif", color: "#fc8181", cursor: "pointer" }}>
                          Remove
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        {/* Add Employee Modal */}
        <AnimatePresence>
          {showModal && (
            <motion.div
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20, backdropFilter: "blur(2px)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
            >
              <motion.div
                style={{ background: "#fff", borderRadius: 16, padding: isMobile ? 20 : 28, width: "100%", maxWidth: 360, boxShadow: "0 8px 40px rgba(0,0,0,0.10)", border: "1px solid #e2e8f0" }}
                initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={{ duration: 0.18 }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Add Employee</div>

                <FormField label="Full Name"   value={form.name}     onChange={updateField("name")}     placeholder="e.g. Maria Santos" />
                <FormField label="Email"       value={form.email}    onChange={updateField("email")}    type="email" placeholder="e.g. maria@thecrunch.com" />
                <FormField label="Password"    value={form.password} onChange={updateField("password")} type="password" placeholder="Min. 8 characters" />

                <div style={{ marginBottom: 13 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#718096", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Role</label>
                  <select value={form.role} onChange={(e) => updateField("role")(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "'Poppins', sans-serif", background: "#f8f9fa", color: "#2d3748", outline: "none" }}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>

                {formError && <p style={{ fontSize: 11, color: "#e53e3e", margin: "4px 0 6px" }}>{formError}</p>}

                <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                  <button onClick={closeModal} disabled={isLoading}
                    style={{ flex: 1, background: "#f8f9fa", color: "#718096", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif", cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={() => void handleAdd()} disabled={isLoading || !isFormValid}
                    style={{ flex: 1, background: isLoading || !isFormValid ? "#94a3b8" : "#1a202c", color: "#fff", border: "none", borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, fontFamily: "'Poppins', sans-serif", cursor: isLoading || !isFormValid ? "not-allowed" : "pointer" }}>
                    {isLoading ? "Adding..." : "Add Employee"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}