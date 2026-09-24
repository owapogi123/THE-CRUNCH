import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/Sidebar";
import { staffApi } from "../lib/api";
import type { StaffMember } from "../lib/api";
import { useNotifications, useConfirm } from "../lib/NotificationContext";
import { useAuth } from "../context/authcontext";
import { useViewport } from "@/hooks/use-tablet";

// ─── Types ───────────────────────────────────────────────────────────────────
type Role = "administrator" | "cashier" | "inventory_manager";
type RoleFilter = Role | "all";
type NotificationType = "error" | "warning" | "success";

interface FormState {
  name: string;
  email: string;
  password: string;
  role: Role;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const FONT_FAMILY = "'Poppins', sans-serif";
const FIELD_MAX_LENGTH = 100;

const ROLES: Role[] = ["administrator", "cashier", "inventory_manager"];

const ROLE_LABEL: Record<Role, string> = {
  administrator: "Admin",
  cashier: "Cashier",
  inventory_manager: "Inventory Mgr",
};

const ROLE_COLORS: Record<Role, { bg: string; color: string }> = {
  administrator: { bg: "#edf2ff", color: "#3b5bdb" },
  cashier: { bg: "#e6fcf5", color: "#0ca678" },
  inventory_manager: { bg: "#f3f0ff", color: "#7048e8" },
};

// Used when the API returns a role this page does not know about
const FALLBACK_ROLE_COLOR = { bg: "#f0f4f8", color: "#4a5568" };

const AVATAR_COLORS: [string, string][] = [
  ["#fde8e8", "#c0392b"],
  ["#e8f8ee", "#27ae60"],
  ["#fef6e4", "#f39c12"],
  ["#eaf3fb", "#2980b9"],
  ["#f0eef8", "#6c5ce7"],
];

const TABLE_COLUMNS = ["#", "Employee", "Role", "Email", ""];

const DEFAULT_FORM: FormState = { name: "", email: "", password: "", role: "cashier" };

const NAME_PATTERN = /^[A-Za-z][A-Za-z.' -]*[A-Za-z.]$|^[A-Za-z.]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

// ─── Shared styles ───────────────────────────────────────────────────────────
const inputStyle: CSSProperties = {
  padding: "9px 12px",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: FONT_FAMILY,
  background: "#f8f9fa",
  color: "#2d3748",
  outline: "none",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#718096",
  marginBottom: 5,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const headerCellStyle: CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  color: "#a0aec0",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  borderBottom: "1px solid #e2e8f0",
};

const cellStyle: CSSProperties = {
  padding: "13px 16px",
  verticalAlign: "middle",
  borderBottom: "1px solid #f7f8fa",
};

const emptyRowStyle: CSSProperties = {
  textAlign: "center",
  padding: "64px 20px",
  fontSize: 13,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Picks a stable avatar color based on the employee's name
const getAvatarColor = (name: string): [string, string] => {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash];
};

const getInitials = (name: string): string =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

// Safely reads the message from an unknown thrown value
const getMessage = (err: unknown): string | null => {
  if (typeof err !== "object" || err === null || !("message" in err)) return null;
  const { message } = err as { message?: unknown };
  return typeof message === "string" && message.trim() ? message : null;
};

const getErrorMessage = (err: unknown, fallback: string): string =>
  getMessage(err) ?? fallback;

const isAuthError = (err: unknown): boolean => {
  const message = getMessage(err);
  return message !== null && /invalid or expired token|no token provided/i.test(message);
};

// Cleans input as the user types, based on which field it belongs to
const sanitizeField = (key: keyof FormState, value: string): string => {
  switch (key) {
    case "name":
      return value.replace(/[^A-Za-z.' -]/g, "").slice(0, FIELD_MAX_LENGTH);
    case "email":
      return value.replace(/\s+/g, "").slice(0, FIELD_MAX_LENGTH);
    default:
      return value.slice(0, FIELD_MAX_LENGTH);
  }
};

// Returns an error message for the first invalid field, or "" if the form is valid
const validateForm = (form: FormState): string => {
  const name = form.name.trim();
  const email = form.email.trim().toLowerCase();
  const { password } = form;

  if (!name) return "Full name is required.";
  if (name.length < 2) return "Full name must be at least 2 characters.";
  if (name.length > FIELD_MAX_LENGTH) return "Full name must not exceed 100 characters.";
  if (!NAME_PATTERN.test(name) || !/[A-Za-z]/.test(name)) {
    return "Full name may only use letters, spaces, apostrophes, hyphens, and periods.";
  }

  if (!email) return "Email is required.";
  if (email.length > FIELD_MAX_LENGTH) return "Email must not exceed 100 characters.";
  if (!EMAIL_PATTERN.test(email)) return "Please enter a valid email address.";

  if (!password.trim()) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > FIELD_MAX_LENGTH) return "Password must not exceed 100 characters.";
  if (!PASSWORD_PATTERN.test(password)) return "Password must include at least 1 letter and 1 number.";

  if (!ROLES.includes(form.role)) return "Please select a valid role.";
  return "";
};

// ─── Subcomponents ───────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const [bg, fg] = getAvatarColor(name);
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: bg,
        color: fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors = ROLE_COLORS[role as Role] ?? FALLBACK_ROLE_COLOR;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 6,
        background: colors.bg,
        color: colors.color,
      }}
    >
      {ROLE_LABEL[role as Role] ?? role}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#a0aec0", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: "#2d3748" }}>{value}</div>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}

function FormField({ label, value, onChange, type = "text", placeholder }: FormFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  return (
    <div style={{ marginBottom: 13 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type={isPassword && showPassword ? "text" : type}
          value={value}
          placeholder={placeholder}
          maxLength={FIELD_MAX_LENGTH}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...inputStyle,
            width: "100%",
            boxSizing: "border-box",
            padding: isPassword ? "9px 38px 9px 12px" : inputStyle.padding,
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((show) => !show)}
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#a0aec0",
              fontSize: 13,
              padding: 0,
            }}
          >
            {showPassword ? "🙈" : "👁"}
          </button>
        )}
      </div>
    </div>
  );
}

