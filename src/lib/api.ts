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
      // Local HTTP APIs are only safe behind a same-origin dev proxy.
      if (isLocalHostname(parsed.hostname)) return "/api";
      return baseWithApi.replace(/^http:\/\//i, "https://");
    } catch {
      return "/api";
    }
  }

  return baseWithApi;
}

const API_BASE_URL = resolveApiBaseUrl();

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

// Shape of a failed API error response body
interface ApiErrorData {
  message?: string;
  [key: string]: unknown;
}

// Enriched error thrown on non-OK responses
interface ApiError extends Error {
  status: number;
  data: ApiErrorData | string | null;
}

// Body types accepted by apiCall
type ApiBody = object | FormData | URLSearchParams | string;

// Return type for authApi.login
interface LoginResponse {
  token: string;
  userId: number;
  username: string;
  email: string;
  role: "administrator" | "cashier" | "cook" | "inventory_manager" | "customer";
}

/**
 * Centralized API fetch wrapper
 * - Auth header is read from cookie/session (no localStorage)
 * - Serializes JSON bodies (but allows FormData/strings)
 * - Handles empty/non-JSON responses safely
 * - Throws enriched Error objects on non-OK responses
 */
export const apiCall = async <T = unknown>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> => {
  const { skipAuth = false, ...fetchOptions } = options;

  const isAbsoluteUrl = /^https?:\/\//i.test(endpoint);
  const endpointWithoutApiPrefix = endpoint.replace(/^\/?api(?=\/)/i, "");
  const normalizedEndpoint = endpointWithoutApiPrefix.startsWith("/")
    ? endpointWithoutApiPrefix
    : `/${endpointWithoutApiPrefix}`;
  const url = isAbsoluteUrl ? endpoint : `${API_BASE_URL}${normalizedEndpoint}`;

  const headers: Record<string, string> = {
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };

  // Bypass ngrok's browser warning page so API requests reach your backend.
  if (/ngrok-free\.(app|dev)|ngrok\.io/i.test(url)) {
    headers["ngrok-skip-browser-warning"] = "true";
  }

  if (!skipAuth) {
    const token = localStorage.getItem("authToken");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  // Prepare body: if body present and not FormData/string, stringify and set JSON header
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

    // Non-OK responses: try parse JSON then attach details
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

    // OK responses: return parsed JSON when available, otherwise return raw text or empty object
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
};

// Common API methods (pass raw bodies; apiCall handles serialization)
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

// Auth-specific API calls
export const authApi = {
  login: (usernameOrEmail: string, password: string) =>
    api.post<LoginResponse>("/auth/login", {
      username: usernameOrEmail,
      email: usernameOrEmail,
      password,
    }),

  /**
   * Register a new admin
   * @param name user's name
   * @param email user's email (will be used as username)
   * @param password plain text password
   */
  register: (name: string, email: string, password: string) =>
    api.post<void>("/auth/register", { name, email, password }),

  logout: () => api.post<void>("/auth/logout"),
};

export const staffApi = {
  getAll: () => apiCall<StaffMember[]>("/users/staff", { method: "GET" }),

  create: (data: {
    username: string;
    email: string;
    password: string;
    role: string;
  }) =>
    apiCall<{ message: string; userId: number; role: string }>(
      "/users/staff/create",
      { method: "POST", body: JSON.stringify(data) },
    ),

  delete: (id: number) =>
    apiCall<{ message: string }>(`/users/staff/${id}`, { method: "DELETE" }),
};

// ─── Add StaffMember type ──────────────────────────────────────
export interface StaffMember {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
}
