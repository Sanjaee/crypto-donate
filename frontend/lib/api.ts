export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// URL untuk panggilan server-to-server (RSC / route handler).
// NB: pakai bracket notation agar NILAI DIBACA PADA RUNTIME (bukan di-inline
// saat build). Di Docker, nilai ini datang dari env container (http://api:8080/api).
export const API_BASE =
  process.env["API_INTERNAL_URL"] || process.env["NEXT_PUBLIC_API_URL"] || "";

function internalHeaders(userId?: string): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tok = process.env["INTERNAL_API_TOKEN"];
  if (tok) {
    headers["X-Internal-Token"] = tok;
  }
  if (userId) {
    headers["X-User-ID"] = userId;
  }
  return headers;
}

/** Panggil Go API dari server Next.js (RSC / route handler), autentikasi via internal token. */
export async function serverApi<T>(
  path: string,
  userId: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...internalHeaders(userId), ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json?.error ?? "request failed", res.status);
  }
  return json?.data as T;
}

/** Panggil endpoint publik Go API dari browser (path relatif, lewat Nginx / dev rewrite). */
export async function publicApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json?.error ?? "request failed", res.status);
  }
  return json?.data as T;
}

/** Panggil route handler /app-api/* (Next.js -> Go) dari client component. */
export async function clientApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`/app-api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json?.error ?? "request failed", res.status);
  }
  return json?.data as T;
}
