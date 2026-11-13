import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Save, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { SkeletonSectionCard, SkeletonFormField } from "@/components/ui/skeleton";
import { useAuth } from "@/context/authcontext";
import { api } from "@/lib/api";
import { normalizeRole } from "@/lib/permissions";

interface OwnAccount {
  id: number;
  username: string;
  email: string;
  role: string;
}

type Notice = { tone: "success" | "error"; text: string } | null;

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,100}$/;
const HOME_BY_ROLE: Record<string, string> = {
  administrator: "/dashboard",
  cashier: "/menu",
  inventory_manager: "/inventory",
  customer: "/",
};

function roleLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isCustomerAccountRole(value: unknown) {
  const role = String(value ?? "").trim().toLowerCase();
  return role === "customer" || role === "user";
}

function PasswordField({
  id,
  label,
  value,
  visible,
  autoComplete,
  customerTheme = false,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  autoComplete: string;
  customerTheme?: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className={`mb-2 block text-sm font-semibold ${customerTheme ? "text-stone-200" : "text-slate-700"}`}>{label}</span>
      <span className="relative block">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          maxLength={100}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className={customerTheme
            ? "w-full rounded-xl border border-white/10 bg-[#1b1717] px-4 py-3 pr-12 text-sm text-[#f3efe9] outline-none transition placeholder:text-stone-600 focus:border-[#f7c948] focus:ring-4 focus:ring-[#f7c948]/10"
            : "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-slate-700 focus:ring-4 focus:ring-slate-200"}
        />
        <button
          type="button"
          onClick={onToggle}
          className={customerTheme
            ? "absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-stone-400 transition hover:bg-white/10 hover:text-[#f7c948] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7c948]"
            : "absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

export default function MyAccount() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [account, setAccount] = useState<OwnAccount | null>(null);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, next: false, confirm: false });
  const isCustomer = isCustomerAccountRole(account?.role || user?.role);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<OwnAccount>("/users/me");
      setAccount(data);
      setUsername(data.username);
      updateUser({ username: data.username, email: data.email, role: data.role });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "We could not load your account.");
    } finally {
      setLoading(false);
    }
  }, [updateUser]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    const cleanUsername = username.trim();
    if (cleanUsername.length < 2 || cleanUsername.length > 100) {
      setProfileNotice({ tone: "error", text: "Display name must be between 2 and 100 characters." });
      return;
    }
    setProfileBusy(true);
    setProfileNotice(null);
    try {
      const saved = await api.put<OwnAccount>("/users/me", { username: cleanUsername });
      setAccount(saved);
      setUsername(saved.username);
      updateUser({ username: saved.username, email: saved.email, role: saved.role });
      setProfileNotice({ tone: "success", text: "Your account details were updated." });
    } catch (error) {
      setProfileNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "We could not update your account.",
      });
    } finally {
      setProfileBusy(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwords.current || !passwords.next || !passwords.confirm) {
      setPasswordNotice({ tone: "error", text: "Complete all three password fields." });
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordNotice({ tone: "error", text: "The new passwords do not match." });
      return;
    }
    if (!PASSWORD_RULE.test(passwords.next)) {
      setPasswordNotice({
        tone: "error",
        text: "Use 8–100 characters with at least one letter and one number.",
      });
      return;
    }
    setPasswordBusy(true);
    setPasswordNotice(null);
    try {
      await api.put<{ message: string }>("/users/me/password", {
        currentPassword: passwords.current,
        newPassword: passwords.next,
        confirmPassword: passwords.confirm,
      });
      setPasswords({ current: "", next: "", confirm: "" });
      setVisiblePasswords({ current: false, next: false, confirm: false });
      setPasswordNotice({ tone: "success", text: "Your password was changed successfully." });
    } catch (error) {
      setPasswordNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "We could not change your password.",
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  const goHome = () => {
    const role = normalizeRole(account?.role || user?.role);
    navigate(HOME_BY_ROLE[role || ""] || "/");
  };

  return (
    <div className={isCustomer
      ? "min-h-screen bg-[#0a0808] font-['Poppins',sans-serif] text-[#f3efe9]"
      : "min-h-screen bg-slate-100 px-4 py-8 font-['Poppins',sans-serif] sm:px-6 sm:py-12"}
    >
      {!isCustomer && <Sidebar />}
      {isCustomer && (
        <header className="sticky top-0 z-40 border-b border-white/[0.09] bg-[#0a0808]/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={goHome}
              aria-label="The Crunch customer home"
              className="inline-flex min-w-0 items-center gap-2.5 rounded-lg text-left text-[#f3efe9] outline-none focus-visible:ring-2 focus-visible:ring-[#f7c948] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0a0808]"
            >
              <img src="/img/logo24.webp" alt="" className="h-8 w-8 shrink-0 object-contain" />
              <span className="truncate text-base font-bold tracking-tight sm:text-lg">
                The <span className="text-[#f7c948]">Crunch</span>
              </span>
            </button>
            <button
              type="button"
              onClick={goHome}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-stone-300 transition hover:border-[#f7c948]/50 hover:bg-[#f7c948]/10 hover:text-[#f7c948] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7c948] sm:px-4 sm:text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Customer View</span>
              <span className="sm:hidden">Back</span>
            </button>
          </div>
        </header>
      )}
      <main className={isCustomer
        ? "relative mx-auto w-full max-w-5xl overflow-hidden px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
        : "mx-auto w-full max-w-3xl"}
      >
        {isCustomer && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_right,rgba(247,201,72,0.14),transparent_52%)]" />
        )}
        {!isCustomer && (
          <button
            type="button"
            onClick={goHome}
            className="mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

        <header className={isCustomer
          ? "relative z-10 mb-6 overflow-hidden rounded-3xl border border-white/[0.09] bg-[#121010] px-5 py-7 shadow-2xl shadow-black/30 sm:px-8 sm:py-9"
          : "mb-6 rounded-2xl bg-slate-900 px-6 py-7 text-white shadow-lg sm:px-8"}
        >
          <div className={`flex ${isCustomer ? "items-start justify-between gap-5" : "items-center gap-4"}`}>
            <div className="flex min-w-0 items-center gap-4">
              <span className={isCustomer
                ? "grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[#f7c948]/30 bg-[#f7c948]/10 text-[#f7c948] sm:h-16 sm:w-16"
                : "grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10"}
              >
                <UserRound className={isCustomer ? "h-7 w-7" : "h-6 w-6"} />
              </span>
              <div className="min-w-0">
                {isCustomer && <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-[#f7c948]">Customer account</p>}
                <h1 className={isCustomer ? "text-2xl font-bold tracking-tight text-[#f3efe9] sm:text-3xl" : "text-2xl font-bold"}>My Profile</h1>
                <p className={isCustomer ? "mt-1 text-sm leading-6 text-stone-400" : "mt-1 text-sm text-slate-300"}>
                  {isCustomer ? "Manage your account details and keep your sign-in secure." : "Update your own sign-in details securely."}
                </p>
              </div>
            </div>
            {isCustomer && account && (
              <span className="hidden max-w-48 truncate rounded-full border border-white/10 bg-[#1b1717] px-3 py-1.5 text-xs font-semibold text-stone-300 sm:block">
                {account.username}
              </span>
            )}
          </div>
        </header>

        {loading ? (
          <div className={isCustomer ? "relative z-10 space-y-4" : "space-y-4"}>
            <SkeletonSectionCard theme={isCustomer ? "customer" : "admin"} />
            <SkeletonFormField theme={isCustomer ? "customer" : "admin"} label />
            <SkeletonFormField theme={isCustomer ? "customer" : "admin"} label />
            <SkeletonFormField theme={isCustomer ? "customer" : "admin"} label />
          </div>
        ) : loadError || !account ? (
          <div className={isCustomer ? "relative z-10 rounded-2xl border border-white/[0.09] bg-[#121010] p-8 text-center shadow-sm" : "rounded-2xl bg-white p-8 text-center shadow-sm"}>
            <p className="text-sm text-red-600">{loadError || "Account details are unavailable."}</p>
            <button type="button" onClick={() => void loadAccount()} className={isCustomer ? "mt-4 rounded-xl bg-[#f7c948] px-4 py-2 text-sm font-bold text-[#1a1200] hover:bg-[#ffd969]" : "mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"}>Try again</button>
          </div>
        ) : (
          <div className={isCustomer ? "relative z-10 grid gap-6 lg:grid-cols-2 lg:items-start" : "space-y-6"}>
            <form onSubmit={saveProfile} className={isCustomer ? "rounded-2xl border border-white/[0.09] bg-[#121010] p-5 shadow-xl shadow-black/20 sm:p-7" : "rounded-2xl bg-white p-5 shadow-sm sm:p-7"}>
              <h2 className={isCustomer ? "text-lg font-bold text-[#f3efe9]" : "text-lg font-bold text-slate-900"}>Account details</h2>
              <p className={isCustomer ? "mt-1 text-sm text-stone-400" : "mt-1 text-sm text-slate-500"}>These details belong only to your signed-in account.</p>
              <div className="mt-6 space-y-5">
                <label className="block" htmlFor="account-username">
                  <span className={isCustomer ? "mb-2 block text-sm font-semibold text-stone-200" : "mb-2 block text-sm font-semibold text-slate-700"}>Display name / username</span>
                  <input
                    id="account-username"
                    value={username}
                    maxLength={100}
                    autoComplete="username"
                    onChange={(event) => setUsername(event.target.value)}
                    className={isCustomer ? "w-full rounded-xl border border-white/10 bg-[#1b1717] px-4 py-3 text-sm text-[#f3efe9] outline-none transition focus:border-[#f7c948] focus:ring-4 focus:ring-[#f7c948]/10" : "w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-700 focus:ring-4 focus:ring-slate-200"}
                  />
                </label>
                <div className={isCustomer ? "grid gap-5" : "grid gap-5 sm:grid-cols-2"}>
                  <label className="block">
                    <span className={isCustomer ? "mb-2 block text-sm font-semibold text-stone-200" : "mb-2 block text-sm font-semibold text-slate-700"}>Email address</span>
                    <input value={account.email} readOnly className={isCustomer ? "w-full cursor-not-allowed rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-stone-400" : "w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600"} />
                    <span className={isCustomer ? "mt-2 block text-xs leading-5 text-stone-500" : "mt-2 block text-xs leading-5 text-slate-500"}>Email changes need a separate verification process and are not available yet.</span>
                  </label>
                  <label className="block">
                    <span className={isCustomer ? "mb-2 block text-sm font-semibold text-stone-200" : "mb-2 block text-sm font-semibold text-slate-700"}>Role</span>
                    <input value={roleLabel(account.role)} readOnly className={isCustomer ? "w-full cursor-not-allowed rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-stone-400" : "w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600"} />
                    <span className={isCustomer ? "mt-2 block text-xs leading-5 text-stone-500" : "mt-2 block text-xs leading-5 text-slate-500"}>Your role and permissions cannot be changed from this page.</span>
                  </label>
                </div>
              </div>
              {profileNotice && <p role="status" className={`mt-5 text-sm ${profileNotice.tone === "success" ? (isCustomer ? "text-emerald-400" : "text-emerald-700") : (isCustomer ? "text-red-400" : "text-red-600")}`}>{profileNotice.text}</p>}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" disabled={profileBusy} onClick={() => { setUsername(account.username); setProfileNotice(null); }} className={isCustomer ? "rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-stone-300 transition hover:border-white/20 hover:bg-white/[0.05] disabled:opacity-50" : "rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"}>Cancel</button>
                <button type="submit" disabled={profileBusy || username.trim() === account.username} className={isCustomer ? "inline-flex items-center justify-center gap-2 rounded-xl bg-[#f7c948] px-4 py-2.5 text-sm font-bold text-[#1a1200] transition hover:bg-[#ffd969] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7c948] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121010] disabled:cursor-not-allowed disabled:opacity-40" : "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"}>
                  <Save className="h-4 w-4" />{profileBusy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>

            <form onSubmit={changePassword} className={isCustomer ? "rounded-2xl border border-white/[0.09] bg-[#121010] p-5 shadow-xl shadow-black/20 sm:p-7" : "rounded-2xl bg-white p-5 shadow-sm sm:p-7"}>
              <div className="flex items-center gap-3">
                <LockKeyhole className={isCustomer ? "h-5 w-5 text-[#f7c948]" : "h-5 w-5 text-slate-700"} />
                <h2 className={isCustomer ? "text-lg font-bold text-[#f3efe9]" : "text-lg font-bold text-slate-900"}>Change password</h2>
              </div>
              <p className={isCustomer ? "mt-2 text-sm leading-6 text-stone-400" : "mt-2 text-sm leading-6 text-slate-500"}>Enter your current password first. Your new password needs at least one letter and one number.</p>
              <div className="mt-6 grid gap-5">
                <PasswordField customerTheme={isCustomer} id="current-password" label="Current password" value={passwords.current} visible={visiblePasswords.current} autoComplete="current-password" onChange={(current) => setPasswords((value) => ({ ...value, current }))} onToggle={() => setVisiblePasswords((value) => ({ ...value, current: !value.current }))} />
                <PasswordField customerTheme={isCustomer} id="new-password" label="New password" value={passwords.next} visible={visiblePasswords.next} autoComplete="new-password" onChange={(next) => setPasswords((value) => ({ ...value, next }))} onToggle={() => setVisiblePasswords((value) => ({ ...value, next: !value.next }))} />
                <PasswordField customerTheme={isCustomer} id="confirm-password" label="Confirm new password" value={passwords.confirm} visible={visiblePasswords.confirm} autoComplete="new-password" onChange={(confirm) => setPasswords((value) => ({ ...value, confirm }))} onToggle={() => setVisiblePasswords((value) => ({ ...value, confirm: !value.confirm }))} />
              </div>
              {passwordNotice && <p role="status" className={`mt-5 text-sm ${passwordNotice.tone === "success" ? (isCustomer ? "text-emerald-400" : "text-emerald-700") : (isCustomer ? "text-red-400" : "text-red-600")}`}>{passwordNotice.text}</p>}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" disabled={passwordBusy} onClick={() => { setPasswords({ current: "", next: "", confirm: "" }); setPasswordNotice(null); }} className={isCustomer ? "rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-stone-300 transition hover:border-white/20 hover:bg-white/[0.05] disabled:opacity-50" : "rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"}>Cancel</button>
                <button type="submit" disabled={passwordBusy} className={isCustomer ? "rounded-xl bg-[#f7c948] px-4 py-2.5 text-sm font-bold text-[#1a1200] transition hover:bg-[#ffd969] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7c948] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121010] disabled:opacity-40" : "rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"}>{passwordBusy ? "Changing…" : "Change password"}</button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
