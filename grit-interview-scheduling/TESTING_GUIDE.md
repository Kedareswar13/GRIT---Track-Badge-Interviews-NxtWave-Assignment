# TESTING_GUIDE.md — GRIT Interview Scheduling · Manual QA Script

**Click-through test plan for every screen and flow.** Each test has numbered
steps and an expected result. Tests marked ⭐ are *regression tests* — they
cover bugs actually found by the user during review; never let them regress.

Run after every build. Total time: ~20 minutes.

---

## 0. Setup (do this first, every time)

1. Start the servers from the repo root:
   ```powershell
   npm run dev
   ```
   Wait for both: backend on :4000, frontend on :3000.
2. Reset data to the golden dataset:
   ```powershell
   Invoke-RestMethod -Method POST -Uri http://localhost:4000/api/reset
   ```
   (The eval pipeline `npm run eval` also resets — but it books/cancels things,
   so reset again after it if you want pristine fixtures.)
3. Sanity: open `http://localhost:3000` — the split "two doors" landing loads.
4. **Hard-refresh between tests** (`Ctrl+Shift+R`) if a page looks stale — the
   session lives in `localStorage` (12h expiry), so state persists on purpose.

### Login registry (who to use for what)

| Email | Name | Role | Golden state |
|---|---|---|---|
| `aarav.s@niat.edu.in` | Aarav Sharma | student | ELIGIBLE → use for booking tests |
| `diya.p@niat.edu.in` | Diya Patel | student | ELIGIBLE |
| `rohan.m@niat.edu.in` | Rohan Mehta | student | BOOKED (has sample transcript i01) |
| `ishita.r@niat.edu.in` | Ishita Rao | student | BOOKED (transcript i02) |
| `kabir.s@niat.edu.in` | Kabir Singh | student | PASSED · active badge |
| `ananya.i@niat.edu.in` | Ananya Iyer | student | RETAKE_DUE (cooldown till {{T+5}}) |
| `vihaan.g@niat.edu.in` | Vihaan Gupta | student | NO_SHOW ×1 → CAN rebook |
| `meera.n@niat.edu.in` | Meera Nair | student | PASSED · badge NULLIFIED |
| `aditya.v@niat.edu.in` | Aditya Verma | student | NOT_ELIGIBLE (3 of 6 skills) |
| `arjun.r@niat.edu.in` | Arjun Reddy | student | ELIGIBLE (Data & AI track) |
| `nisha.m@niat.edu.in` | Nisha Menon | student | BOOKED (transcript i03) |
| `tara.j@niat.edu.in` | Tara Joshi | student | NO_SHOW ×2 → locked till {{T+9}} |
| `kavya.rao@niat.edu.in` | Ms. Kavya Rao | interviewer | console only (no ops desk) |
| `ops@niat.edu.in` | GRIT Ops Desk | admin | console + ops desk |

### AI prerequisite (only for T16/T20)

Ollama must be running locally with `qwen2.5:3b` (fallback `qwen2.5:7b`):
```powershell
ollama serve          # if not already running
ollama list           # confirm model pulled
```
If Ollama is down, the AI buttons show a human-readable error — that itself is
test T16b. Everything else works without Ollama.

---

## 1. Landing & auth

### T01 · Landing doors
1. Open `http://localhost:3000`.
2. Hover the **left (paper)** door, then the **right (ink)** door.
✅ Expected: doors flex-expand on hover (CSS `flex-grow` animation); each door
shows its audience ("Students" / "Interview team"), an arrow, and distinct
themes. Header shows the GRIT logo + "Badge Interviews · Internal" stamp.
3. Check the browser Back button after visiting a door and coming back.
✅ Expected: you return to the landing; no broken history.

### T02 · Student login — happy path
1. Click the left door → `/login/student`.
2. Enter `aarav.s@niat.edu.in` → submit.
✅ Expected: the card immediately shows the **branded GRIT-stamp loader**
("VERIFYING YOUR NIAT EMAIL…"), then lands on `/portal`, header says
**GRIT STUDENT SITE**, Aarav's name visible. Booking CTA ("Book interview →")
visible since he's ELIGIBLE.

