import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthUser {
  token: string;
  username: string;
  role: string;
  userId: string;
}

export interface AttendanceRecord {
  id: string;
  username: string;
  role: string;
  timeIn: Date;
  timeOut: Date | null;
  /** Derived — computed on read, not stored */
  duration?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isOnline: boolean;
  attendance: AttendanceRecord[];
  login: (data: AuthUser) => void;
  logout: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeDuration(timeIn: Date, timeOut: Date | null): string {
  if (!timeOut) return "— ongoing";
  const ms = timeOut.getTime() - timeIn.getTime();
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;

  const token = localStorage.getItem("authToken");
  const username = localStorage.getItem("userName");
  const role = localStorage.getItem("userRole");
  const userId = localStorage.getItem("userId");
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";

  if (!token || !username || !role || !userId || !isAuthenticated) {
    return null;
  }

  return { token, username, role, userId };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [isOnline, setIsOnline] = useState(() => !!readStoredUser());

  /**
   * attendanceRef is the source of truth.
   * We keep a ref so logout() can stamp timeOut synchronously
   * before setUser(null) triggers a re-render and loses the username.
   *
   * TODO: Replace with real API calls when backend is ready:
   *   login  → await attendanceApi.timeIn(data.username, data.role)
   *   logout → await attendanceApi.timeOut(user.username)
   *   read   → await attendanceApi.getAll()
   */
  const attendanceRef = useRef<AttendanceRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  /** Keeps ref and state in sync, and enriches records with computed duration */
  const syncAttendance = (records: AttendanceRecord[]) => {
    attendanceRef.current = records;
    setAttendance(
      records.map((r) => ({
        ...r,
        duration: computeDuration(r.timeIn, r.timeOut),
      }))
    );
  };

  // ── Login ──────────────────────────────────────────────────────────────────

  const login = (data: AuthUser) => {
    setUser(data);
    setIsOnline(true);

    const current = attendanceRef.current;
    const alreadyIn = current.some(
      (r) => r.username === data.username && r.timeOut === null
    );

    if (!alreadyIn) {
      const newRecord: AttendanceRecord = {
        id: crypto.randomUUID(),
        username: data.username,
        role: data.role,
        timeIn: new Date(),
        timeOut: null,
      };
      syncAttendance([newRecord, ...current]);
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────

  const logout = () => {
    const timeOut = new Date();

    /**
     * Stamp timeOut via ref FIRST — synchronously, before setUser(null)
     * causes a re-render that would lose user.username.
     */
    const updated = attendanceRef.current.map((r) =>
      r.username === user?.username && r.timeOut === null
        ? { ...r, timeOut }
        : r
    );

    syncAttendance(updated);
    setIsOnline(false);
    setUser(null);
    if (typeof window !== "undefined") {
      ["authToken", "isAuthenticated", "userName", "userRole", "userId"].forEach(
        (key) => localStorage.removeItem(key),
      );
      window.dispatchEvent(new Event("authChange"));
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncStoredAuth = () => {
      const storedUser = readStoredUser();
      setUser(storedUser);
      setIsOnline(!!storedUser);
    };

    window.addEventListener("authChange", syncStoredAuth);
    window.addEventListener("storage", syncStoredAuth);

    return () => {
      window.removeEventListener("authChange", syncStoredAuth);
      window.removeEventListener("storage", syncStoredAuth);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, isOnline, attendance, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
