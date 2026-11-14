// Slot routes — interviewer availability publish/withdraw with cascade release.
import { Router } from "express";
import { withDb } from "../db.js";
import { requireStaff } from "../auth.js";
import { uid, audit } from "../util.js";

export const slots = Router();

// POST /api/slots { interviewerId, date, startTime, endTime, capacity }   [staff]
slots.post("/", requireStaff, (req, res) => {
  const body = req.body ?? {};
  if (!body.interviewerId || !body.date || !body.startTime || !body.endTime) {
    return res.status(400).json({ ok: false, error: "interviewerId, date, startTime and endTime are required." });
  }
  const capacity = Math.max(1, Number(body.capacity ?? 1));
  if (body.endTime <= body.startTime) {
    return res.status(400).json({ ok: false, error: "End time must be after start time." });
  }
  const { interviewerId, date, startTime, endTime } = body;

  const result = withDb((db) => {
    if (!db.staff.some((s) => s.id === interviewerId)) return { error: "Interviewer not found." };
    const overlap = db.slots.find(
      (s) => s.interviewerId === interviewerId && s.status === "open" && s.date === date &&
             s.startTime < endTime && startTime < s.endTime
    );
    if (overlap) return { error: `You already have a slot ${overlap.startTime}–${overlap.endTime} that day.` };

    const id = uid("sl");
    db.slots.push({ id, interviewerId, date, startTime, endTime, capacity, bookedCount: 0, status: "open" });
    const staff = db.staff.find((s) => s.id === interviewerId)!;
    audit(db, staff.name, "SLOT_CREATE", `Published ${date} ${startTime}–${endTime} (capacity ${capacity}).`);
    return { slotId: id };
  });

  if ("error" in result && result.error) return res.status(400).json({ ok: false, error: result.error });
  res.json({ ok: true, data: result });
});

// POST /api/slots/cancel { slotId }   [staff] — releases booked students to rebook
slots.post("/cancel", requireStaff, (req, res) => {
  const { slotId, actor } = req.body ?? {};
  if (!slotId) return res.status(400).json({ ok: false, error: "slotId is required." });

  const result = withDb((db) => {
    const slot = db.slots.find((s) => s.id === slotId);
    if (!slot) return { error: "Slot not found." };
    if (slot.status === "cancelled") return { error: "Slot is already cancelled." };

    const affected = db.interviews.filter((iv) => iv.slotId === slot.id && iv.status === "booked");
    for (const iv of affected) {
      iv.status = "cancelled";
      const student = db.students.find((s) => s.id === iv.studentId);
      if (student && student.interviewState === "BOOKED") {
        student.interviewState = "ELIGIBLE";
        student.attempts = Math.max(0, student.attempts - 1);
      }
    }
    slot.status = "cancelled";
    slot.bookedCount = 0;

    const staff = db.staff.find((s) => s.id === slot.interviewerId)!;
    audit(db, actor ?? staff.name, "SLOT_CANCEL",
      `Cancelled ${slot.date} ${slot.startTime}–${slot.endTime}. ${affected.length} student(s) released to rebook: ${affected.map((i) => db.students.find((s) => s.id === i.studentId)?.name).join(", ") || "none"}.`);
    return { released: affected.length };
  });

  if ("error" in result && result.error) return res.status(400).json({ ok: false, error: result.error });
  res.json({ ok: true, data: result });
});