### T03 · Login auto-redirect ⭐ (regression)
1. While still logged in as Aarav, manually open `/login/student`.
✅ Expected: instantly redirected to `/portal` (no duplicate login possible).
2. Log out or clear session (devtools → localStorage → remove the GRIT key),
   open `/login/admin` with no session.
✅ Expected: the staff login form renders normally.

### T04 · Wrong-door login blocked ⭐ (the review bug)
This is the root cause of "I'm Rohan Mehta (admin?) and can't press pass/fail —
the admin page is empty".
1. Log out fully. Go to the **staff** entrance `/login/admin`.
2. Enter a **student** email: `rohan.m@niat.edu.in` → submit.
✅ Expected: a clear inline error — "This is the staff entrance. Student
accounts log in from the student site." No session is created, no redirect.
3. Reverse case: at `/login/student` enter `kavya.rao@niat.edu.in`.
✅ Expected: "This is the student entrance. Staff log in from the ops site."
4. Now log in correctly at `/login/admin` as `ops@niat.edu.in`.
✅ Expected: lands on `/console` with **GRIT OPS SITE** chrome and Kavya/ops
schedule controls; the "Ops desk" button is visible (admin role).

### T05 · Console role guard ⭐ (defense in depth)
1. As a **student**, manually open `http://localhost:3000/console`.
✅ Expected: bounced to `/portal` (never an empty staff console).
2. Manually open `/console/team` as a student or as plain interviewer
   `kavya.rao@niat.edu.in`.
✅ Expected: bounced (to `/portal` / `/console` respectively). Only
`ops@niat.edu.in` (admin) can hold the ops desk.
3. Log out (EXIT link), open `/portal` directly with no session.
✅ Expected: bounced to `/login/student`.

---

## 2. Student site (`/portal`, `/portal/book`)

### T06 · Dashboard (before → after)
1. As Aarav (ELIGIBLE, no interview yet), study the dashboard.
✅ Expected: shows his 6 cleared skills as a progress meter, state pill
**ELIGIBLE**, and the interview card is hidden/absent in "before" mode —
deliberately, since there's nothing to show yet.
2. Toggle the **before/after** switch if present.
✅ Expected: "before" view hides the interview card + messages; "after" shows
them (this matches a demo persona like Rohan: BOOKED state with confirmed
interview card and the three student messages).
3. Log in as `rohan.m@niat.edu.in` → dashboard.
✅ Expected: state **BOOKED**, interview confirmed card with date/time +
interviewer, and verbatim student messages ("what to expect", "bring ID",
"reschedule window" — Deliverable 3).
4. Log in as `meera.n@niat.edu.in`.
✅ Expected: PASSED but badge shows **NULLIFIED** with the impersonation
reason text — the honest handling of revocation.

### T07 · Back navigation + real logout on every page ⭐ (the review bug)
Walk this loop and verify the back affordance each time:
1. `/portal` → top-left shows a `← Home` button (goes to landing).
2. Click "Book interview" → `/portal/book`.
✅ Expected: sticky header on the booking page contains **← My dashboard**
top-right; clicking returns to `/portal`.
3. EXIT is a **real logout** now: as Aarav, press **EXIT ↩** in the header.
✅ Expected: you land on `/login/student` (the login page, NOT the dashboard),
the session is cleared, and a hard refresh of `/portal` bounces you back to
login. "Home"/back links still go to the landing if you just want to browse.

### T08 · Booking page rendering
1. As Aarav, go to `/portal/book`.
✅ Expected: the branded GRIT-stamp loader shows first (rotating ring +
pulsing "G"), then slots render grouped by date as **ticket cards** with
perforated edges, interviewer name, "N left" chips, and staggered rise-in
animation (cards appear in sequence, not all at once).
2. Confirm past dates (yesterday) do **not** appear; only today/future.

### T09 · Book a slot (happy path)
1. Still as Aarav, click **Book** on any open future slot.
✅ Expected: button shows busy state; then the success flow (next test).
2. Book a second attempt as Diya on the **same slot as Aarav's** — capacity
1 slots: after Aarav booked it, that ticket should show **Full** (disabled) or
be gone; try a different slot.
✅ Expected: full slots are visibly disabled/booked; no way to overbook.

