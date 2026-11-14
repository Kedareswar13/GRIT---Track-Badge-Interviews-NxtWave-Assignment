// Interview routes — cancellation, no-show, interviewer acceptance (link
// issuance), and rescheduling.
import { Router } from "express";
import { withDb } from "../db.js";
import { addDays, todayStr } from "../state.js";
import { readSession } from "../auth.js";
import { audit } from "../util.js";
export const interviews = Router();
/** Free video room code — Jitsi Meet needs no API key and rooms open for
 *  anyone with the link. Production swap: Google Calendar API (real
 *  meet.google.com links) behind the same route. */
function videoRoom(interviewId) {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const pick = (n) => Array.from({ length: n }, () => letters[Math.floor(Math.random() * 26)]).join("");
    return `https://meet.jit.si/grit-${interviewId.slice(-4)}-${pick(3)}-${pick(4)}-${pick(3)}`;
}
// POST /api/interviews { action, interviewId, ... }
//   cancel     — any authenticated session
//   no_show    — staff only
//   accept     — staff only: accepts the booking request, mints the video link
//   reschedule — any authenticated session: move a booked interview to a new slot
interviews.post("/", (req, res) => {
    const { action, interviewId, actor } = req.body ?? {};
    const session = readSession(req);
    if (!session) {
        return res.status(403).json({ ok: false, error: "Login required for this action." });
    }
    const staffOnly = action === "no_show" || action === "accept";
    if (staffOnly && session.role !== "staff") {
        return res.status(403).json({ ok: false, error: "Staff role required for this action." });
    }
    if (!interviewId || !["cancel", "no_show", "accept", "reschedule"].includes(action)) {
        return res.status(400).json({ ok: false, error: 'interviewId and a valid action ("cancel" | "no_show" | "accept" | "reschedule") are required.' });
    }
    const result = withDb((db) => {
        const interview = db.interviews.find((i) => i.id === interviewId);
        if (!interview)
            return { error: "Interview not found." };
        const student = db.students.find((s) => s.id === interview.studentId);
        const slot = db.slots.find((s) => s.id === interview.slotId);
        if (action === "cancel") {
            if (interview.status !== "booked")
                return { error: `Interview is already ${interview.status}.` };
            interview.status = "cancelled";
            slot.bookedCount = Math.max(0, slot.bookedCount - 1);
            student.interviewState = "ELIGIBLE";
            student.attempts = Math.max(0, student.attempts - 1);
            audit(db, actor ?? "student", "BOOKING_CANCEL", `${student.name} cancelled ${slot.date} ${slot.startTime}–${slot.endTime}; slot reopened.`);
            return { status: "cancelled" };
        }
        if (action === "no_show") {
            if (interview.status !== "booked")
                return { error: `Interview is already ${interview.status}.` };
            interview.status = "no_show";
            student.noShowCount += 1;
            student.interviewState = "NO_SHOW";
            if (student.noShowCount >= 2) {
                student.retakeAvailableFrom = addDays(todayStr(), 14);
                audit(db, actor ?? "interview-team", "NO_SHOW", `${student.name} marked no-show (#${student.noShowCount}). Rebooking locked until ${student.retakeAvailableFrom}.`);
            }
            else {
                audit(db, actor ?? "interview-team", "NO_SHOW", `${student.name} marked no-show (#${student.noShowCount}). May rebook immediately.`);
            }
            return { status: "no_show" };
        }
        if (action === "accept") {
            if (interview.status !== "booked")
                return { error: `Interview is already ${interview.status}.` };
            if (interview.meetingLink)
                return { error: "Interview already accepted — the link was sent." };
            interview.meetingLink = videoRoom(interview.id);
            audit(db, actor ?? session.name ?? "interview-team", "LINK_ISSUED", `${student.name}'s interview accepted. Video room issued: ${interview.meetingLink}`);
            return { status: "accepted", meetingLink: interview.meetingLink };
        }
        // reschedule — move the booking to a different open future slot
        const { newSlotId } = req.body ?? {};
        if (interview.status !== "booked")
            return { error: `Interview is already ${interview.status}.` };
        const newSlot = db.slots.find((s) => s.id === newSlotId);
        if (!newSlot)
            return { error: "New slot not found." };
        if (newSlot.id === interview.slotId)
            return { error: "Pick a different slot to move to." };
        if (newSlot.status !== "open")
            return { error: "That slot is no longer available." };
        if (newSlot.bookedCount >= newSlot.capacity)
            return { error: "That slot is full." };
        if (`${newSlot.date}${newSlot.startTime}` < `${todayStr()}00:00`) {
            return { error: "Pick a slot in the future." };
        }
        slot.bookedCount = Math.max(0, slot.bookedCount - 1);
        newSlot.bookedCount += 1;
        interview.slotId = newSlot.id;
        interview.meetingLink = null; // re-acceptance required for the new time
        audit(db, actor ?? student.name, "RESCHEDULE", `${student.name} moved their interview to ${newSlot.date} ${newSlot.startTime}–${newSlot.endTime} (${slot.date} ${slot.startTime} released).`);
        return { status: "rescheduled", newSlotId: newSlot.id };
    });
    if ("error" in result && result.error)
        return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true, data: result });
});
