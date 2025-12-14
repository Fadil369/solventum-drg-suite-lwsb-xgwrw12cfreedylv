import { ApiResponse } from "../../shared/types";
import { toast } from 'sonner';
const API_BASE_URL = '/api';
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
export async function api<T>(path: string, init?: ApiRequestInit): Promise<T> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    const offlineError = new Error('You are offline. Please check your internet connection.');
    toast.error('Network Error', { description: offlineError.message });
    throw offlineError;
  }
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
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: init?.signal || controller.signal,
    });
    clearTimeout(timeoutId);
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
    if (error instanceof Error) {
      if (error.name !== 'AbortError') {
        console.error(`Network or parsing error on ${path}:`, error);
        toast.error('Network Error', { description: 'Could not connect to the server. Please try again.' });
        reportError(error, path);
      }
    }
    throw error;
  }
}