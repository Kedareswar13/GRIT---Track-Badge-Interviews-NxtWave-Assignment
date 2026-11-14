// ─────────────────────────────────────────────────────────────────────────────
// Sessions — mock auth suitable for an internal tool. Login issues a base64
// session carried in the x-grit-session header; mutations enforce role.
// Production swap: real SSO + JWT + role middleware (documented in guide).
// ─────────────────────────────────────────────────────────────────────────────
import type { NextFunction, Request, Response } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { Session, Student, Staff, PasswordRecord } from "./types.js";
import { getDb } from "./db.js";

// ─── Passwords (scrypt, per-user salt, constant-time compare) ────────────────

export function hashPassword(plain: string): PasswordRecord {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 32).toString("hex");
  return { salt, hash };
}

export function verifyPassword(plain: string, rec: PasswordRecord): boolean {
  if (!rec?.salt || !rec?.hash) return false;
  const candidate = scryptSync(plain, rec.salt, 32);
  const stored = Buffer.from(rec.hash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

export function issueSession(user: Student | Staff): string {
  const session: Session =
    "role" in user && (user as Staff).role
      ? { role: "staff", userId: user.id, name: user.name, staffRole: (user as Staff).role }
      : { role: "student", userId: user.id, name: user.name };
  return Buffer.from(JSON.stringify(session)).toString("base64");
}

export function readSession(req: Request): Session | null {
  const raw = req.header("x-grit-session");
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8")) as Session;
  } catch {
    return null;
  }
}

function deny(res: Response, who: string): void {
  res.status(403).json({ ok: false, error: `${who} role required for this action.` });
}

/** Role gates — production would be middleware + RBAC; keep explicit for clarity. */
export function requireStudent(req: Request, res: Response, next: NextFunction): void {
  const s = readSession(req);
  if (!s || s.role !== "student") return deny(res, "Student");
  next();
}

export function requireStaff(req: Request, res: Response, next: NextFunction): void {
  const s = readSession(req);
  if (!s || s.role !== "staff") return deny(res, "Staff");
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const s = readSession(req);
  if (!s || s.role !== "staff" || s.staffRole !== "admin") return deny(res, "Admin");
  next();
}

/**
 * POST /api/auth/login { email, password } → session token + profile.
 * Password verified against the scrypt record; wrong password and unknown
 * email return the same 401 shape (no account enumeration).
 */
export function login(email: string, password: string): { token: string; user: Record<string, unknown> } | "badPassword" | null {
  const db = getDb();
  const student = db.students.find((s) => s.email.toLowerCase() === email.toLowerCase());
  if (student) {
    if (!verifyPassword(password, student.password)) return "badPassword";
    return { token: issueSession(student), user: { id: student.id, name: student.name, role: "student" } };
  }
  const staff = db.staff.find((s) => s.email.toLowerCase() === email.toLowerCase());
  if (staff) {
    if (!verifyPassword(password, staff.password)) return "badPassword";
    return { token: issueSession(staff), user: { id: staff.id, name: staff.name, role: "staff", staffRole: staff.role } };
  }
  return null;
}
