// AI routes — Ollama local-only. Feedback assist (staff) + nudge assist (staff).
import { Router } from "express";
import { ollamaGenerate, extractJson, AiUnavailableError } from "../ollama.js";
import { requireStaff } from "../auth.js";
import { getDb } from "../db.js";
import { effectiveState } from "../state.js";
import type { AiFeedback } from "../types.js";

export const ai = Router();

const FEEDBACK_SYSTEM = `You are an assistant for interviewers at GRIT, a skilling competition at NIAT.
Interviewers conduct live online badge interviews and write rough notes during the call.
Your job: turn the interviewer's raw notes into clean, structured feedback for the student record.
Rules:
- Be concise, factual, and kind. No praise-fluff, no harshness.
- Only use information present in the notes; never invent facts.
- Respond with ONLY a JSON object, no markdown, in exactly this shape:
{"summary": "<2-3 sentence summary of performance>",
 "recommendation": "<pass|fail|retake|unknown>",
 "strengths": ["<strength 1>", "..."],
 "concerns": ["<concern 1>", "..."],
 "suggestedFeedback": "<2-3 sentences of feedback written TO the student, encouraging but honest>"}`;

const NUDGE_SYSTEM = `You write short reminder messages for GRIT (a skilling competition by NIAT).
Context: an eligible student has not yet booked their live interview for their Track Badge.
Write ONE warm, short message (max 45 words) from the GRIT team:
- Address the student by first name.
- Remind them to book their interview slot from their dashboard.
- Mention one thing they cleared or their badge name for a personal touch.
- Friendly, zero guilt-tripping, at most one 🎯 or 👍.
- End with a clear call to action.
Output ONLY the message text — no quotes, no preamble.`;

// POST /api/ai/feedback { notes }   [staff] — advisory only, human decides.
ai.post("/feedback", requireStaff, async (req, res) => {
  const notes = String(req.body?.notes ?? "").trim();
  if (notes.length < 20) {
    return res.status(400).json({ ok: false, error: "Paste at least a few lines of interview notes (20+ characters)." });
  }
  try {
    const raw = await ollamaGenerate(FEEDBACK_SYSTEM, `Interview notes:\n"""${notes}"""`);
    const parsed = extractJson<Partial<AiFeedback>>(raw);
    const feedback: AiFeedback = {
      summary: String(parsed.summary ?? "").slice(0, 600),
      recommendation: (["pass", "fail", "retake", "unknown"].includes(String(parsed.recommendation))
        ? (parsed.recommendation as AiFeedback["recommendation"])
        : "unknown"),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5).map(String) : [],
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 5).map(String) : [],
      suggestedFeedback: parsed.suggestedFeedback ? String(parsed.suggestedFeedback).slice(0, 800) : undefined,
    };
    res.json({ ok: true, data: { feedback, raw } });
  } catch (err) {
    const status = err instanceof AiUnavailableError ? 503 : 500;
    res.status(status).json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/ai/nudge { studentId }   [staff]
ai.post("/nudge", requireStaff, async (req, res) => {
  const db = getDb();
  const student = db.students.find((s) => s.id === req.body?.studentId);
  if (!student) return res.status(400).json({ ok: false, error: "Student not found." });
  const eff = effectiveState(db, student);
  if (eff.state !== "ELIGIBLE") {
    return res.status(400).json({ ok: false, error: "Only ELIGIBLE students who haven't booked should be nudged." });
  }
  const track = db.tracks.find((t) => t.id === student.trackId)!;
  const prompt = `Student first name: ${student.name.split(" ")[0]}
Track: ${track.name}
Badge: ${track.badgeName}
Skills cleared: ${student.skillsCleared.join(", ")}
Current state: ${eff.state} — ${eff.note}`;

  try {
    let message = await ollamaGenerate(NUDGE_SYSTEM, prompt);
    // Small local models sometimes emit a stray partial token at the end.
    const lastStop = Math.max(message.lastIndexOf("."), message.lastIndexOf("!"), message.lastIndexOf("?"));
    if (lastStop > 20) message = message.slice(0, lastStop + 1);
    message = message.replace(/[\p{So}\p{Cs}]+$/u, "").trim();
    res.json({ ok: true, data: { message: message.replace(/^["']|["']$/g, "").slice(0, 400) } });
  } catch (err) {
    const status = err instanceof AiUnavailableError ? 503 : 500;
    res.status(status).json({ ok: false, error: (err as Error).message });
  }
});
