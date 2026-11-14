// Badge integrity — nullify on confirmed malpractice (retroactive, admin-only).
import { Router } from "express";
import { withDb } from "../db.js";
import { todayStr } from "../state.js";
import { requireAdmin } from "../auth.js";
import { uid, audit } from "../util.js";
export const badges = Router();
// POST /api/badges/nullify { studentId, reason, flaggedBy }   [admin]
badges.post("/nullify", requireAdmin, (req, res) => {
    const body = req.body ?? {};
    if (!body.studentId || !body.reason || String(body.reason).trim().length < 5) {
        return res.status(400).json({ ok: false, error: "studentId and a reason (5+ characters) are required." });
    }
    const result = withDb((db) => {
        const student = db.students.find((s) => s.id === body.studentId);
        if (!student)
            return { error: "Student not found." };
        if (student.badgeStatus === "nullified")
            return { error: "Badge is already nullified." };
        if (student.badgeStatus !== "active")
            return { error: "Student has not earned a badge yet." };
        db.malpracticeFlags.push({
            id: uid("mf"),
            studentId: student.id,
            reason: String(body.reason).trim(),
            flaggedBy: String(body.flaggedBy ?? "").trim() || "Interview Team",
            flaggedAt: todayStr(),
        });
        student.badgeStatus = "nullified";
        student.nullifiedReason = String(body.reason).trim();
        audit(db, String(body.flaggedBy ?? "").trim() || "admin", "BADGE_NULLIFIED", `${student.name}'s badge nullified: ${String(body.reason).trim()}`);
        return { nullified: true };
    });
    if ("error" in result && result.error)
        return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true, data: result });
});
