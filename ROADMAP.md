# GRIT Interview Scheduling — Build Roadmap
(AI Product Engineer — Round 1 Assignment)

> ⚠️ Deadline: "Submit before 14 Nov" — today IS 14 Nov. Fast-track plan below (~8–9 hrs total).

---

## Part A — Understanding the Problem

### Domain: GRIT (NIAT skilling competition)
- Students clear **skill contests** over a year.
- Clearing **every skill a Track Badge needs** → student becomes **eligible** for a **live online interview**.
- Clearing the interview → **badge earned**.
- Malpractice flagged later → **badge nullified**.
- Interviewers are few; each has **their own availability**.

### Personas & Core Flows
| Persona | Jobs to be done |
|---|---|
| Student | Check eligibility → book slot → attend → see status/result |
| Interviewer | Publish availability → see day's queue → record outcome (pass / fail / retake later) |
| Interview team | Monitor booked vs. not-booked eligible students → chase non-bookers |

### The 5 Required Feature Behaviors (from problem statement)
1. Eligible students **book** an interview slot from their dashboard.
2. Interviewers **set & manage availability**.
3. Interview team **records outcome**: pass, fail, or retake later.
4. Students see **status + result** on dashboard.
5. Interview team sees **booked vs. not-booked** eligible students.

---

## Part B — Roadmap (compressed, same-day)

### Phase 0 — Setup & Scope (30 min)
- [ ] Pick stack: **Next.js + Tailwind + localStorage/SQLite** (or Lovable / v0 / Bolt as the "AI vibe coding tool").
- [ ] Create repo + seed mock data: ~12 students (mix of eligible / booked / interviewed / passed / failed), 3 interviewers, slots across today–+7 days.
- [ ] Open the GRIT website briefly for visual/branding reference.

### Phase 1 — Write-up (1.5–2 hrs) ← do this FIRST, it drives the build
**(2 pages max)**

#### 1. States table (student interview journey)
| # | State | Meaning | Moves to next state when… |
|---|---|---|---|
| 1 | `NOT_ELIGIBLE` | Pending contests | All track contests cleared → auto-promotes |
| 2 | `ELIGIBLE` | Can book | Books a slot → `BOOKED` |
| 3 | `BOOKED` | Slot confirmed | Interview done → `COMPLETED`; student absent → `NO_SHOW`; cancelled in time → `ELIGIBLE` |
| 4 | `COMPLETED` | Awaiting/with outcome | Interviewer records result → `PASSED` / `FAILED` / `RETAKE_DUE` |
| 5 | `PASSED` | Badge earned | Malpractice flag → `BADGE_NULLIFIED` |
| 6 | `RETAKE_DUE` | Must re-attempt later | Cooldown over → `ELIGIBLE` (rebook) |
| 7 | `NO_SHOW` | Missed interview | Policy allows rebook → `ELIGIBLE` (count against limit) |
| 8 | `BADGE_NULLIFIED` | Malpractice | Terminal (appeal process = open question) |

#### 2. Edge cases & questions (pick ~8 strong ones)
- Double-booking: student books two overlapping slots / two badges at once.
- Booking a past slot or a slot already at capacity.
- Interviewer deletes availability after students booked → auto-cancel + rebook flow.
- Student cancellation cutoff (e.g., ≥4 hrs before) to avoid slot waste.
- No-show policy: max 2 no-shows → booking locked for X days.
- Retake limits: max 2 attempts per badge, min 7-day cooldown.
- Malpractice flagged **after** badge earned → retroactive nullification + notification.
- Timezones between interviewers & students.
- What if eligible for multiple badges → parallel independent journeys.
- Open question to end write-up: "Who owns chasing non-bookers — auto-reminder or human?"

#### 3. Data model (tables + keys)
- `students(id, name, email, track_id, contests_cleared[], eligibility)`
- `tracks(id, name, required_skill_ids[])`
- `interviewers(id, name, email)`
- `slots(id, interviewer_id, starts_at, ends_at, capacity, booked_count)`
- `interviews(id, student_id, slot_id, track_badge_id, status, booked_at, meeting_link)`
- `outcomes(id, interview_id, result ENUM(pass|fail|retake), feedback, recorded_by, recorded_at)`
- `badges(id, student_id, track_id, awarded_at, status ENUM(active|nullified))`
- `malpractice_flags(id, student_id, reason, flagged_by, flagged_at)`

### Phase 2 — Working Prototype (3.5–4.5 hrs)
Build in this order (each screen is a deliverable):
- [ ] **Student Home — "before" state** (eligibility + contests progress, no interview UI)
- [ ] **Student Home — "after" state** (interview status card, result, next action)
- [ ] **Booking screen**: eligible badge → slot picker grouped by interviewer/day → confirm
- [ ] **Student status/result view**: Upcoming / Passed / Failed / Retake states
- [ ] **Interviewer availability manager**: weekly grid, add/remove slot blocks
- [ ] **Interviewer daily schedule**: today's queue + outcome recording (pass / fail / retake + feedback box)
- [ ] **Interview team dashboard**: table of all eligible students → booked ✓ / not booked ✗, filter + nudge button
- [ ] (Stretch, shows edge-case thinking) Admin action: **nullify badge** on a passed student

### Phase 3 — Student Messages + Polish (45 min)
Draft the **3 most important messages** verbatim:
1. **Booking confirmation** — "Your interview for the *Full-Stack Track Badge* is booked for Fri, 20 Nov, 4:00 PM with Ms. Rao. Join link will appear here 10 min before."
2. **Result — pass** — "Congratulations! You cleared the interview and earned the *Full-Stack Track Badge*. 🎉"
3. **Retake / fail** — "This round wasn't a pass. You can rebook a retake from 27 Nov — you've got this."

Match tone to GRIT/NIAT student audience; drop exact copies into the prototype UI.

### Phase 4 — Loom Recording (45 min)
Script outline (5–6 min):
1. (30s) Restate the problem in your own words.
2. (90s) State machine — walk the diagram, justify each transition.
3. (60s) Edge cases you chose to handle & assumptions.
4. (2 min) Live demo: book → availability → record outcome → before/after home.
5. (60s) The 3 messages & why they're the right 3.
6. (30s) What you'd build next with more time.

### Phase 5 — Submit (15 min)
- [ ] Export write-up as PDF (≤ 2 pages).
- [ ] Verify prototype link works logged-out / incognito.
- [ ] Submit Google Form **before the deadline**.

---

## Part C — Suggested Timeline (same day)
| Time block | Phase |
|---|---|
| Hour 0–0.5 | Phase 0 setup |
| Hour 0.5–2.5 | Phase 1 write-up |
| Hour 2.5–7 | Phase 2 prototype |
| Hour 7–7.75 | Phase 3 messages |
| Hour 7.75–8.5 | Phase 4 Loom |
| Hour 8.5–9 | Phase 5 submit |

## Grading signals to hit
- **Product thinking** > code volume: the write-up carries as much weight as the demo.
- Show the *state machine visually* (a simple diagram beats prose).
- Edge cases show seniority — pick 6–8 sharp ones, not 20 generic ones.
- Before/after screens prove you think about student *experience*, not just CRUD.
