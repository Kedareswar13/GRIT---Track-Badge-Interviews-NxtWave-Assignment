# BUILD_GUIDE.md — GRIT Interview Scheduling v2.1
**How this was built, why every decision was made, and how to run/extend it.**
*(This file doubles as the build memory — read it before touching the code.)*

---

## 0. CONTEXT RECOVERY — read this first

If you are a fresh session picking this project up mid-flight, work in this order:

1. **Run the system**: `npm run dev` (root) → backend :4000 + frontend :3000.
   Verify with `curl http://localhost:4000/api/health` (expect `{"ok":true,...}`).
2. **Run the eval**: `npm run eval` → must print **38/38 PASS**. This is the
   single source of "the build is healthy". If it fails, fix before anything else.
3. **Read §1–§5** (scope, architecture, state machine, golden dataset, eval) —
   that's the mental model. **§8.1** is the latest build log (v2.1 changes).
4. **Manual QA**: follow `TESTING_GUIDE.md` — a step-by-step click-through of
   every screen with expected results and regression tests for user-reported bugs.
5. Then read the remaining sections as needed. §12 has the per-session gotchas.

**Golden rules:**
- Ollama only for AI (local models, no cloud APIs). It is *advisory*: the human
  always makes pass/fail/nudge decisions.
- Every feature = API route → eval scenario → UI. Order matters.
- Golden dataset uses date tokens (`{{TODAY}}`, `{{T+n}}`, …) — never write raw dates.
- All changes are **uncommitted** — there is no git repo in this workspace yet.

---

## 1. What was built (scope recap)

An **internal-only** interview-scheduling system for NIAT's GRIT Track Badges,
delivered as a production-style monorepo with **two servers**:

| Server | Path | Port | Stack |
|---|---|---|---|
| Backend API | `backend/` | 4000 | Express + TypeScript (`tsx`), JSON store, Ollama client |
| Frontend | `frontend/` | 3000 | Next.js 15 (App Router) + Tailwind v4 + bespoke CSS design system |

**Two distinct websites** (per requirement):

| Site | Entry | Theme | Contents |
|---|---|---|---|
| Student site | `/login/student` → `/portal`, `/portal/book` | PAPER (warm light, grid texture) | Before/After dashboard, booking (ticket-style slots), status/result, verbatim messages |
| Ops site | `/login/admin` → `/console`, `/console/team` | INK (dark console) | Interviewer availability + daily schedule + outcome recording (+ AI assist); Ops desk: booked vs not-booked, AI nudges, badge nullification, audit log |

Landing `/` is a split "two doors" page linking both entrances.

**Role model:** students log into the student site; interviewers AND admins log
into the ops site. Admins additionally get the ops desk (`/console/team`);
interviewers without admin role are redirected there.

---

## 2. Architecture & key decisions

```
frontend/  Next.js :3000
  src/app/page.tsx                 Landing — split doors
  src/app/login/{student,admin}    Two logins (email → mock session)
  src/app/portal/                  Student dashboard (before/after) + booking
  src/app/console/                 Interviewer console (+ AI assist)
  src/app/console/team/            Ops desk (nudges, nullify, audit)
  src/app/globals.css              ★ GRIT design system (see §7)
  src/lib/auth.ts                  Session client (localStorage, 12h expiry)
  src/lib/useSnapshot.ts           One read endpoint powers all screens
  next.config.mjs                  /api/* proxied to backend :4000 (rewrites)

backend/  Express :4000
  src/index.ts                     Server + route mounting + 404/500 handlers
  src/state.ts                     State machine + bookingCheck (pure fns)
  src/db.ts                        JSON store; loads GOLDEN dataset + date tokens
  src/auth.ts                      Mock sessions + role gates (requireStudent/Staff/Admin)
  src/ollama.ts                    Local AI client (3b primary → 7b fallback)
  src/routes/                      general(auth/snapshot/reset) booking slots
                                   interviews outcomes badges ai

golden/golden-dataset.json   Canonical fixture — 14 students covering all 7
                             journey states; date tokens {{TODAY}}/{{TOMORROW}}/
                             {{T+n}}/{{T-n}} resolved at load → valid on any day
eval/run.mjs                 38-scenario pipeline, zero deps (Node fetch)
```

