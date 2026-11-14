#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// EVAL PIPELINE — automated feature verification against the GOLDEN DATASET.
// Run after every build:  npm run eval        (from repo root)
//                         npm run eval:no-ai  (skip Ollama scenarios)
// Exit code 0 = all green. Designed to be wired into a pre-merge/pre-deploy
// check or a build hook. Zero dependencies — plain Node ≥ 18 fetch.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.GRIT_API_URL ?? "http://localhost:4000/api";
const SKIP_AI = process.argv.includes("--no-ai");
const today = new Date();
const iso = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const TODAY = iso(today);
const TOMORROW = iso(new Date(Date.now() + 86400000));

// ─── Tiny harness ────────────────────────────────────────────────────────────
const results = [];
let ctx = {}; // shared capture between steps (tokens, ids)

async function call(method, path, { body, session } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (session) headers["x-grit-session"] = session;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

async function snapshot() {
  const r = await call("GET", "/snapshot");
  if (!r.json?.ok) throw new Error("snapshot failed");
  return r.json.data;
}

const studentTok = (id) => ctx.tokens[id];
const staffTok = (id = "iv1") => ctx.tokens[id];

// Golden-dataset email registry — lets any scenario obtain a student session.
const STUDENT_EMAILS = {
  s01: "aarav.s@niat.edu.in", s02: "diya.p@niat.edu.in", s04: "ishita.r@niat.edu.in",
  s06: "ananya.i@niat.edu.in", s07: "vihaan.g@niat.edu.in", s10: "saanvi.k@niat.edu.in",
  s11: "arjun.r@niat.edu.in", s14: "tara.j@niat.edu.in",
};
async function ensureStudentToken(id) {
  if (!ctx.tokens) ctx.tokens = {};
  if (!ctx.tokens[id]) {
    const r = await call("POST", "/auth/login", { body: { email: STUDENT_EMAILS[id] } });
    if (!r.json?.ok) throw new Error(`login for ${id} failed: ${r.json?.error}`);
    ctx.tokens[id] = r.json.data.token;
  }
  return ctx.tokens[id];
}

function scenario(name, fn) {
  results.push({ name, fn });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ─── Scenario definitions ────────────────────────────────────────────────────

scenario("S00 · health check — backend is up", async () => {
  const r = await call("GET", "/health");
  assert(r.json?.ok === true, `health returned ${r.status}`);
});

scenario("S01 · reset — golden dataset loads (14 students, 14 slots)", async () => {
  const r = await call("POST", "/reset");
  assert(r.json?.ok === true, "reset failed");
  assert(r.json.data.students === 14 && r.json.data.slots === 14, `seed counts wrong: ${JSON.stringify(r.json.data)}`);
  const snap = await snapshot();
  assert(snap.counters.eligible === 4, `expected 4 eligible in golden, got ${snap.counters.eligible}`);
  assert(snap.counters.booked === 3, `expected 3 booked in golden, got ${snap.counters.booked}`);
  assert(snap.counters.passed === 2 && snap.counters.nullified === 1, "passed/nullified counts wrong");
});

scenario("S02 · login — student email issues student session", async () => {
  const r = await call("POST", "/auth/login", { body: { email: "aarav.s@niat.edu.in" } });
  assert(r.json?.ok === true && r.json.data.user.role === "student", "student login failed");
  ctx.tokens ??= {};
  ctx.tokens.s01 = r.json.data.token;
});

scenario("S03 · login — staff email issues staff session", async () => {
  const r = await call("POST", "/auth/login", { body: { email: "kavya.rao@niat.edu.in" } });
  assert(r.json?.ok === true && r.json.data.user.role === "staff", "staff login failed");
  ctx.tokens.iv1 = r.json.data.token;
});

scenario("S04 · login — admin email issues admin session", async () => {
  const r = await call("POST", "/auth/login", { body: { email: "ops@niat.edu.in" } });
  assert(r.json?.ok === true && r.json.data.user.staffRole === "admin", "admin login failed");
  ctx.tokens.ops1 = r.json.data.token;
});

scenario("S05 · login — unknown email rejected (401)", async () => {
  const r = await call("POST", "/auth/login", { body: { email: "stranger@gmail.com" } });
  assert(r.status === 401 && r.json?.ok === false, "unknown email not rejected");
});

scenario("S06 · booking — eligible student books a future slot", async () => {
  const r = await call("POST", "/book", { body: { studentId: "s01", slotId: "sl07" }, session: studentTok("s01") });
  assert(r.json?.ok === true, `booking failed: ${r.json?.error}`);
  ctx.bookingId = r.json.data.interviewId;
  const snap = await snapshot();
  const s01 = snap.students.find((s) => s.id === "s01");
  assert(s01.effectiveState === "BOOKED", `s01 state after booking = ${s01.effectiveState}`);
  assert(s01.activeInterview.date === TOMORROW, `s01 interview date = ${s01.activeInterview.date}`);
});

scenario("S07 · guard — double-booking is blocked", async () => {
  const r = await call("POST", "/book", { body: { studentId: "s01", slotId: "sl08" }, session: studentTok("s01") });
  assert(r.status === 400 && /already have an interview|booked/.test(r.json?.error ?? ""), `got: ${JSON.stringify(r.json)}`);
});

scenario("S08 · guard — booking requires a student session (staff denied)", async () => {
  const r = await call("POST", "/book", { body: { studentId: "s02", slotId: "sl08" }, session: staffTok() });
  assert(r.status === 403, "staff could book — role gate missing!");
});

scenario("S09 · guard — capacity-full slot is blocked", async () => {
  const r = await call("POST", "/book", { body: { studentId: "s11", slotId: "sl06" }, session: await ensureStudentToken("s11") });
  assert(r.status === 400 && /full/.test(r.json?.error ?? ""), `got: ${JSON.stringify(r.json)}`);
});

scenario("S10 · guard — NOT_ELIGIBLE student cannot book", async () => {
  const r = await call("POST", "/book", { body: { studentId: "s10", slotId: "sl08" }, session: await ensureStudentToken("s10") });
  assert(r.status === 400 && /not bookable/.test(r.json?.error ?? ""), `got: ${JSON.stringify(r.json)}`);
});

scenario("S11 · guard — RETAKE_DUE cooldown blocks rebooking", async () => {
  const r = await call("POST", "/book", { body: { studentId: "s06", slotId: "sl08" }, session: await ensureStudentToken("s06") });
  assert(r.status === 400 && /retake due/.test(r.json?.error ?? ""), `got: ${JSON.stringify(r.json)}`);
});

scenario("S12 · guard — 2× no-show lock blocks rebooking", async () => {
  const r = await call("POST", "/book", { body: { studentId: "s14", slotId: "sl08" }, session: await ensureStudentToken("s14") });
  assert(r.status === 400 && /locked/.test(r.json?.error ?? ""), `got: ${JSON.stringify(r.json)}`);
});

scenario("S13 · journey — 1× no-show student CAN rebook (policy)", async () => {
  const r = await call("POST", "/book", { body: { studentId: "s07", slotId: "sl08" }, session: await ensureStudentToken("s07") });
  assert(r.json?.ok === true, `no-show x1 should rebook: ${r.json?.error}`);
  ctx.s07BookingId = r.json.data.interviewId;
  const snap = await snapshot();
  assert(snap.students.find((s) => s.id === "s07").effectiveState === "BOOKED", "s07 not BOOKED after rebook");
});

scenario("S14 · slots — staff publishes an availability block", async () => {
  const r = await call("POST", "/slots", {
    body: { interviewerId: "iv2", date: TOMORROW, startTime: "18:00", endTime: "18:30", capacity: 1 },
    session: staffTok(),
  });
  assert(r.json?.ok === true, `slot create failed: ${r.json?.error}`);
  ctx.newSlotId = r.json.data.slotId;
});

scenario("S15 · slots — overlapping availability is blocked", async () => {
  const r = await call("POST", "/slots", {
    body: { interviewerId: "iv2", date: TOMORROW, startTime: "18:15", endTime: "18:45", capacity: 1 },
    session: staffTok(),
  });
  assert(r.status === 400 && /already have a slot/.test(r.json?.error ?? ""), `got: ${JSON.stringify(r.json)}`);
});

scenario("S16 · slots — capacity guard (3 booked into capacity-1)", async () => {
  const r = await call("POST", "/book", { body: { studentId: "s02", slotId: ctx.newSlotId }, session: await ensureStudentToken("s02") });
  assert(r.json?.ok === true, `s02 booking failed: ${r.json?.error}`);
  const r2 = await call("POST", "/book", { body: { studentId: "s11", slotId: ctx.newSlotId }, session: await ensureStudentToken("s11") });
  assert(r2.status === 400 && /full/.test(r2.json?.error ?? ""), `capacity overflow allowed: ${JSON.stringify(r2.json)}`);
});

scenario("S17 · outcome — pass awards an active badge", async () => {
  const r = await call("POST", "/outcomes", {
    body: { interviewId: ctx.bookingId, result: "pass", feedback: "Strong React fundamentals, clean live coding.", recordedBy: "Ms. Kavya Rao" },
    session: staffTok(),
  });
  assert(r.json?.ok === true && r.json.data.studentState === "PASSED", `outcome failed: ${JSON.stringify(r.json)}`);
  const snap = await snapshot();
  const s01 = snap.students.find((s) => s.id === "s01");
  assert(s01.effectiveState === "PASSED" && s01.badgeStatus === "active", "badge not active after pass");
});

scenario("S18 · outcome — fail applies a 7-day rebooking cooldown", async () => {
  const r = await call("POST", "/outcomes", {
    body: { interviewId: "i01", result: "fail", feedback: "Struggled with async patterns; schema unnormalised.", recordedBy: "Ms. Kavya Rao" },
    session: staffTok(),
  });
  assert(r.json?.ok === true && r.json.data.studentState === "RETAKE_DUE", `outcome failed: ${JSON.stringify(r.json)}`);
  const expected = iso(new Date(Date.now() + 7 * 86400000));
  assert(r.json.data.retakeAvailableFrom === expected, `cooldown ${r.json.data.retakeAvailableFrom} ≠ +7d ${expected}`);
});

scenario("S19 · outcome — feedback below 10 chars is rejected", async () => {
  const r = await call("POST", "/outcomes", {
    body: { interviewId: "i03", result: "pass", feedback: "ok", recordedBy: "x" },
    session: staffTok(),
  });
  assert(r.status === 400 && /brief note/.test(r.json?.error ?? ""), `got: ${JSON.stringify(r.json)}`);
});

scenario("S20 · no-show — 2nd no-show triggers the 14-day lock", async () => {
  // s07 rebooked in S13 with 1 prior no-show → this one makes it 2 → locked.
  const r = await call("POST", "/interviews", { body: { action: "no_show", interviewId: ctx.s07BookingId, actor: "Ms. Fatima Sheikh" }, session: staffTok() });
  assert(r.json?.ok === true, `no-show failed: ${JSON.stringify(r.json)}`);
  const snap = await snapshot();
  const s07 = snap.students.find((s) => s.id === "s07");
  assert(s07.effectiveState === "NO_SHOW", `s07 state = ${s07.effectiveState}`);
  const expected = iso(new Date(Date.now() + 14 * 86400000));
  assert(s07.retakeAvailableFrom === expected, `lock date ${s07.retakeAvailableFrom} ≠ +14d ${expected}`);
});

scenario("S21 · no-show — staff-only action (student denied)", async () => {
  const r = await call("POST", "/interviews", { body: { action: "no_show", interviewId: "i02" }, session: await ensureStudentToken("s04") });
  assert(r.status === 403, "student could mark no-show — role gate missing!");
});

scenario("S22 · cancel — student cancels, slot reopens", async () => {
  const r = await call("POST", "/interviews", { body: { action: "cancel", interviewId: "i02", actor: "student" }, session: await ensureStudentToken("s04") });
  assert(r.json?.ok === true, `cancel failed: ${JSON.stringify(r.json)}`);
  const snap = await snapshot();
  assert(snap.students.find((s) => s.id === "s04").effectiveState === "ELIGIBLE", "s04 not ELIGIBLE after cancel");
  const slot = snap.slots.find((s) => s.id === "sl06");
  assert(slot.bookedCount === 0, `slot not reopened: ${slot.bookedCount}`);
});

scenario("S23 · slot-cancel cascade — releasing booked students", async () => {
  const r = await call("POST", "/slots/cancel", { body: { slotId: "sl03", actor: "Ms. Kavya Rao" }, session: staffTok() });
  assert(r.json?.ok === true && r.json.data.released === 1, `cascade wrong: ${JSON.stringify(r.json)}`);
  const snap = await snapshot();
  assert(snap.students.find((s) => s.id === "s12").effectiveState === "ELIGIBLE", "s12 not released");
});

scenario("S24 · integrity — admin nullifies an active badge", async () => {
  const r = await call("POST", "/badges/nullify", {
    body: { studentId: "s13", reason: "Proctor flagged code plagiarism in SQL contest; review confirmed.", flaggedBy: "Academic Integrity Cell" },
    session: staffTok("ops1"),
  });
  assert(r.json?.ok === true, `nullify failed: ${JSON.stringify(r.json)}`);
  const snap = await snapshot();
  assert(snap.students.find((s) => s.id === "s13").effectiveState === "BADGE_NULLIFIED", "s13 not nullified");
});

scenario("S25 · integrity — interviewer (non-admin) cannot nullify", async () => {
  const r = await call("POST", "/badges/nullify", { body: { studentId: "s05", reason: "should not be allowed" }, session: staffTok() });
  assert(r.status === 403, "interviewer could nullify — admin gate missing!");
});

scenario("S26 · integrity — nullifying twice is rejected", async () => {
  const r = await call("POST", "/badges/nullify", { body: { studentId: "s13", reason: "again" }, session: staffTok("ops1") });
  assert(r.status === 400 && /already nullified/.test(r.json?.error ?? ""), `got: ${JSON.stringify(r.json)}`);
});

scenario("S27 · invariant — audit log records actor decisions", async () => {
  const snap = await snapshot();
  const actions = new Set(snap.log.map((l) => l.action));
  for (const a of ["BOOK", "SLOT_CREATE", "OUTCOME_PASS", "NO_SHOW", "BADGE_NULLIFIED", "RESET"]) {
    assert(actions.has(a), `audit log missing ${a}`);
  }
});

scenario("S28 · invariant — every student maps to a valid journey state", async () => {
  const snap = await snapshot();
  const valid = new Set(["NOT_ELIGIBLE", "ELIGIBLE", "BOOKED", "NO_SHOW", "RETAKE_DUE", "PASSED", "BADGE_NULLIFIED"]);
  for (const s of snap.students) assert(valid.has(s.effectiveState), `${s.name} → invalid state ${s.effectiveState}`);
});

scenario("S29 · invariant — counters sum to total students", async () => {
  const snap = await snapshot();
  const sum = Object.values(snap.counters).reduce((a, b) => a + b, 0);
  assert(sum === snap.students.length, `counters sum ${sum} ≠ ${snap.students.length}`);
});

scenario("S30 · AI — feedback assist returns structured JSON (Ollama)", async () => {
  if (SKIP_AI) { results.aiSkipped = true; return; }
  const r = await call("POST", "/ai/feedback", {
    body: { notes: "Explained component state well, lifted state correctly. Froze on REST error handling. Live-coded debounce with two hints. DB schema lacked foreign keys." },
    session: staffTok(),
  });
  if (r.status === 503) { results.aiSkipped = true; return; } // Ollama down — warn, not fail
  assert(r.json?.ok === true, `AI feedback failed: ${r.json?.error}`);
  const fb = r.json.data.feedback;
  assert(typeof fb.summary === "string" && fb.summary.length > 20, "AI summary missing");
  assert(["pass", "fail", "retake", "unknown"].includes(fb.recommendation), `bad recommendation: ${fb.recommendation}`);
  assert(Array.isArray(fb.strengths) && Array.isArray(fb.concerns), "AI arrays missing");
});

scenario("S31 · AI — nudge assist drafts a reminder (Ollama)", async () => {
  if (SKIP_AI) { results.aiSkipped = true; return; }
  // s11 stays ELIGIBLE (his S16 booking attempt was correctly rejected).
  const r = await call("POST", "/ai/nudge", { body: { studentId: "s11" }, session: staffTok() });
  if (r.status === 503) { results.aiSkipped = true; return; }
  assert(r.json?.ok === true, `AI nudge failed: ${r.json?.error}`);
  assert(r.json.data.message.length > 30 && /book/i.test(r.json.data.message), "nudge not actionable");
});

scenario("S32 · AI — role gate: student cannot call AI endpoints", async () => {
  if (SKIP_AI) { results.aiSkipped = true; return; }
  const r = await call("POST", "/ai/nudge", { body: { studentId: "s02" }, session: await ensureStudentToken("s02") });
  assert(r.status === 403, "student could invoke AI — role gate missing!");
});

scenario("S33 · auth — student email rejected at the staff entrance", async () => {
  const r = await call("POST", "/auth/login", { body: { email: STUDENT_EMAILS.s01, expects: "staff" } });
  assert(r.status === 403 && r.json?.wrongDoor === true, `got: ${JSON.stringify(r.json)}`);
  const r2 = await call("POST", "/auth/login", { body: { email: "kavya.rao@niat.edu.in", expects: "student" } });
  assert(r2.status === 403 && r2.json?.wrongDoor === true, `got: ${JSON.stringify(r2.json)}`);
});

scenario("S34 · transcripts — sample interview notes ship with the golden dataset", async () => {
  const snap = await snapshot();
  const t = snap.transcripts.find((x) => x.interviewId === "i01");
  assert(t && t.notes.length > 200, "transcript for i01 missing/too short in snapshot");
  assert(snap.transcripts.length >= 3, `expected ≥3 transcripts, got ${snap.transcripts.length}`);
});

// ─── v2.2: video-room acceptance + reschedule ───────────────────────────────

function nowHHMM() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function openFutureSlots(snap) {
  // mirrors backend isSlotInFuture: future date, or today with a start time
  // later than right now
  return snap.slots.filter(
    (s) => s.status === "open" && s.bookedCount < s.capacity && (s.date > TODAY || (s.date === TODAY && s.startTime > nowHHMM()))
  );
}

scenario("S35 · video room — new booking starts WITHOUT a link (awaiting acceptance)", async () => {
  const slots = openFutureSlots(await snapshot());
  assert(slots.length >= 2, `need ≥2 open future slots for S35–S37, got ${slots.length}`);
  ctx.slotA = slots[0];
  ctx.slotB = slots[1];
  // s11 (Arjun Reddy) is the untouched eligible student at this point in the run
  const r = await call("POST", "/book", { body: { studentId: "s11", slotId: ctx.slotA.id }, session: await ensureStudentToken("s11") });
  assert(r.json?.ok === true, `booking failed: ${r.json?.error}`);
  ctx.s11Interview = r.json.data.interviewId;
  const snap = await snapshot();
  const iv = snap.interviews.find((i) => i.id === ctx.s11Interview);
  assert(iv && iv.status === "booked", "s11 interview not booked");
  assert(iv.meetingLink === null, `new booking should have no link yet, got: ${iv.meetingLink}`);
});

scenario("S36 · video room — student cannot self-accept; staff accept mints a live link", async () => {
  const deny = await call("POST", "/interviews", { body: { action: "accept", interviewId: ctx.s11Interview }, session: await ensureStudentToken("s11") });
  assert(deny.status === 403, "student could accept a booking — role gate missing!");
  const r = await call("POST", "/interviews", { body: { action: "accept", interviewId: ctx.s11Interview, actor: "Ms. Kavya Rao" }, session: staffTok() });
  assert(r.json?.ok === true, `accept failed: ${r.json?.error}`);
  assert(/^https:\/\/meet\.jit\.si\/.+/.test(r.json.data.meetingLink), `link not a live video room: ${r.json.data.meetingLink}`);
  ctx.linkAfterAccept = r.json.data.meetingLink;
  // double-accept is rejected
  const r2 = await call("POST", "/interviews", { body: { action: "accept", interviewId: ctx.s11Interview }, session: staffTok() });
  assert(r2.status === 400, "double accept should be rejected");
  // the link is visible on the student's dashboard data
  const snap = await snapshot();
  const s11 = snap.students.find((s) => s.id === "s11");
  assert(s11.activeInterview?.meetingLink === ctx.linkAfterAccept, "student dashboard does not show the issued link");
});

scenario("S37 · reschedule — booked student moves to another slot; old slot reopens", async () => {
  const before = await snapshot();
  const oldSlot = before.slots.find((s) => s.id === ctx.slotA.id);
  const newSlot = before.slots.find((s) => s.id === ctx.slotB.id);
  const r = await call("POST", "/interviews", { body: { action: "reschedule", interviewId: ctx.s11Interview, newSlotId: ctx.slotB.id, actor: "Arjun Reddy" }, session: await ensureStudentToken("s11") });
  assert(r.json?.ok === true, `reschedule failed: ${r.json?.error}`);
  const snap = await snapshot();
  const iv = snap.interviews.find((i) => i.id === ctx.s11Interview);
  assert(iv.slotId === ctx.slotB.id, `interview still on slot ${iv.slotId}`);
  assert(iv.meetingLink === null, "moved interview must await a fresh accept/link");
  const afterOld = snap.slots.find((s) => s.id === ctx.slotA.id);
  const afterNew = snap.slots.find((s) => s.id === ctx.slotB.id);
  assert(afterOld.bookedCount === oldSlot.bookedCount - 1, `old slot count did not reopen: ${oldSlot.bookedCount} → ${afterOld.bookedCount}`);
  assert(afterNew.bookedCount === newSlot.bookedCount + 1, `new slot count not incremented`);
  // rescheduling into a past slot must be rejected (sl90 is {{T-1}})
  const bad = await call("POST", "/interviews", { body: { action: "reschedule", interviewId: ctx.s11Interview, newSlotId: "sl90" }, session: await ensureStudentToken("s11") });
  assert(bad.status === 400, "reschedule into a past/full slot was allowed");
});

// ─── Runner ──────────────────────────────────────────────────────────────────

async function waitForBackend(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await call("GET", "/health");
      if (r.json?.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`Backend not reachable at ${BASE} — start it with: npm run dev:backend`);
}

async function main() {
  console.log("\n┌─────────────────────────────────────────────────────┐");
  console.log("│  GRIT EVAL PIPELINE — golden dataset verification   │");
  console.log("└─────────────────────────────────────────────────────┘\n");

  await waitForBackend();

  let pass = 0, fail = 0, skipped = 0;
  const failures = [];

  for (const s of results) {
    try {
      await s.fn();
      pass++;
      console.log(`  \x1b[32m✔ PASS\x1b[0m  ${s.name}`);
    } catch (err) {
      if (results.aiSkipped) {
        skipped++;
        console.log(`  \x1b[33m◌ SKIP\x1b[0m  ${s.name}  (Ollama unreachable)`);
        continue;
      }
      fail++;
      failures.push({ name: s.name, err: err.message });
      console.log(`  \x1b[31m✘ FAIL\x1b[0m  ${s.name}\n        ${err.message}`);
    } finally {
      results.aiSkipped = false;
    }
  }

  console.log(`\n  ── Results: ${pass} passed · ${fail} failed · ${skipped} skipped ──\n`);
  if (fail > 0) {
    console.log("  Failures:");
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f.name}\n      ${f.err}`));
    console.log();
    process.exit(1);
  }
  console.log("  \x1b[32mAll features verified against the golden dataset. ✔\x1b[0m\n");
}

main().catch((err) => {
  console.error(`\n  \x1b[31mEVAL PIPELINE ERROR:\x1b[0m ${err.message}\n`);
  process.exit(1);
});
