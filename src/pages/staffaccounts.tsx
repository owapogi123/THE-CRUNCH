import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { staffApi } from "../lib/api";
import type { StaffMember } from "../lib/api";
import { useNotifications, useConfirm } from "../lib/NotificationContext";
import { useAuth } from "../context/authcontext";

type Role = "administrator" | "cashier" | "cook" | "inventory_manager";

interface FormState {
  name: string;
  email: string;
  password: string;
  role: Role;
}

const ROLES: Role[] = ["administrator", "cashier", "cook", "inventory_manager"];

const ROLE_LABEL: Record<Role, string> = {
  administrator: "Admin",
  cashier: "Cashier",
  cook: "Cook",
  inventory_manager: "Inventory Mgr",
};

const AVATAR_PALETTE: [string, string][] = [
  ["#fde8e8", "#c0392b"],
  ["#e8f8ee", "#27ae60"],
  ["#fef6e4", "#f39c12"],
  ["#eaf3fb", "#2980b9"],
  ["#f0eef8", "#6c5ce7"],
];

const DEFAULT_FORM: FormState = {
  name: "",
  email: "",
  password: "",
  role: "cashier",
};

function getAvatarColor(name: string): [string, string] {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[h];
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

function isAuthError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("message" in err)) return false;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && /invalid or expired token|no token provided/i.test(msg);
}

const thStyle = {
  padding: "12px 18px",
  textAlign: "left" as const,
  fontSize: 11,
  fontWeight: 600,
  color: "#a0aec0",
  letterSpacing: "0.07em",
  textTransform: "uppercase" as const,
  borderBottom: "1px solid #e2e8f0",
};

const tdStyle = {
  padding: "13px 18px",
  verticalAlign: "middle" as const,
};

