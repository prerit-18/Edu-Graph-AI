> **Historical document:** this audit describes the project BEFORE the fixes; see docs/FINAL_REPORT.md and docs/CHANGES.md for the current state.

# Report A — Executive Project Audit: EduGraph AI

Audit date: 2026-11-12. Evidence labels: **[V]** verified by running code, **[S]** verified by reading source, **[A]** assumption/recommendation.

## 1. What the project actually is
A Node/Express + SQLite + static-HTML web app for GATE CSE preparation. A student signs up, sees a 27-topic / 5-subject syllabus, reads concept explanations, solves a small bank of 23 previous-year questions (PYQs), does free-text "Active Recall", reviews "Smart Flashcards" (3 strong + 2 weak topic cards), takes a mock test, and sees a dashboard. A Bayesian Knowledge Tracing (BKT) update per topic is the learner model that drives revision ranking, flashcard selection and recall-topic selection.

What it is **not** (today): a RAG system over uploaded documents; a true multi-agent system; a production-ready product. See sections 4–5.

## 2. Actual architecture [S]
- **Frontend**: 10 static HTML pages + `app.js` (auth helper, `apiCall`) + `tutor_speech.js` (browser Web Speech TTS). No framework, no build step. Token in `localStorage`.
- **Backend**: `backend/app.js` → `routes/router.js` → 10 route files → `agents/orchestrator.js` → `agents/crew.js` (a *hand-written* Agent/Task/Crew shim) → per-agent "runner" classes.
- **Optional Python CrewAI path**: `agents/crewai_bridge.js` spawns `python3 crewai/crew_runner.py` **per request** (45 s timeout) for 4 task types (`concept`, `pyq`, `solve`, `recall_grade`); on any failure it falls back to the JS runner.
- **DB**: SQLite (`better-sqlite3`, WAL, FKs ON), 8 declared tables + `response_cache`, `token_logs` created lazily by services.
- **"Vector DB"**: a JSON file `data/chroma/vector_index.json` (394 KB) scanned linearly. `chromadb` is in `package.json` but is never `require`d anywhere.
- **LLM**: raw `fetch` to Gemini/Groq/OpenAI/OpenRouter in `agents/llm_client.js` (provider auto-detected). Returns `null` when no key → silent fallback to hardcoded text.

## 3. Technology stack
Node v24, Express 4, better-sqlite3, bcryptjs, jsonwebtoken, mathjs, dotenv; Python crewai 1.15.20 (installed on this machine); Gemini key present in `backend/.env` (not exercised in my tests); browser Web Speech API for TTS (ElevenLabs optional).

## 4. Feature status (summary; detail in Report C)
| Area | Status |
|---|---|
| Auth (signup/login/me) | Works, weak validation |
| Syllabus + prerequisite status | Works |
| Concept Study | Works for ~12 hardcoded topics; generic template otherwise; weak off-topic guard |
| PYQ / Problem Solver | **Broken for 6 of 23 PYQs** (FK crash) |
| Active Recall | Works; 3-attempt rule is front-end only; answer leaks in API |
| Smart Flashcards | Genuinely BKT-driven; verified 3 strong + 2 weak |
| Mock Test | **Broken on submit** for any test containing an orphan-topic PYQ (≈ every test); CN/Compiler never offered |
| Dashboard | Works; unseen topics counted as 0 % (BKT prior is 30 %) |
| Revision | Works but recommends *unseen* topics over the student's weak, just-failed topics |
| Interview Agent | **Not implemented** |
| Doubt Debugger Agent | **Not implemented** (only a "quick actions" prompt router) |
| Document upload / textbook RAG | **Not implemented** |

## 5. Test results (what I actually ran)
- `npm test` (temp DB, LLM keys blanked): **6 of 7 suites pass; `active_recall.test.js` FAILS** — the test expects a BKT update after a *first* wrong attempt, but the code (intentionally) only updates BKT on correct or 3rd wrong attempt. Test is stale vs. code. [V]
- Scripted 15-step student journey (`audit` scratch script): findings in Report D. [V]
- `evaluation/run_eval.js`: 5/5 — but only 5 cases; not meaningful evidence. [V]
- `npm audit --omit=dev`: 4 vulnerabilities (1 critical `proxy-addr`, 2 high `body-parser`/`mathjs`, 1 moderate `qs`). [V]
- **Not run**: live LLM calls (would cost/leave the machine), CrewAI with a real LLM, real browser/mobile rendering (static check only: only 3 `@media` rules; `concept/pyq/solver.html` are redirect stubs), load testing. No frontend build exists.
- Side effect to disclose: after my runs `git status` shows `data/edugraph.db-shm` modified. Most likely the Python CrewAI tools open the hard-coded `data/edugraph.db` (ignoring `DB_PATH`). I did not intentionally read or write that DB's contents.

## 6. Major issues (top-level)
1. FK crash: 6/23 PYQ `topic_id`s do not exist in `topics` → solver and mock-submit return HTTP 500.
2. RAG is a hashed bag-of-words with a lexical-overlap heuristic, not embeddings; off-topic "neural network backpropagation" is judged *grounded*.
3. "Multi-agent" = 7 single-agent crews; no agent talks to another; Interview and Doubt Debugger agents don't exist.
4. Hardcoded fallback explanations are returned as `grounded: true, confidence 0.9/0.95` — fabricated confidence.
5. Active Recall's answer-reveal rule is client-side; the API returns `referenceAnswer` on every attempt and trusts a client-supplied `attemptNumber`.
6. Auth is optional on learning endpoints; `/api/agents/token-report` is public; committed default JWT secret; no rate limiting.
7. DB seeding is manual (`node database/seed.js`); a fresh clone has zero topics.

## 7. Overall assessment
A well-organised **prototype/MVP** with a real, correctly-implemented BKT core and a genuinely personalised flashcard selector, wrapped in a lot of fallback/template code that makes several features look more "AI" than they are. It is demo-able along a *narrow* path (OS/Algo topics with valid PYQ ids, no-LLM or Gemini mode) but not yet a reliable end-to-end product. Honest label for a viva: **"BKT-driven adaptive practice platform with LLM-assisted explanations and a lightweight lexical retrieval layer"**.