**Why this shape (v2 changes):**
- **Two servers** — the brief's basic requirement; also the real production shape
  (API can scale/split independently; browser talks one origin via Next rewrites,
  which stand in for a reverse proxy).
- **Two sites** — student-facing surfaces should never look like staff tooling;
  separate logins let us enforce role at the entry point, not just per-request.
- **Golden dataset + eval pipeline** — no agents in this build, so correctness is
  guarded by scripted verification: reset to golden → run scenarios → assert.

**Auth (mock but structured):** login issues a base64 session sent as
`x-grit-session`; backend role-gates mutations (`requireStudent`/`requireStaff`/
`requireAdmin`). The interviews route allows cancel by any session but no-show
only by staff. Production swap: SSO + JWT + RBAC middleware (same gates).

---

## 3. The state machine (Deliverable 1, implemented)

```
NOT_ELIGIBLE ─(all skills cleared)→ ELIGIBLE ─(books slot)→ BOOKED
BOOKED ─(outcome pass)→ PASSED ─(malpractice flag)→ BADGE_NULLIFIED [terminal]
BOOKED ─(outcome fail)→ RETAKE_DUE (+7d) ─(cooldown over)→ ELIGIBLE
BOOKED ─(outcome retake)→ RETAKE_DUE (+2d)
BOOKED ─(missed)→ NO_SHOW ─(1st)→ ELIGIBLE  |  ─(2nd)→ locked 14d
BOOKED ─(cancel)→ ELIGIBLE (slot reopens)
```

`effectiveState()` resolves time-based transitions on read (no cron in prototype);
`bookingCheck()` centralizes every booking guard; `audit()` logs every actor
decision into `db.log` (capped at 200).

**Policies:** fail → 7d cooldown; retake → 2d; no-show ×2 → 14-day lock;
max 3 attempts (shown in UI).

---

## 4. Golden dataset

`golden/golden-dataset.json` is the **single source of truth** for demo data,
manual testing, and the eval pipeline. Backend `POST /api/reset` reloads it.
Date tokens keep fixtures day-independent (resolved in `db.ts`).

Covers: 2 tracks, 3 interviewers + 1 admin, 14 students — eligible ×4, booked ×3,
passed ×2 (one later nullified), retake-due ×1, no-show ×1 (and ×2 locked),
not-eligible ×2 — plus 14 slots (future + past), historical interviews/outcomes,
1 malpractice flag, and **3 sample interview transcripts** (`i01`–`i03` — raw
interviewer notes that the console's "📋 Load sample transcript" button drops
into the outcome panel, giving the AI assist real material to structure).
Transcripts are keyed by `interviewId`; the console shows the button only for
interviews that have one.

---

## 5. Eval pipeline (`eval/run.mjs`) — how it works

- Waits for backend health → `POST /api/reset` (loads golden).
- Runs 38 scenarios **in a deliberate order** (S06 books → S17 records outcome…).
  Shared `ctx` carries tokens and created IDs between steps.
- Asserts: HTTP status, error-message regex, post-state via `/api/snapshot`,
  date math (cooldowns/locks computed vs. expected), role denials (403),
  invariants (audit log actions present; every student maps to a valid state;
  counters sum to population).
- AI scenarios (S30–S32) are skipped as WARN when Ollama is unreachable, so CI
  runs don't fail on infrastructure (`npm run eval:no-ai`).
- Prints a PASS/FAIL table, exits 1 on any failure → wire into build hooks.

**Lessons captured while building the pipeline (it caught real bugs):**
1. Express routers must be mounted at their resource prefix (`app.use("/api/slots", slots)`) — mounting resource routers flat at `/api` produced "Unknown API route" 404s for 12 scenarios.
2. Session fixtures: scenarios that assert *student-perspective* guards need that
   student's token — the `ensureStudentToken()` helper logs in on demand from the
   golden email registry.
3. Scenario ordering matters: S20 (2nd no-show) must no-show the booking created
   in S13, not a fresh fixture booking; S31's nudge target must still be ELIGIBLE
   at that point. Broken sequencing produces false negatives.

