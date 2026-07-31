import { supabase } from './supabaseClient';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// The only place in the frontend that calls fetch. It attaches the Supabase access token
// and the current client id header, and turns the API's { code, message, details } error
// body into a typed ApiError so screens can branch on `.code` instead of parsing strings.
export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; clientId?: string | null; signal?: AbortSignal } = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.clientId) headers['X-Client-Id'] = options.clientId;

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      json?.message ?? `Request failed with status ${response.status}`,
      json?.code ?? 'UNKNOWN_ERROR',
      response.status,
      json?.details,
    );
  }

  return json as T;
}

// The document file endpoint requires the same auth headers as any other API call, so an
// <img src="..."> tag (which cannot set headers) cannot point at it directly. This fetches
// the bytes and hands back an object URL for an <img> to use instead.
export async function apiFetchBlobUrl(path: string, clientId: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Client-Id': clientId,
    },
  });
  if (!response.ok) throw new Error(`Failed to load file (${response.status})`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

// Uploads use FormData rather than JSON, so this bypasses the JSON body handling above.
export async function apiUpload<T>(path: string, file: File, clientId: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Client-Id': clientId,
    },
    body: formData,
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(json?.message ?? 'Upload failed', json?.code ?? 'UNKNOWN_ERROR', response.status, json?.details);
  }
  return json as T;
}
