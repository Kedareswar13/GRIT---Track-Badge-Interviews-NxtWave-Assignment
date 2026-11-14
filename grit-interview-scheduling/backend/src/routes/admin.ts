// Admin routes — account management (create/delete logins) for the admin
// command center. Every action is admin-gated and audited.
import { Router } from "express";
import { withDb } from "../db.js";
import { requireAdmin } from "../auth.js";
import { hashPassword } from "../auth.js";
import { uid, audit } from "../util.js";
import type { Student, Staff } from "../types.js";

export const admin = Router();

/** POST /api/admin/users — create a login (student | interviewer | admin). */
admin.post("/users", requireAdmin, (req, res) => {
  const { name, email, role, trackId, password } = req.body ?? {};
  const clean = {
    name: String(name ?? "").trim(),
    email: String(email ?? "").trim().toLowerCase(),
    role: String(role ?? ""),
    trackId: String(trackId ?? ""),
    password: String(password ?? ""),
  };

  if (!clean.name || !clean.email.includes("@")) {
    return res.status(400).json({ ok: false, error: "Full name and a valid email are required." });
  }
  if (!["student", "interviewer", "admin"].includes(clean.role)) {
    return res.status(400).json({ ok: false, error: "Role must be student, interviewer or admin." });
  }
  if (clean.password.length < 6) {
    return res.status(400).json({ ok: false, error: "Password must be at least 6 characters." });
  }

  const result = withDb((db) => {
    if (db.students.some((s) => s.email.toLowerCase() === clean.email) || db.staff.some((s) => s.email.toLowerCase() === clean.email)) {
      return { error: "That email already has a GRIT account." };
    }

    if (clean.role === "student") {
      const track = db.tracks.find((t) => t.id === clean.trackId);
      if (!track) return { error: "Pick a valid track for the student." };
      const student: Student = {
        id: uid("s"),
        name: clean.name,
        email: clean.email,
        trackId: track.id,
        skillsCleared: [], // new students start with no cleared skills
        interviewState: "NOT_ELIGIBLE",
        noShowCount: 0,
        attempts: 0,
        retakeAvailableFrom: null,
        badgeStatus: "none",
        badgeAwardedAt: null,
        nullifiedReason: null,
        password: hashPassword(clean.password),
      };
      db.students.push(student);
      audit(db, "ops@niat.edu.in", "CREATE_USER", `Admin created student login ${student.name} (${student.email}, ${track.name}).`);
      return { id: student.id, role: "student" };
    }

    const staff: Staff = {
      id: clean.role === "admin" ? uid("ops") : uid("iv"),
      name: clean.name,
      email: clean.email,
      role: clean.role === "admin" ? "admin" : "interviewer",
      password: hashPassword(clean.password),
    };
    db.staff.push(staff);
    audit(db, "ops@niat.edu.in", "CREATE_USER", `Admin created ${staff.role} login ${staff.name} (${staff.email}).`);
    return { id: staff.id, role: staff.role };
  });

  if ("error" in result && result.error) return res.status(400).json({ ok: false, error: result.error });
  res.json({ ok: true, data: result });
});

/** POST /api/admin/users/delete { id } — remove a login, with safety guards. */
admin.post("/users/delete", requireAdmin, (req, res) => {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ ok: false, error: "User id is required." });

  const result = withDb((db) => {
    const student = db.students.find((s) => s.id === id);
    if (student) {
      const active = db.interviews.find((iv) => iv.studentId === id && iv.status === "booked");
      if (active) return { error: `${student.name} has an active booked interview — cancel it before deleting the account.` };
      // cascade the student's own history so nothing references a ghost account
      const ivIds = db.interviews.filter((iv) => iv.studentId === id).map((iv) => iv.id);
      db.outcomes = db.outcomes.filter((o) => !ivIds.includes(o.interviewId));
      db.interviews = db.interviews.filter((iv) => iv.studentId !== id);
      db.malpracticeFlags = db.malpracticeFlags.filter((f) => f.studentId !== id);
      db.students = db.students.filter((s) => s.id !== id);
      audit(db, "ops@niat.edu.in", "DELETE_USER", `Admin deleted student account ${student.name} (${student.email}) and their interview history.`);
      return { deleted: student.name };
    }

    const staff = db.staff.find((s) => s.id === id);
    if (staff) {
      if (staff.role === "admin") return { error: "The ops desk account cannot be deleted (it administers this console)." };
      const loaded = db.slots.filter((sl) => sl.interviewerId === id);
      const activeBooking = loaded.some((sl) => sl.bookedCount > 0);
      if (activeBooking) {
        return { error: `${staff.name} has slots with active bookings — have students reschedule or cancel them first.` };
      }
      const slotIds = loaded.map((sl) => sl.id);
      const ivIds = db.interviews.filter((iv) => slotIds.includes(iv.slotId)).map((iv) => iv.id);
      db.outcomes = db.outcomes.filter((o) => !ivIds.includes(o.interviewId));
      db.interviews = db.interviews.filter((iv) => !slotIds.includes(iv.slotId));
      db.slots = db.slots.filter((sl) => sl.interviewerId !== id);
      db.staff = db.staff.filter((s) => s.id !== id);
      audit(db, "ops@niat.edu.in", "DELETE_USER", `Admin deleted ${staff.role} account ${staff.name} (${staff.email}) with ${slotIds.length} slot(s).`);
      return { deleted: staff.name };
    }

    return { error: "User not found." };
  });

  if ("error" in result && result.error) return res.status(400).json({ ok: false, error: result.error });
  res.json({ ok: true, data: result });
});
