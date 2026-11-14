"use client";
// Session client — mirrors the backend's mock session (base64 in localStorage).
// Production swap: httpOnly cookie + SSO. See BUILD_GUIDE §8.

export interface GritSession {
  token: string;
  user: { id: string; name: string; role: "student" | "staff"; staffRole?: "interviewer" | "admin" };
}

const KEY = "grit.session";

/** Stored session = wire session + client-side expiry. */
export interface StoredSession extends GritSession { exp?: number }

export function saveSession(s: GritSession) {
  // 12h session — internal tool default
  localStorage.setItem(KEY, JSON.stringify({ ...s, exp: Date.now() + 12 * 3600_000 }));
}

export function getSession(): GritSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as StoredSession;
    if (Date.now() > (s.exp ?? Infinity)) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export async function callApi(path: string, body?: unknown) {
  const session = getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { "x-grit-session": session.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}