interface StaffRowProps {
  employee: StaffMember;
  index: number;
  onRemove: (id: number, name: string) => void;
}

function StaffRow({ employee, index, onRemove }: StaffRowProps) {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <td style={{ ...cellStyle, fontSize: 12, color: "#cbd5e0", width: 32 }}>{index + 1}</td>
      <td style={cellStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={employee.username} />
          <span style={{ fontWeight: 600, color: "#2d3748" }}>{employee.username}</span>
        </div>
      </td>
      <td style={cellStyle}>
        <RoleBadge role={employee.role} />
      </td>
      <td style={{ ...cellStyle, color: "#a0aec0" }}>{employee.email}</td>
      <td style={cellStyle}>
        <button
          onClick={() => onRemove(employee.id, employee.username)}
          style={{
            background: "none",
            border: "1px solid #fed7d7",
            borderRadius: 7,
            padding: "5px 13px",
            fontSize: 11,
            fontWeight: 500,
            fontFamily: FONT_FAMILY,
            color: "#fc8181",
            cursor: "pointer",
          }}
        >
          Remove
        </button>
      </td>
    </motion.tr>
  );
}

interface AddEmployeeModalProps {
  form: FormState;
  error: string;
  isSubmitting: boolean;
  isMobile: boolean;
  onFieldChange: (key: keyof FormState) => (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function AddEmployeeModal({
  form,
  error,
  isSubmitting,
  isMobile,
  onFieldChange,
  onSubmit,
  onClose,
}: AddEmployeeModalProps) {
  return (
    <motion.div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
        backdropFilter: "blur(2px)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      // Close only when the backdrop itself is clicked, not the dialog
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: isMobile ? 20 : 28,
          width: "100%",
          maxWidth: 360,
          boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
          border: "1px solid #e2e8f0",
        }}
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18 }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Add Employee</div>

        <FormField label="Full Name" value={form.name} onChange={onFieldChange("name")} placeholder="e.g. Maria Santos" />
        <FormField label="Email" value={form.email} onChange={onFieldChange("email")} type="email" placeholder="e.g. maria@thecrunch.com" />
        <FormField label="Password" value={form.password} onChange={onFieldChange("password")} type="password" placeholder="Min. 8 characters" />

        <div style={{ marginBottom: 13 }}>
          <label style={labelStyle}>Role</label>
          <select
            value={form.role}
            onChange={(e) => onFieldChange("role")(e.target.value)}
            style={{ ...inputStyle, width: "100%" }}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </div>

