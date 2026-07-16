import { ApiResponse } from "../../shared/types";
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
// Every call site already passes a fully-qualified path (e.g. api('/api/claims')),
// so this must NOT also prepend '/api' — doing so produced '/api/api/claims',
// which 404s. Kept as a named constant (rather than removed outright) so a
// future path convention change has one obvious place to update.
const API_BASE_URL = '';
interface ApiRequestInit extends RequestInit {
  params?: Record<string, string | number | boolean>;
  retry?: number;
}
const reportError = (error: Error, path: string) => {
  try {
    navigator.sendBeacon('/api/client-errors', JSON.stringify({
      message: error.message,
      stack: error.stack,
      url: window.location.href,
      source: `api-client:${path}`,
      timestamp: new Date().toISOString(),
    }));
  } catch (e) {
    console.error("Failed to report client error:", e);
  }
};
async function performRequest<T>(path: string, init: ApiRequestInit | undefined): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout
  let url = `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  if (init?.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(init.params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  const token = useAuth.getState().token;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
      signal: init?.signal || controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.status === 401 && path !== '/auth/login') {
      // Session expired or was never established: drop local auth state and
      // send the user back to login rather than showing a confusing generic error.
      useAuth.getState().logout();
      const authError = new Error('Your session has expired. Please sign in again.');
      toast.error('Session Expired', { description: authError.message });
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
      throw authError;
    }
    const json = (await res.json()) as ApiResponse<T>;
    if (!res.ok || !json.success || json.data === undefined) {
      const errorMessage = json.error || `Request failed with status ${res.status}`;
      const apiError = new Error(errorMessage);
      console.error(`API Error on ${path}:`, errorMessage);
      toast.error('API Error', { description: errorMessage });
      reportError(apiError, path);
      throw apiError;
    }
    return json.data;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
// A request that never reached the server (DNS failure, connection reset, the
// browser blocking it outright) surfaces as a TypeError from fetch() itself —
// distinct from an AbortError (our own 30s timeout / caller cancellation) and
// from the Error thrown above for a real HTTP response the server sent back.
// Only that TypeError case is safe to retry: a genuine server response (even
// an error one) already happened and must not be replayed, and a mutating
// call like ingest-note must never be retried after it may have already run.
function isRetriableNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}
export async function api<T>(path: string, init?: ApiRequestInit): Promise<T> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    const offlineError = new Error('You are offline. Please check your internet connection.');
    toast.error('Network Error', { description: offlineError.message });
    throw offlineError;
  }
  const maxAttempts = 1 + Math.max(0, init?.retry ?? 2);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await performRequest<T>(path, init);
    } catch (error) {
      const canRetry = attempt < maxAttempts && isRetriableNetworkError(error);
      if (canRetry) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        continue;
      }
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error(`Network or parsing error on ${path} (attempt ${attempt}/${maxAttempts}):`, error);
        const description = attempt > 1
          ? `Could not connect to the server after ${attempt} attempts (${error.message || error.name}). Please check your connection and try again.`
          : `Could not connect to the server (${error.message || error.name}). Please try again.`;
        toast.error('Network Error', { description });
        reportError(error, path);
      }
      throw error;
    }
  }
  // Unreachable: the loop above always returns or throws.
  throw new Error('Request failed');
}