---

## 6. AI features (Ollama, local-only)

- **Feedback assist** `POST /api/ai/feedback` (staff): raw interview notes →
  strict JSON `{summary, recommendation, strengths[], concerns[], suggestedFeedback}`.
  Advisory only — the interviewer still selects pass/fail/retake.
- **Nudge assist** `POST /api/ai/nudge` (staff): ≤45-word personalized reminder
  for eligible non-bookers; trailing-token cleanup (trim to last sentence).
- Config: `OLLAMA_URL`, `OLLAMA_MODEL` (qwen2.5:3b), `OLLAMA_MODEL_FALLBACK`
  (qwen2.5:7b), `OLLAMA_TIMEOUT_MS`. 503 with a human-readable message when down.

---

## 7. Design system ("stamp & ticket") — frontend/src/app/globals.css

Built to *not* look like stock Tailwind/AI output. Foundations:

- **Tokens** via Tailwind v4 `@theme`: ink #131318, paper #f5f2ea, lime #d7f95c
  (accent), coral/amber/ember (danger/warn), mint/sky (status), display
  Space Grotesk, body Inter, mono JetBrains Mono (loaded via `<link>`, not
  build-time font fetching).
- **Two themes** as wrapper classes: `.theme-paper` (student site: warm light +
  grid texture + hard offset shadows) and `.theme-ink` (ops: dark + faint grid).
  Every component class has per-theme variants via CSS descendants.
- **Signature elements:** angled clip-path buttons/corners (`.btn`, `.ticket-notch`),
  perforated ticket edges (`.ticket::after` dashed border), stamped labels
  (`.stamp`, rotated), overline section headers with rule + arrow (`.overline`),
  striped animated meters (`.meter-fill`), angular chips/pills, hover "doors"
  that flex-expand on the landing, hard-offset shadows (5px 5px 0) instead of
  soft glows, tabular numerals on counters.
- Tailwind utilities handle layout/spacing only; identity comes from the custom
  classes. Adding a screen: wrap in `.theme-paper grid-paper` or `.theme-ink grid-ink`,
  use `.card .btn .input .overline .pill` primitives.

---

## 8. Build process log (v2, in order)

1. Restructured to `frontend/` + `backend/` + `golden/` + `eval/` workspaces; root
   `package.json` scripts with `concurrently` to run both servers with one command.
2. Ported the domain layer to `backend/src` (state machine unchanged — it was right).
3. Added real structure the prototype lacked: health check, uniform 404/500 JSON,
   role gates on every mutation, CORS.
4. Wrote the golden dataset with **date tokens** so fixtures never go stale.
5. Built the eval pipeline; **first run: 10/33** → caught the flat-mounting bug
   (fixed) and missing student tokens (fixed) → **33/33**.
6. Two sequencing bugs in my own scenarios (S20/S23/S31) surfaced as expected-state
   mismatches — fixed the *tests*, not the app, after verifying app behavior was correct.
7. Built the two sites with the new design system; wrote landing doors + logins
   before dashboards so auth flow shaped the pages.
8. `npm run build` caught 2 strict-TS issues (Card `style` prop; session `exp`
   typing) → fixed → green build: backend tsc + frontend 10 routes.
9. Windows gotchas logged for future sessions: killing port squatters
   (`Get-NetTCPConnection :3000 → Stop-Process`), npm workspaces hoist to root
   `node_modules` (deleting it breaks workspaces → re-run `npm install`),
   locked `.node` files (EPERM) from zombie processes are cosmetic warnings.

## 8.1 Build process log (v2.1 — user-review fixes, in order)

Feedback from the live review of v2 drove this pass. Every fix has a regression
test (eval scenario or TESTING_GUIDE step).

1. **Wrong-door login (the "can't press pass/fail, admin page empty" bug).**
   Root cause: login didn't check which entrance you came through, so a student
   email (Rohan Mehta) at the staff entrance created a session that landed on
   `/console` with an empty schedule and dead controls. Fixes: `expects`
   param on `POST /api/auth/login` → 403 `wrongDoor` (backend/general.ts);
   both login pages pass `expects` and surface the error; `/console` and
   `/console/team` redirect non-staff/non-admin sessions; login pages
   auto-redirect users who already hold a valid session; landing doors route
   logged-in users straight to their dashboard. → eval S33.
