// Outcome routes — pass | fail | retake, with policy cooldowns.
import { Router } from "express";
import { withDb } from "../db.js";
import { addDays, todayStr } from "../state.js";
import { requireStaff } from "../auth.js";
import { uid, audit } from "../util.js";
export const outcomes = Router();
const VALID = ["pass", "fail", "retake"];
// POST /api/outcomes { interviewId, result, feedback, recordedBy, aiAssisted }   [staff]
outcomes.post("/", requireStaff, (req, res) => {
    const body = req.body ?? {};
    if (!body.interviewId || !body.result || !VALID.includes(body.result)) {
        return res.status(400).json({ ok: false, error: 'interviewId and result ("pass" | "fail" | "retake") are required.' });
    }
    const feedback = String(body.feedback ?? "").trim();
    if (feedback.length < 10) {
        return res.status(400).json({ ok: false, error: "Please record at least a brief note (10+ characters) — students rely on this." });
    }
    const result = withDb((db) => {
        const interview = db.interviews.find((i) => i.id === body.interviewId);
        if (!interview)
            return { error: "Interview not found." };
        if (interview.status !== "booked")
            return { error: `Interview is already ${interview.status}.` };
        const student = db.students.find((s) => s.id === interview.studentId);
        const slot = db.slots.find((s) => s.id === interview.slotId);
        const track = db.tracks.find((t) => t.id === interview.trackId);
        db.outcomes.push({
            id: uid("o"),
            interviewId: interview.id,
            result: body.result,
            feedback,
            aiAssisted: Boolean(body.aiAssisted),
            recordedBy: body.recordedBy ?? "Interviewer",
            recordedAt: new Date().toISOString(),
        });
        interview.status = "completed";
        student.interviewState = body.result === "pass" ? "PASSED" : "RETAKE_DUE";
        if (body.result === "pass") {
            student.badgeStatus = "active";
            student.badgeAwardedAt = todayStr();
            audit(db, body.recordedBy ?? "interviewer", "OUTCOME_PASS", `${student.name} passed the ${track.badgeName} interview — badge awarded.`);
        }
        else {
            const cooldownDays = body.result === "fail" ? 7 : 2;
            student.retakeAvailableFrom = addDays(todayStr(), cooldownDays);
            audit(db, body.recordedBy ?? "interviewer", `OUTCOME_${body.result.toUpperCase()}`, `${student.name} — ${body.result}. Rebooking opens ${student.retakeAvailableFrom} (+${cooldownDays}d cooldown).`);
        }
        return { studentState: student.interviewState, retakeAvailableFrom: student.retakeAvailableFrom };
    });
    if ("error" in result && result.error)
        return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true, data: result });
});
