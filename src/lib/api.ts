const BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: { data?: unknown; error?: string } | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as { data?: unknown; error?: string };
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const msg = json?.error ?? (text ? text.slice(0, 200) : res.statusText);
    throw new ApiError(msg, res.status);
  }
  // A 2xx response that isn't valid JSON (e.g. a stray PHP warning printed
  // before the body) must NOT silently become `null` — throw so callers'
  // `safe()` wrappers fall back to empty state instead of crashing.
  if (json === null) {
    throw new ApiError('Malformed response from server', res.status);
  }
  return (json.data ?? null) as T;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

// Multipart upload. No Content-Type header — the browser sets the multipart
// boundary itself when given a FormData body.
async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  return handle<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload: <T>(path: string, form: FormData) => upload<T>(path, form),
};
