// API configuration and utility functions
const API_BASE_URL = '/api';

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
type ApiBody = object | FormData | URLSearchParams | string

// Return type for authApi.login
interface LoginResponse {
  token: string;
  username?: string;
  name?: string;
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
  options: FetchOptions = {}
): Promise<T> => {
  const { skipAuth = false, ...fetchOptions } = options;

  const url = `${API_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string> || {}),
  };

  // Auth token injected server-side via httpOnly cookie — no localStorage needed
  // If your backend still requires a Bearer token header, handle it here:
  // if (!skipAuth) { headers['Authorization'] = `Bearer ${cookieToken}` }
  void skipAuth; // explicitly unused until backend auth strategy is finalized

  // Prepare body: if body present and not FormData/string, stringify and set JSON header
  let bodyToSend: BodyInit | undefined = undefined;
  if (fetchOptions.body !== undefined && fetchOptions.body !== null) {
    const b = fetchOptions.body as ApiBody;
    if (typeof b === 'string' || b instanceof FormData || b instanceof URLSearchParams) {
      bodyToSend = b;
    } else {
      bodyToSend = JSON.stringify(b);
      headers['Content-Type'] = 'application/json';
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
        typeof errData === 'object' && errData !== null
          ? errData.message ?? `HTTP ${response.status}`
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
    apiCall<T>(endpoint, { method: 'GET' }),

  post: <T = unknown>(endpoint: string, body?: ApiBody) =>
    apiCall<T>(endpoint, { method: 'POST', body: body as BodyInit }),

  put: <T = unknown>(endpoint: string, body?: ApiBody) =>
    apiCall<T>(endpoint, { method: 'PUT', body: body as BodyInit }),

  delete: <T = unknown>(endpoint: string) =>
    apiCall<T>(endpoint, { method: 'DELETE' }),

  patch: <T = unknown>(endpoint: string, body?: ApiBody) =>
    apiCall<T>(endpoint, { method: 'PATCH', body: body as BodyInit }),
};

// Auth-specific API calls
export const authApi = {
  login: (username: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { username, password }),

  /**
   * Register a new admin
   * @param name user's name
   * @param email user's email (will be used as username)
   * @param password plain text password
   */
  register: (name: string, email: string, password: string) =>
    api.post<void>('/auth/register', { name, email, password }),

  logout: () => api.post<void>('/auth/logout'),
};