2. **Missing back-navigation.** Every page now has a sticky `sticky-head` chrome
   bar plus a prominent `BackLink` component (button-styled `←`): portal → home,
   book → portal, console → ops home, team → console. Fixed the user's exact
   complaint ("booked but no way back to profile").
3. **Booking return path.** Successful booking now renders a `pop` success card
   with a countdown and **auto-redirects to `/portal` after 6s**, with a "Go to
   my dashboard now" button and a "Book another slot" escape. → TESTING_GUIDE T10.
4. **"Interview videos" → sample transcripts.** Real videos can't be fabricated,
   so the golden dataset ships 3 realistic raw interview transcripts; the
   interviewer console has a one-click "📋 Load sample transcript" loader that
   fills the notes textarea, ready for the AI assist. → eval S34.
5. **Animations** (globals.css): `.loader` (rotating GRIT stamp with pulsing
   glyph), `.skeleton` shimmer, `.rise-stagger` list entrances, `.page-enter`,
   `.pop` success, `.toast`, `.sticky-head` glass, button arrow-slide + tilt,
   `.row-hover` row lift, `.live-dot` ping, count-up `BigNum`, and full
   `prefers-reduced-motion` support.
6. **Frontend-only regression note:** eval S33 covers the API guard; the UI
   redirects (role guards on /console, auto-redirect on login pages) are
   asserted by TESTING_GUIDE T3–T5, not by eval (headless pipeline can't click).

## 8.2 Build process log (v2.2 — second review round, in order)

User's second review raised 9 points; all addressed, each with eval coverage
(S35–S37) or TESTING_GUIDE steps (T26–T29).

1. **Login loaders** — both login cards now show the branded GRIT-stamp loader
   ("Verifying your NIAT email…") while the login request is in flight,
   replacing the dead "Signing in…" text.
2. **EXIT = real logout.** The EXIT links used to just navigate to `/`, where
   the smart doors bounced the *still-logged-in* session straight back to the
   dashboard — that's why "exit lands me on the dashboard". New `ExitButton`
   component clears the session and routes to the site's own login page
   (student → `/login/student`, staff/admin → `/login/admin`).
3. **Student-page animations** — staggered card entrances, animated BEFORE/AFTER
   switch tabs (`.switch-tab` color glide), skill rows with hover-lift +
   sequential ✓ pops, message cards staggered, plus the existing meter/loader.
4. **Reschedule flow** (was: "Book another slot" → empty page). The booking page
   now has a reschedule mode for BOOKED students: current-booking summary card,
   grid of alternative slots ("Move here"), and the success card's button reads
   "Reschedule this interview". Backend: `POST /api/interviews {action:
   "reschedule", newSlotId}` — releases the old slot, moves the booking, resets
   the link (fresh acceptance needed), audits RESCHEDULE.
5. **Past activity tab** in the interviewer console (`PAST ACTIVITY · N`):
   completed/cancelled/no-show interviews with the recorded outcome (result
   pill, feedback, recorder, date) and an "only recorded by me" filter.
6. **Capacity stepper** — the publish-availability form's native `<input
   type=number>` spinners (unstyled, tiny) replaced with chunky `−`/`+` stamp
   buttons (`.btn-step`) and a tabular display box, clamped 1–4.
7. **Video rooms with interviewer acceptance** (the "real meet link" request —
   done honestly): new bookings now start **link-less** and are surfaced as
   "⏳ booking request" on the interviewer console. The interviewer presses
   **"✅ Accept & send video link"** → `POST /api/interviews {action:"accept"}`
   mints a **free live video room** (`https://meet.jit.si/grit-…` — Jitsi Meet,
   no API key, the link genuinely opens a working room) and it appears on the
   student dashboard immediately. Student dashboard shows a live
   "AWAITING INTERVIEWER CONFIRMATION" state until then. Production swap
   (stated in Loom): Google Calendar API to mint real meet.google.com links
   behind the same route. → eval S35–S36.
