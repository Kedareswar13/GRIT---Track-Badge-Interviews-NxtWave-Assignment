// Auth + snapshot + dataset routes.
import { Router } from "express";
import { getDb, resetDb } from "../db.js";
import { effectiveState } from "../state.js";
import { login, readSession } from "../auth.js";
import { uid } from "../util.js";
import type { Outcome, Slot } from "../types.js";

export const general = Router();

// POST /api/auth/login { email, password, expects?: "student" | "staff" }
// `expects` guards the entrance: a student email at the staff entrance (or vice
// versa) gets a clear "wrong door" error instead of a broken cross-role session.
general.post("/auth/login", (req, res) => {
  const email = String(req.body?.email ?? "");
  const password = String(req.body?.password ?? "");
  const expects = req.body?.expects as "student" | "staff" | undefined;
  if (!email.includes("@")) return res.status(400).json({ ok: false, error: "Enter a valid NIAT email." });
  if (!password) return res.status(400).json({ ok: false, error: "Enter your password." });
  const result = login(email, password);
  if (!result) {
    return res.status(401).json({ ok: false, error: "No GRIT account found for this email. Use your NIAT email." });
  }
  if (result === "badPassword") {
    return res.status(401).json({ ok: false, error: "Incorrect password. Try again or ask the ops desk to reset it." });
  }
  if (expects && result.user.role !== expects) {
    return res.status(403).json({
      ok: false,
      error: expects === "staff"
        ? "This is the staff entrance. Student accounts log in from the student site."
        : "This is the student entrance. Staff log in from the ops site.",
      wrongDoor: true,
      actualRole: result.user.role,
    });
  }
  res.json({ ok: true, data: result });
});

// GET /api/auth/me — validate a session token
general.get("/auth/me", (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ ok: false, error: "Session expired. Please log in again." });
  res.json({ ok: true, data: session });
});

// GET /api/snapshot — one read endpoint for every screen
general.get("/snapshot", (_req, res) => {
  const db = getDb();
  const staffName = (id: string) => db.staff.find((s) => s.id === id)?.name ?? "—";

  const slots = db.slots
    .map((s) => ({ ...s, interviewerName: staffName(s.interviewerId) }))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  const interviews = db.interviews
    .map((iv) => {
      const slot = db.slots.find((s) => s.id === iv.slotId) as Slot | undefined;
      const outcome = db.outcomes.find((o) => o.interviewId === iv.id) as Outcome | undefined;
      const student = db.students.find((st) => st.id === iv.studentId);
      return {
        ...iv,
        studentName: student?.name ?? "—",
        date: slot?.date ?? "—",
        startTime: slot?.startTime ?? "—",
        endTime: slot?.endTime ?? "—",
        interviewerName: slot ? staffName(slot.interviewerId) : "—",
        outcome: outcome ?? null,
      };
    })
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  const students = db.students.map((st) => {
    const track = db.tracks.find((t) => t.id === st.trackId)!;
    const eff = effectiveState(db, st);
    const activeInterview = interviews.find((iv) => iv.studentId === st.id && iv.status === "booked") ?? null;
    const latestOutcome =
      db.outcomes
        .filter((o) => db.interviews.some((iv) => iv.id === o.interviewId && iv.studentId === st.id))
        .slice(-1)[0] ?? null;
    return {
      ...st,
      password: undefined, // never ship hashes to the browser
      trackName: track.name,
      badgeName: track.badgeName,
      effectiveState: eff.state,
      stateNote: eff.note,
      activeInterview,
      latestOutcome,
      flagged: db.malpracticeFlags.some((f) => f.studentId === st.id),
    };
  });

  res.json({
    ok: true,
    data: {
      tracks: db.tracks,
      // staff with hashes stripped — the browser only needs id/name/role
      staff: db.staff.map((s) => ({ id: s.id, name: s.name, email: s.email, role: s.role })),
      students,
      slots,
      interviews,
      outcomes: db.outcomes,
      flags: db.malpracticeFlags,
      transcripts: db.transcripts ?? [],
      log: [...db.log].slice(-50).reverse(),
      counters: {
        eligible: students.filter((s) => s.effectiveState === "ELIGIBLE").length,
        booked: students.filter((s) => s.effectiveState === "BOOKED").length,
        passed: students.filter((s) => s.effectiveState === "PASSED").length,
        retakeDue: students.filter((s) => s.effectiveState === "RETAKE_DUE").length,
        noShow: students.filter((s) => s.effectiveState === "NO_SHOW").length,
        nullified: students.filter((s) => s.effectiveState === "BADGE_NULLIFIED").length,
        notEligible: students.filter((s) => s.effectiveState === "NOT_ELIGIBLE").length,
      },
    },
  });
});

// POST /api/reset — reload the golden dataset
general.post("/reset", (_req, res) => {
  const db = resetDb();
  db.log.push({ id: uid("lg"), at: new Date().toISOString(), actor: "system", action: "RESET", detail: "Golden dataset reloaded." });
  res.json({ ok: true, data: { reset: true, students: db.students.length, slots: db.slots.length } });
});