        {error && <p style={{ fontSize: 11, color: "#e53e3e", margin: "4px 0 6px" }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              flex: 1,
              background: "#f8f9fa",
              color: "#718096",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 10,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: FONT_FAMILY,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            style={{
              flex: 1,
              background: isSubmitting ? "#94a3b8" : "#1a202c",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: 10,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: FONT_FAMILY,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Adding..." : "Add Employee"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function StaffAccounts() {
  const { addNotification } = useNotifications();
  const confirm = useConfirm();
  const { user, logout } = useAuth();
  const { isMobile, isTablet } = useViewport();

  const [employees, setEmployees] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<RoleFilter>("all");

  // ── Notifications ──────────────────────────────────────────────────────────
  const notify = useCallback(
    (type: NotificationType, label: string) => {
      addNotification({ id: crypto.randomUUID(), type, label });
    },
    [addNotification]
  );

  // Logs the user out if the session expired, otherwise shows the error.
  // Returns true when the error was an auth error.
  const handleApiError = useCallback(
    (err: unknown, fallback: string): boolean => {
      if (isAuthError(err)) {
        logout();
        notify("error", "Session expired. Please log in again.");
        return true;
      }
      notify("error", getErrorMessage(err, fallback));
      return false;
    },
    [logout, notify]
  );

  // ── Data loading ───────────────────────────────────────────────────────────
  const fetchStaff = useCallback(async () => {
    if (!user?.token) return;
    setIsLoading(true);
    try {
      setEmployees(await staffApi.getAll(user.token));
    } catch (err) {
      handleApiError(err, "Failed to load staff accounts.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.token, handleApiError]);

  useEffect(() => {
    void fetchStaff();
  }, [fetchStaff]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const filteredEmployees = useMemo(() => {
    const query = search.toLowerCase();
    return employees.filter((employee) => {
      const matchesSearch =
        employee.username.toLowerCase().includes(query) ||
        employee.email.toLowerCase().includes(query);
      const matchesRole = filterRole === "all" || employee.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [employees, search, filterRole]);

  const isFiltering = search !== "" || filterRole !== "all";

  // Only show validation errors after the user has tried to submit
  const formError = submitted ? validateForm(form) : "";

  // ── Modal handlers ─────────────────────────────────────────────────────────
  const closeModal = () => {
    setShowModal(false);
    setForm(DEFAULT_FORM);
    setSubmitted(false);
  };

  const updateField = (key: keyof FormState) => (value: string) => {
    setForm((current) => ({ ...current, [key]: sanitizeField(key, value) }));
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    setSubmitted(true);

    const error = validateForm(form);
    if (error) {
      notify("warning", error);
      return;
    }
    if (!user?.token) return;

    setIsSubmitting(true);
    try {
      await staffApi.create(user.token, {
        username: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
      });
      await fetchStaff();
      closeModal();
      notify("success", "Staff account created.");
    } catch (err) {
      handleApiError(err, "Failed to create account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (id: number, name: string) => {
    const confirmed = await confirm({
      title: "Delete staff account?",
      message: (
        <>
          Permanently remove <strong>{name}</strong>'s account. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete account",
      cancelLabel: "Cancel",
      danger: true,
    });
    if (!confirmed || !user?.token) return;

    try {
      await staffApi.delete(user.token, id);
      // Reload from the server so the list always matches the database
      await fetchStaff();
      notify("success", "Staff account deleted.");
    } catch (err) {
      handleApiError(err, "Failed to delete account.");
    }
  };

  // ── Layout ─────────────────────────────────────────────────────────────────
  const contentPadding = isMobile
    ? "78px 14px 22px"
    : isTablet
      ? "84px 18px 28px"
      : "32px 36px 32px 88px";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: FONT_FAMILY, color: "#1a202c" }}>
      <Sidebar />
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      <div style={{ padding: contentPadding }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>Staff Accounts</div>
            <div style={{ fontSize: 12, color: "#a0aec0", marginTop: 3 }}>Manage employee access and roles</div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: "#1a202c",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: FONT_FAMILY,
              cursor: "pointer",
            }}
          >
            + Add Employee
          </button>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
            gap: 20,
            marginBottom: 24,
            paddingBottom: 20,
            borderBottom: "1px solid #f0f4f8",
          }}
        >
          <StatCard label="Total" value={employees.length} />
          {ROLES.map((role) => (
            <StatCard
              key={role}
              label={ROLE_LABEL[role]}
              value={employees.filter((employee) => employee.role === role).length}
            />
          ))}
        </div>

        {/* Search and role filter */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            style={{ ...inputStyle, flex: 1, minWidth: 180 }}
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as RoleFilter)}
            style={inputStyle}
          >
            <option value="all">All Roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </div>

        {/* Staff table */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflowX: "auto", marginBottom: 40 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {TABLE_COLUMNS.map((heading, i) => (
                  <th key={`${heading}-${i}`} style={headerCellStyle}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} style={{ ...emptyRowStyle, color: "#94a3b8" }}>
                    Loading staff accounts...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} style={{ ...emptyRowStyle, color: "#cbd5e0" }}>
                    {isFiltering ? "No results match your search." : "No employees yet. Add one above."}
                  </td>
                </tr>
              ) : (
                <AnimatePresence initial={false}>
                  {filteredEmployees.map((employee, index) => (
                    <StaffRow
                      key={employee.id}
                      employee={employee}
                      index={index}
                      onRemove={(id, name) => void handleRemove(id, name)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        {/* Add employee modal */}
        <AnimatePresence>
          {showModal && (
            <AddEmployeeModal
              form={form}
              error={formError}
              isSubmitting={isSubmitting}
              isMobile={isMobile}
              onFieldChange={updateField}
              onSubmit={() => void handleAdd()}
              onClose={closeModal}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}