export default function StaffAccounts() {
  const { addNotification } = useNotifications();
  const confirm = useConfirm();
  const { user, logout } = useAuth();

  const [employees, setEmployees] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState("");

  const stats = [
    { label: "Total", value: employees.length },
    { label: "Active", value: employees.length },
    { label: "Inactive", value: 0 },
    ...ROLES.filter((r) => employees.some((e) => e.role === r)).map((r) => ({
      label: ROLE_LABEL[r],
      value: employees.filter((e) => e.role === r).length,
    })),
  ];

  useEffect(() => {
    if (!user?.token) return;
    setIsLoading(true);
    staffApi
      .getAll(user.token)
      .then(setEmployees)
      .catch((err: unknown) => {
        if (isAuthError(err)) {
          logout();
          addNotification({ id: crypto.randomUUID(), type: "error", label: "Session expired. Please log in again." });
          return;
        }
        addNotification({ id: crypto.randomUUID(), type: "error", label: "Failed to load staff accounts." });
      })
      .finally(() => setIsLoading(false));
  }, [user?.token, addNotification, logout]);

  const handleAdd = async (): Promise<void> => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      addNotification({ id: crypto.randomUUID(), type: "warning", label: "Name, email, and password are required." });
      return;
    }
    if (!user?.token) return;
    setIsLoading(true);
    try {
      await staffApi.create(user.token, {
        username: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
      });
      const updated = await staffApi.getAll(user.token);
      setEmployees(updated);
      setForm(DEFAULT_FORM);
      setError("");
      setShowModal(false);
      addNotification({ id: crypto.randomUUID(), type: "success", label: "Staff account created successfully." });
    } catch (err: unknown) {
      if (isAuthError(err)) {
        logout();
        addNotification({ id: crypto.randomUUID(), type: "error", label: "Session expired. Please log in again." });
        return;
      }
      addNotification({ id: crypto.randomUUID(), type: "error", label: getErrorMessage(err, "Failed to create account.") });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (id: number, name: string): Promise<void> => {
    const ok = await confirm({
      title: "Delete staff account?",
      message: (
        <>
          This will permanently remove{" "}
          <strong style={{ color: "#2d3748", fontWeight: 600 }}>{name}</strong>'s
          account. This action cannot be undone.
        </>
      ),
      confirmLabel: "Delete account",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!ok || !user?.token) return;
    try {
      await staffApi.delete(user.token, id);
      setEmployees((prev) => prev.filter((e) => e.id !== id));
      addNotification({ id: crypto.randomUUID(), type: "success", label: "Staff account deleted." });
    } catch (err: unknown) {
      if (isAuthError(err)) {
        logout();
        addNotification({ id: crypto.randomUUID(), type: "error", label: "Session expired. Please log in again." });
        return;
      }
      addNotification({ id: crypto.randomUUID(), type: "error", label: getErrorMessage(err, "Failed to delete account.") });
    }
  };

  const closeModal = (): void => {
    setShowModal(false);
    setForm(DEFAULT_FORM);
    setError("");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "'Poppins', sans-serif", color: "#1a202c" }}>
      <Sidebar />

      <div style={{ padding: "32px 36px 32px 88px" }}>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1a202c", lineHeight: 1.2 }}>Staff Accounts</div>
            <div style={{ fontSize: 12, color: "#a0aec0", marginTop: 3 }}>Manage employee access and roles</div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#1a202c", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif", cursor: "pointer" }}
          >
            + Add Employee
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid #f0f4f8" }}>
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: i * 0.04 }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: "#a0aec0", textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 500, color: "#2d3748", lineHeight: 1 }}>{s.value}</div>
            </motion.div>
          ))}
        </div>

        {/* Staff Table */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: 40 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["#", "Employee", "Role", "Email", "ID", "Status", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "64px 20px", fontSize: 13, color: "#94a3b8" }}>
                    Loading staff accounts...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "64px 20px", fontSize: 13, color: "#cbd5e0" }}>
                    No employees yet. Add one above.
                  </td>
                </tr>
              ) : (
                <AnimatePresence initial={false}>
                  {employees.map((emp, i) => {
                    const [avBg, avFg] = getAvatarColor(emp.username);
                    const role = ROLES.includes(emp.role as Role) ? (emp.role as Role) : null;
                    return (
                      <motion.tr
                        key={emp.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{ borderBottom: "1px solid #f0f4f8" }}
                      >
                        <td style={{ ...tdStyle, fontSize: 12, color: "#cbd5e0", width: 32 }}>{i + 1}</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, background: avBg, color: avFg }}>
                              {getInitials(emp.username)}
                            </div>
                            <span style={{ fontWeight: 600, color: "#2d3748", fontSize: 13 }}>{emp.username}</span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: "#f0f4f8", color: "#4a5568" }}>
                            {role ? ROLE_LABEL[role] : emp.role}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: "#a0aec0" }}>{emp.email}</td>
                        <td style={{ ...tdStyle, fontSize: 11, color: "#cbd5e0", fontFamily: "monospace" }}>{emp.id}</td>
                        <td style={tdStyle}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "#276749" }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#38a169" }} />
                            Active
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => void handleRemove(emp.id, emp.username)}
                            style={{ background: "none", border: "1px solid #fed7d7", borderRadius: 7, padding: "5px 13px", fontSize: 11, fontWeight: 500, fontFamily: "'Poppins', sans-serif", color: "#fc8181", cursor: "pointer" }}
                          >
                            Remove
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
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
                style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 360, boxShadow: "0 8px 40px rgba(0,0,0,0.10)", border: "1px solid #e2e8f0" }}
                initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={{ duration: 0.18 }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a202c", marginBottom: 20 }}>Add Employee</div>

                {[
                  { label: "Full Name", key: "name", type: "text", placeholder: "e.g. Maria Santos" },
                  { label: "Email", key: "email", type: "email", placeholder: "e.g. maria@thecrunch.com" },
                  { label: "Password", key: "password", type: "password", placeholder: "Password" },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key} style={{ marginBottom: 13 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#718096", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
                    <input
                      style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "'Poppins', sans-serif", background: "#f8f9fa", color: "#2d3748", outline: "none", boxSizing: "border-box" }}
                      type={type}
                      value={form[key as keyof FormState]}
                      placeholder={placeholder}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}

                <div style={{ marginBottom: 13 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#718096", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Role</label>
                  <select
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "'Poppins', sans-serif", background: "#f8f9fa", color: "#2d3748", outline: "none" }}
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>

                {error && <p style={{ fontSize: 11, color: "#e53e3e", margin: "4px 0 6px" }}>{error}</p>}

                <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                  <button
                    onClick={closeModal}
                    style={{ flex: 1, background: "#f8f9fa", color: "#718096", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleAdd()}
                    style={{ flex: 1, background: "#1a202c", color: "#fff", border: "none", borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, fontFamily: "'Poppins', sans-serif", cursor: "pointer" }}
                  >
                    Add Employee
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