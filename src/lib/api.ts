// API configuration and utility functions
const RAW_API_URL = (import.meta as { env?: { VITE_API_URL?: string } }).env
  ?.VITE_API_URL;

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function resolveApiBaseUrl(): string {
  if (!RAW_API_URL) return "/api";

  const trimmed = RAW_API_URL.replace(/\/+$/, "");
  const baseWithApi = /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;

  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    /^http:\/\//i.test(trimmed)
  ) {
    try {
      const parsed = new URL(trimmed);
      if (isLocalHostname(parsed.hostname)) return "/api";
      return baseWithApi.replace(/^http:\/\//i, "https://");
    } catch {
      return "/api";
    }
  }

  return baseWithApi;
}

const API_BASE_URL = resolveApiBaseUrl();

type ApiBody = object | FormData | URLSearchParams | string;

interface FetchOptions extends Omit<RequestInit, "body"> {
  skipAuth?: boolean;
  token?: string;
  body?: ApiBody;
  suppressErrorStatuses?: number[];
}

interface ApiErrorData {
  message?: string;
  [key: string]: unknown;
}

interface ApiError extends Error {
  status: number;
  data: ApiErrorData | string | null;
}

interface LoginResponse {
  token: string;
  userId: number;
  username: string;
  email: string;
  role: "administrator" | "cashier" | "cook" | "inventory_manager" | "customer";
}

// ─── Attendance Record type ───────────────────────────────────────────────────
export interface AttendanceRecord {
  id: number;
  username: string;
  role: string;
  timeIn: Date;
  timeOut: Date | null;
}

// Raw shape returned from your backend
interface RawAttendanceRow {
  id: number;
  username?: string;
  user?: string;
  name?: string;
  role?: string;
  time_in?: string;
  timeIn?: string;
  time_out?: string | null;
  timeOut?: string | null;
}

export const apiCall = async <T = unknown>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> => {
  const {
    skipAuth = false,
    token,
    suppressErrorStatuses = [],
    ...fetchOptions
  } = options;

  const isAbsoluteUrl = /^https?:\/\//i.test(endpoint);
  const endpointWithoutApiPrefix = endpoint.replace(/^\/?api(?=\/)/i, "");
  const normalizedEndpoint = endpointWithoutApiPrefix.startsWith("/")
    ? endpointWithoutApiPrefix
    : `/${endpointWithoutApiPrefix}`;
  const url = isAbsoluteUrl ? endpoint : `${API_BASE_URL}${normalizedEndpoint}`;

  const headers: Record<string, string> = {
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  if (/ngrok-free\.(app|dev)|ngrok\.io/i.test(url)) {
    headers["ngrok-skip-browser-warning"] = "true";
  }

  if (!skipAuth && token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let bodyToSend: BodyInit | undefined = undefined;
  if (fetchOptions.body !== undefined && fetchOptions.body !== null) {
    const b = fetchOptions.body as ApiBody;
    if (
      typeof b === "string" ||
      b instanceof FormData ||
      b instanceof URLSearchParams
    ) {
      bodyToSend = b;
    } else {
      bodyToSend = JSON.stringify(b);
      headers["Content-Type"] = "application/json";
    }
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      body: bodyToSend,
      headers,
    });

    const text = await response.text();

    if (!response.ok) {
      let errData: ApiErrorData | string | null = null;
      try {
        errData = text ? (JSON.parse(text) as ApiErrorData) : null;
      } catch {
        errData = text;
      }
      const message =
        typeof errData === "object" && errData !== null
          ? (errData.message ?? `HTTP ${response.status}`)
          : `HTTP ${response.status}`;
      const err = new Error(message) as ApiError;
      err.status = response.status;
      err.data = errData;
      throw err;
    }

    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : null;

    if (!status || !suppressErrorStatuses.includes(status)) {
      console.error(`API Error [${endpoint}]:`, error);
    }
    throw error;
  }
};

// ─── Base API methods ─────────────────────────────────────────────────────────
export const api = {
  get: <T = unknown>(endpoint: string) =>
    apiCall<T>(endpoint, { method: "GET" }),

  post: <T = unknown>(endpoint: string, body?: ApiBody) =>
    apiCall<T>(endpoint, { method: "POST", body: body as BodyInit }),

  put: <T = unknown>(endpoint: string, body?: ApiBody) =>
    apiCall<T>(endpoint, { method: "PUT", body: body as BodyInit }),

  delete: <T = unknown>(endpoint: string) =>
    apiCall<T>(endpoint, { method: "DELETE" }),

  patch: <T = unknown>(endpoint: string, body?: ApiBody) =>
    apiCall<T>(endpoint, { method: "PATCH", body: body as BodyInit }),
};

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authApi = {
  login: (usernameOrEmail: string, password: string) =>
    apiCall<LoginResponse>("/auth/login", {
      method: "POST",
      skipAuth: true,
      body: {
        username: usernameOrEmail,
        email: usernameOrEmail,
        password,
      },
    }),

  register: (name: string, email: string, password: string) =>
    apiCall<void>("/auth/register", {
      method: "POST",
      skipAuth: true,
      body: { name, email, password },
    }),

  logout: (token: string) =>
    apiCall<void>("/auth/logout", {
      method: "POST",
      token,
      suppressErrorStatuses: [401],
    }),
};

// ─── Staff API ────────────────────────────────────────────────────────────────
export const staffApi = {
  getAll: (token: string) =>
    apiCall<StaffMember[]>("/users/staff", { method: "GET", token }),

  create: (
    token: string,
    data: { username: string; email: string; password: string; role: string },
  ) =>
    apiCall<{ message: string; userId: number; role: string }>(
      "/users/staff/create",
      { method: "POST", token, body: data },
    ),

  delete: (token: string, id: number) =>
    apiCall<{ message: string }>(`/users/staff/${id}`, {
      method: "DELETE",
      token,
    }),

  // ── Fetch ALL employees' attendance from backend ──────────────────────────
  // Adjust "/attendance/all" to match your actual backend route
  getAllAttendance: async (token: string): Promise<AttendanceRecord[]> => {
    const rows = await apiCall<RawAttendanceRow[]>("/attendance/all", {
      method: "GET",
      token,
    });

    return rows
      .map((r) => {
        const rawTimeIn = r.time_in ?? r.timeIn;
        if (!rawTimeIn) return null;

        const timeIn = new Date(rawTimeIn);
        if (isNaN(timeIn.getTime())) return null;

        const rawTimeOut = r.time_out ?? r.timeOut ?? null;
        const timeOut = rawTimeOut ? new Date(rawTimeOut) : null;

        return {
          id:       r.id,
          username: r.username ?? r.user ?? r.name ?? `User ${r.id}`,
          role:     r.role ?? "unknown",
          timeIn,
          timeOut:  timeOut && !isNaN(timeOut.getTime()) ? timeOut : null,
        } satisfies AttendanceRecord;
      })
      .filter((r): r is AttendanceRecord => r !== null);
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface StaffMember {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
}
