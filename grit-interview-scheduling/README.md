# GRIT Interview Scheduling — Quick Start

Production-style monorepo: **two servers** (frontend + backend), **two login-based
sites** (student site / ops site), a **golden dataset**, and an **automated eval
pipeline** that verifies every feature after each build. AI runs 100% locally via Ollama.

## Run it

```powershell
npm install
npm run dev        # backend :4000 + frontend :3000 (concurrently)
```

- **Student site** → http://localhost:3000/login/student — try `aarav.s@niat.edu.in`
- **Ops site** → http://localhost:3000/login/admin — try `kavya.rao@niat.edu.in` (interviewer) or `ops@niat.edu.in` (admin)
- Landing: http://localhost:3000 (two doors)

## Verify it (automated evaluation pipeline)

```powershell
npm run eval          # 38 scenarios vs golden dataset (incl. Ollama AI checks)
npm run eval:no-ai    # same, skipping AI (CI-safe when Ollama is down)
npm run build         # backend tsc + frontend next build
```

## Test it by hand

Follow **TESTING_GUIDE.md** — a ~20-minute click-through of every screen with
expected results, including regression tests for every bug found in review
(wrong-door login, missing back-navigation, booking return path).

## Layout

```
frontend/   Next.js 15 site (:3000) — student site + ops site, custom design system
backend/    Express + TS API (:4000) — state machine, JSON store, Ollama client
golden/     golden-dataset.json — canonical fixture (date tokens: {{TODAY}}, {{T+n}}… + sample interview transcripts)
eval/       run.mjs — 38-scenario verification pipeline (zero deps)
```

## Notes

- After every build: `npm run eval` must be green before you trust the code.
- Reset demo data anytime: ↺ not needed anymore — eval and `/api/reset` both reload the golden dataset.
- Full architecture, decisions, and build history: **BUILD_GUIDE.md** (starts
  with a "context recovery" section — read it first when resuming work).
