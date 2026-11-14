// Booking routes — the student's core action, all guards enforced server-side.
import { Router } from "express";
import { withDb } from "../db.js";
import { bookingCheck } from "../state.js";
import { requireStudent } from "../auth.js";
import { uid, audit } from "../util.js";
import type { Slot } from "../types.js";

export const booking = Router();

// POST /api/book { studentId, slotId }   [student session]
booking.post("/book", requireStudent, (req, res) => {
  const { studentId, slotId } = req.body ?? {};
  if (!studentId || !slotId) return res.status(400).json({ ok: false, error: "studentId and slotId are required." });

  const result = withDb((db) => {
    const student = db.students.find((s) => s.id === studentId);
    if (!student) return { error: "Student not found." };
    const slot = db.slots.find((s) => s.id === slotId) as Slot | undefined;
    if (!slot) return { error: "Slot not found." };

    const check = bookingCheck(db, student, slot);
    if (!check.ok) return { error: check.reason };

    const interviewId = uid("i");
    const track = db.tracks.find((t) => t.id === student.trackId)!;
    db.interviews.push({
      id: interviewId,
      studentId: student.id,
      slotId: slot.id,
      trackId: student.trackId,
      status: "booked",
      bookedAt: new Date().toISOString(),
      // No link yet — the interviewer must accept the request; then a video
      // room is auto-generated and delivered to the student.
      meetingLink: null,
    });
    slot.bookedCount += 1;
    student.interviewState = "BOOKED";
    student.attempts += 1;

    const interviewer = db.staff.find((s) => s.id === slot.interviewerId)!;
    audit(db, student.name, "BOOK", `${student.name} booked ${track.badgeName} interview on ${slot.date} ${slot.startTime}–${slot.endTime} with ${interviewer.name}. Awaiting interviewer confirmation.`);
    return { interviewId, interviewerName: interviewer.name, awaitingConfirmation: true };
  });

  if ("error" in result && result.error) return res.status(400).json({ ok: false, error: result.error });
  res.json({ ok: true, data: result });
});