### T10 · Booking return path + reschedule ⭐ (the review bug)
1. Complete a booking (T09).
✅ Expected: a success card pops ("✅ Interview requested") with a live
countdown **"Returning to your dashboard in 6s"**, a **Go to my dashboard now →**
button, and a **Reschedule this interview ↺** button.
2. Wait for the countdown to finish.
✅ Expected: auto-redirect to `/portal`; dashboard now shows state **BOOKED**
with the interview card matching what you booked, and the join link shows
**"AWAITING INTERVIEWER CONFIRMATION"** with a pulsing live-dot (see T26).
3. Repeat a booking and this time click **"Reschedule this interview"**.
✅ Expected: countdown stops; the page shows your **current booking summary**
(amber left border) above the slot grid, whose buttons now read **Move here**;
your current slot is not offered.
4. Click **Move here** on a different slot.
✅ Expected: success card ("🔁 Interview moved"); old slot released; the
dashboard reflects the new time and resets to "awaiting confirmation" (a moved
interview needs a fresh accept — by design).

### T11 · Booking guards (negative tests)
Try each; all must show a clear error message (toast/alert), never a crash:
1. `ananya.i@niat.edu.in` (RETAKE_DUE) → `/portal/book` → book.
✅ Expected: cooldown error mentioning when retake opens ({{T+5}} date).
2. `tara.j@niat.edu.in` (NO_SHOW ×2) → book.
✅ Expected: 14-day lock error ({{T+9}} date).
3. `aditya.v@niat.edu.in` (NOT_ELIGIBLE) → dashboard.
✅ Expected: no booking CTA; state explains remaining skills.
4. `vihaan.g@niat.edu.in` (NO_SHOW ×1) → book → confirm.
✅ Expected: **allowed** (policy: one no-show may rebook); dashboard flips
to BOOKED.

### T12 · Cancel from the student side
1. As the student you just booked (T09), find the cancel affordance on the
dashboard interview card and cancel.
✅ Expected: confirmation, state returns to ELIGIBLE, and if you open
`/portal/book` again the slot's "N left" has been restored (capacity reopened).

---

## 3. Ops site — interviewer console (`/console`)

