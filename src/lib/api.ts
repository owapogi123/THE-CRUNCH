// API configuration and utility functions
const API_BASE_URL = '/api';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

/**
 * Centralized API fetch wrapper
 * - Adds auth header from localStorage (unless skipped)
 * - Serializes JSON bodies (but allows FormData/strings)
 * - Handles empty/non-JSON responses safely
 * - Throws enriched Error objects on non-OK responses
 */
export const apiCall = async <T = any>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> => {
  const { skipAuth = false, ...fetchOptions } = options;

  const url = `${API_BASE_URL}${endpoint}`;

  const headers: HeadersInit = {
    ...((fetchOptions && fetchOptions.headers) || {}),
  };

  // Add auth token if it exists and not skipped
  if (!skipAuth) {
    const token = localStorage.getItem('authToken');
    if (token) {
      (headers as any)['Authorization'] = `Bearer ${token}`;
    }
  }

  // Prepare body: if body present and not FormData/string, stringify and set JSON header
  let bodyToSend: BodyInit | undefined = undefined;
  if (fetchOptions.body !== undefined && fetchOptions.body !== null) {
    const b = fetchOptions.body as any;
    if (typeof b === 'string' || b instanceof FormData || b instanceof URLSearchParams) {
      bodyToSend = b as BodyInit;
    } else {
      bodyToSend = JSON.stringify(b);
      (headers as any)['Content-Type'] = 'application/json';
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
      let errData: any = null;
      try {
        errData = text ? JSON.parse(text) : null;
      } catch (_) {
        errData = text;
      }
      const err: any = new Error(errData?.message || `HTTP ${response.status}`);
      err.status = response.status;
      err.data = errData;
      throw err;
    }

    // OK responses: return parsed JSON when available, otherwise return raw text or empty object
    if (!text) return ({} as T);
    try {
      return JSON.parse(text) as T;
    } catch {
      return (text as unknown) as T;
    }
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
};

// Common API methods (pass raw bodies; apiCall handles serialization)
export const api = {
  get: <T = any>(endpoint: string) => apiCall<T>(endpoint, { method: 'GET' }),

  post: <T = any>(endpoint: string, body?: any) =>
    apiCall<T>(endpoint, { method: 'POST', body }),

  put: <T = any>(endpoint: string, body?: any) =>
    apiCall<T>(endpoint, { method: 'PUT', body }),

  delete: <T = any>(endpoint: string) => apiCall<T>(endpoint, { method: 'DELETE' }),

  patch: <T = any>(endpoint: string, body?: any) =>
    apiCall<T>(endpoint, { method: 'PATCH', body }),
};

// Auth-specific API calls
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),

  register: (username: string, password: string) =>
    api.post('/auth/register', { username, password }),

  logout: () => {
    localStorage.removeItem('authToken');
    return Promise.resolve();
  },
};