8. Eval grown 35 → **38 scenarios** (S35 link-less booking, S36 accept +
   role-gate + double-accept, S37 reschedule incl. past-slot guard).
9. Ops desk EXIT also upgraded to real logout.

## 9. How to run

```powershell
npm install
npm run dev          # backend :4000 + frontend :3000
npm run eval         # 38-scenario verification (must be green after every build)
npm run eval:no-ai   # CI-safe variant
npm run build        # backend tsc + frontend next build
```

Logins — student: `aarav.s@niat.edu.in`; interviewer: `kavya.rao@niat.edu.in`;
admin: `ops@niat.edu.in`. Data resets to golden via eval, `POST /api/reset`, or
the eval pipeline's first step. **Manual QA script: `TESTING_GUIDE.md`** —
reset first (`POST /api/reset`) so the walk-through starts from golden state.

## 10. Edge cases handled (all asserted by the eval pipeline)

| Edge case | Backend guard | Eval |
|---|---|---|
| Past/full slot | `bookingCheck` | S09/S16 |
| Double-booking + overlap | `bookingCheck` | S07 |
| Not-eligible / cooldown / 2× no-show lock | `effectiveState` | S10–S12 |
| 1× no-show may rebook (policy) | `effectiveState` | S13 |
| Interviewer cancels slot after bookings | slots/cancel cascade | S23 |
| Cancel reopens capacity | interviews cancel | S22 |
| Retroactive nullification (admin-only, once) | badges/nullify | S24–S26 |
| Role gates (student vs staff vs admin) | auth.ts | S08/S21/S25/S32 |
| Missing outcome feedback | outcomes route | S19 |
| Wrong-door login (student at staff entrance) | auth login `expects` | S33 |
| Transcripts ship in snapshot | db load + snapshot | S34 |
| New bookings start link-less (awaiting acceptance) | booking route | S35 |
| Student can't self-accept; staff accept mints live room | interviews accept | S36 |
| Reschedule releases old slot; past-slot guard | interviews reschedule | S37 |
| Audit completeness + state invariants | snapshot | S27–S29 |

## 11. Known simplifications (state them in the Loom)

- Mock sessions (base64 in header/localStorage) — swap for SSO/JWT/RBAC.
- JSON store with in-process cache — swap for Postgres; capacity race needs a
  transactional constraint (`booked_count < capacity` inside the booking txn).
- Cooldowns derived on read — production would materialize via scheduled job.
- Next rewrites stand in for a reverse proxy; meeting links are decorative.
- Single timezone (`YYYY-MM-DD` + `HH:MM` strings); production: `timestamptz`.

## 12. Memory pointers for the next session

- **Never** mutate outside `withDb()`; always `audit()` actor decisions.
- New screens: wrap in a theme class, fetch `useSnapshot()`, call `callApi()`.
- Adding a feature = add API route → add eval scenario → then UI.
- Always give new pages the sticky `sticky-head` header + a `BackLink` — the
  missing-back-nav complaint (v2.1) must not regress.
- Transcripts live in the golden dataset; `snap.transcripts` powers the
  console's "📋 Load sample transcript" button (keyed by `interviewId`).
- The 3 student messages live in `portal/page.tsx → Messages` (Deliverable 3).
- Before/After toggle: boolean in `portal/page.tsx`; "before" hides the interview
  card + messages deliberately.
- Golden dataset fields use date tokens — keep it that way; eval asserts real dates.
- If ports are stuck: `Get-NetTCPConnection -LocalPort 3000/4000 → Stop-Process`.
- **`npm run build` clobbers the dev server's `.next`** (same folder) — after a
  production build while `next dev` is running, pages 500 with
  `Cannot find module './xxx.js'`. Fix: kill :3000, delete `frontend/.next`,
  restart `npm run dev`. Not a code bug — don't hunt one.
- Never call `router.push()` inside a `setState` updater (countdown timer
  pattern) — React throws "Cannot update a component while rendering". Tick
  the number in one effect; redirect from a separate effect watching it.
- Eval file is plain `.mjs` — no TypeScript syntax (`(x: any)` crashes node).