### T13 · Console access & navigation
1. Log out; log in at `/login/admin` as `kavya.rao@niat.edu.in`.
✅ Expected: lands on `/console`; header shows **GRIT OPS SITE · INTERVIEWER
CONSOLE**; no "Ops desk" button (she's not admin); a **← Ops home** back link
sits under the header; EXIT ↩ logs out to `/login/admin` with the session
cleared (verify: refresh `/console` → bounced to login).
2. The console shows three tabs — "daily schedule", "my availability" and
"past activity". Switch between them.
✅ Expected: schedule lists booked interviews for the day with student name,
track, time; empty days show a friendly empty state (no blank page).

### T14 · Publish availability (with the capacity stepper)
1. In "my availability", pick a date/time and set capacity with the **− / +**
stepper buttons (chunky stamped squares, NOT a native number spinner).
✅ Expected: value steps between 1 and 4, buttons disable at the bounds.
2. Publish the slot.
✅ Expected: slot appears in the list immediately (snapshot refresh); if you
then log in as a student of that track, the new slot is bookable.

### T15 · Sample transcript loader ⭐ ("interview videos" material)
1. Log in as `kavya.rao@niat.edu.in`, open an interview for **Rohan Mehta**
(interview i01, today 10:00) and expand its outcome panel.
✅ Expected: a **"📋 Load sample transcript"** button with the caption
"MOCK TRANSCRIPT FROM THE GOLDEN DATASET · ROHAN MEHTA · FULL-STACK BADGE…".
2. Click it.
✅ Expected: the notes textarea fills instantly with the raw call notes
(late start, Q&A, live-coding debounce, REST confusion…). No network call —
it's local fixture data.
3. Repeat for **Ishita Rao** (i02) and **Nisha Menon** (i03).
✅ Expected: each has its own distinct transcript; interviews without one
(e.g. a fresh booking you made in T09) show no button.

### T16 · AI feedback assist (Ollama)
1. With the transcript loaded (T15), click the AI assist button.
✅ Expected: while busy, a working state; then a structured result appears:
summary, recommendation, strengths, concerns, suggested feedback.
2. **Verify the human stays in charge:** the pass/fail/retake selector is NOT
auto-changed by the AI result; you can disagree with it and record any outcome.
3. Clear the notes and click AI assist with empty input.
✅ Expected: a validation message, not a garbled request.
4. (If Ollama stopped) repeat → human-readable "AI unavailable" error.

### T17 · Record an outcome
1. As Kavya, open the interview for the booking **you** created as Aarav in
T09/T10 (it should be on today's schedule if you booked today).
2. Paste or load notes, pick **Pass**, add feedback, submit.
✅ Expected: success flash (toast animation), row updates; log in as Aarav →
dashboard shows **PASSED** with an active badge.
3. Second case: book as Diya, have staff record **Fail**.
✅ Expected: Diya's state becomes RETAKE_DUE with a cooldown date (7 days);
her dashboard explains the wait.
4. Third case: record **Retake** for another eligible booking.
✅ Expected: RETAKE_DUE with the shorter 2-day cooldown.
5. Negative: try submitting an outcome with empty feedback.
✅ Expected: blocked with a clear error.

### T18 · Cancel & no-show from the console
1. Staff cancels a future booked interview.
✅ Expected: booking removed; the student returns to ELIGIBLE and can rebook;
slot capacity reopens.
2. Mark a different booked interview as **no-show**.
✅ Expected: student state NO_SHOW (count 1) — their dashboard can still
rebook (policy); mark the SAME student's next booking no-show again →
✅ Expected: second no-show locks them out for 14 days (dashboard + booking
both reflect the lock date).

---

## 4. Ops site — ops desk (`/console/team`, admin only)

### T19 · Ops desk access & overview
1. Log in as `ops@niat.edu.in` → in the console header click **Ops desk →**.
✅ Expected: `/console/team` loads with the branded loader, then BigNum stat
cards that **count up** (animated), booked vs not-booked lists, nudges panel,
audit log. Header has **← Interviewer console** back link and EXIT.
2. As Kavya (interviewer), try `/console/team` directly.
✅ Expected: redirected back to `/console` (admin-only desk).

### T20 · AI nudges (eligible non-bookers)
1. In the nudges panel, pick an eligible student who hasn't booked
(Aarav/Diya/Arjun Reddy in golden state).
2. Click the AI nudge button (Ollama required).
✅ Expected: a ≤45-word personalized reminder appears (no trailing cut-off
sentence); you can copy it; the *send/decision* stays with the human.
3. If Ollama is down: human-readable error, panel still usable.

### T21 · Badge nullification
1. Find a PASSED student with an active badge (Kabir Singh or Dev Malhotra).
2. Nullify with a reason.
✅ Expected: badge flips to **NULLIFIED**, reason stored; their dashboard
shows the revoked state; a second nullify attempt is rejected (once-only).

### T22 · Audit log
1. Scroll the audit log at the bottom of the ops desk.
✅ Expected: every action from this session appears in order — logins,
publishes, bookings, outcomes, nullifications — with actor names and
timestamps. Nothing you did is missing.

---

## 5. Cross-cutting / polish

### T23 · Animations & design-system checklist ⭐
Walk any two pages and confirm:
- [ ] Branded loader (spinning ring + pulsing G glyph) on first data load,
      not a bare "LOADING…" text.
- [ ] Skeleton shimmer where lists load, instead of blank gaps.
- [ ] Staggered card entrances (booking tickets, schedule rows, ops lists).
- [ ] Buttons: arrow slides right on hover; slight tilt; visible pressed state.
- [ ] Success/toast messages slide in; success card pops.
- [ ] Sticky translucent headers stay pinned while scrolling long pages.
- [ ] Stat numbers count up on the ops desk.
- [ ] Whole thing looks "stamp & ticket" (hard offset shadows, perforated
      tickets, rotated stamps) — not stock Tailwind.
- [ ] Turn on Windows "Show animations" off (Settings → Accessibility →
      Visual effects) or emulate `prefers-reduced-motion: reduce` in devtools:
      all of the above collapse to instant states. Restore afterwards.

### T24 · Keyboard + refresh robustness
1. On every screen, browser Back/Forward work and don't trap you.
2. Hard-refresh (`Ctrl+Shift+R`) on `/portal`, `/portal/book`, `/console`,
   `/console/team`.
✅ Expected: session survives (12h), correct page re-renders; no 404 (App
Router client routes refresh fine).
3. Stop the backend (`Ctrl+C` on the dev task, or kill :4000) and click
anything API-backed.
✅ Expected: friendly network error, no white-screen crash. Restart backend
and continue.

### T25 · Full reset
1. `Invoke-RestMethod -Method POST -Uri http://localhost:4000/api/reset`
2. Run `npm run eval` — expect **38/38 PASS** (AI scenarios WARN if Ollama is
   off — that's a pass).
3. Reset once more so manual testing starts pristine.

---

## 5b. v2.2 additions (video rooms, history, logout)

### T26 · Video room acceptance flow ⭐
1. Reset data. Log in as `aarav.s@niat.edu.in` → book any slot.
✅ Expected: dashboard shows the interview as BOOKED but the join-link row
reads **"AWAITING INTERVIEWER CONFIRMATION"** with a pulsing dot — no link yet.
2. Log in as `kavya.rao@niat.edu.in` (or the slot's interviewer) → console →
find Aarav's row: it carries a **"⏳ booking request — link not sent"** chip.
3. Press **"✅ Accept & send video link"**.
✅ Expected: busy state, then a success flash with the generated room URL; the
row now shows a **"VIDEO ROOM LIVE →"** banner with a clickable
`https://meet.jit.si/grit-…` link, and the chip disappears.
4. Open the meet link in a new tab.
✅ Expected: it genuinely opens a working video room (free Jitsi Meet — no
account, no API key; production note: Google Calendar API would mint
meet.google.com links behind the same route).
5. Back as Aarav → dashboard: the join link is now an **"Open video room ↗"**
anchor to that room; the card text changed from "awaiting confirmation" to
"your video room is ready".
6. Negative: press Accept again on an already-accepted interview (pick any
other interviewer's view or re-open) → ✅ rejected with a clear error.
A student session can never call accept (eval S36 asserts this).

### T27 · Past activity tab (interviewer history)
1. As Kavya, open the **PAST ACTIVITY · N** tab.
✅ Expected: completed / cancelled / no-show interviews listed newest first —
each with student name, status chip, date+time, the outcome's **result pill**
(✓ PASS / ✕ FAIL / ↻ RETAKE), the recorded feedback text, and
"RECORDED BY … · <date>".
2. Tick **"ONLY RECORDED BY ME"**.
✅ Expected: list narrows to outcomes Kavya recorded; empty state text adapts
if she hasn't recorded any.
3. Cross-check one entry against the student's dashboard (e.g. Kabir Singh
PASSED with the React-architecture feedback).

### T28 · Ops desk logout
1. As `ops@niat.edu.in` on `/console` or `/console/team`, press **EXIT ↩**.
✅ Expected: session cleared, lands on `/login/admin`; refreshing
`/console/team` afterwards bounces to login.

### T29 · Reschedule edge cases
1. As a BOOKED student open `/portal/book` and try to pick the **same slot**
you're already on.
✅ Expected: it's not offered (filtered out).
2. All other slots full scenario: if a day has no alternatives, the empty-state
card explains no open slots — no dead-end, dashboard reachable via header.
3. Book, then have the interviewer **cancel** the slot from the console.
✅ Expected: student returns to ELIGIBLE and the reschedule banner is gone.

---

## 6. Done-when checklist

- [ ] T01–T05 auth & wrong-door all green
- [ ] T06–T12 student journey all green (incl. reschedule T10)
- [ ] T13–T18 console all green (incl. transcript loader + AI assist)
- [ ] T19–T22 ops desk all green
- [ ] T23–T24 polish & robustness all green
- [ ] T26–T29 v2.2 flows all green (video room, history, logout, reschedule)
- [ ] T25 eval 38/38 + final reset

**If any test fails:** note the test ID + what you saw, check the backend
terminal for the error, and cross-reference `BUILD_GUIDE.md` §8.1 (what
changed in v2.1) before touching code.
