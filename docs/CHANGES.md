# EduGraph AI - Minor Project completion report (phase 1)

> Later work (central Gemini service, daily flashcards, dynamic Active Recall, official-key integrity, embeddings, cleanup) is in [FINAL_REPORT.md](FINAL_REPORT.md).

Verified with: `cd backend && npm test` -> **10 suites, 10 passed** (throw-away DBs, LLM keys blanked), `npm audit --omit=dev` -> **0 vulnerabilities**,
a migration dry-run on a *copy* of the existing database, a real-browser pass (Chrome pane) over signup, dashboard, PYQ practice,
Active Recall, Mock Test and a 375 px mobile layout check, and a small live Gemini/CrewAI run (details below).

## 1. Agents (Minor project: 7 active; Doubt Debugger and Interview reserved for the Major project, not created)
| Agent | What changed | Verified by |
|---|---|---|
| Syllabus | Official syllabus text + 46 topics / 11 subjects from `syllabus.json`; readiness distinguishes "not attempted" from "low mastery"; status via BKT | api_flow, e2e |
| Concept Teacher | Concept-strategy retrieval, refusal when ungrounded, related PYQs (separate from the explanation), CrewAI crew -> direct LLM -> stored note -> labelled syllabus text; cache before any LLM call | agents, api_flow, live run |
| PYQ Analyst | All numbers computed from the question bank; no invented years/rates; LLM only for >= 3 questions; flags thin data | agents, api_flow, live run |
| Problem Solver | Deterministic grading (MCQ/MSQ/NAT-range) against the stored key; key/explanation hidden until answered; AI derivation only when no stored solution, cross-checked against the key; custom problems unverified and never touch BKT | api_flow, e2e, pipeline test |
| Revision | Only attempted topics; needs >= 2 attempts to classify; uses `revision_schedule`; attaches unattempted PYQs; explicit "insufficient data" | agents, api_flow |
| Mock Test | Persisted tests, keyed questions only, no repeats, GATE marking, submit-once, per-user, history/report endpoints | agents, api_flow, browser |
| Active Recall | 3 attempts enforced server-side (`recall_attempts`), reveal only at completion, BKT once, 409 after completion, prompts bound to their owner | active_recall test, browser |

CrewAI: `crew_runner.py` is now a single generic runner (stdin JSON -> one marked result line), 1 agent / 1 task / sequential per call, calculator tool for the solver,
provider-reported token usage returned. Gemini is reached through its OpenAI-compatible endpoint because CrewAI 1.15 needs an extra Google package for `gemini/` models.
Removed: duplicate hardcoded explanation templates in Python, the unused FastAPI `server.py`, the double execution of the solver, the per-request Python RAG duplicate.

## 2. Bugs fixed
1. 6/23 PYQs referenced non-existent topics -> HTTP 500 in solver/mock (ids fixed; importer + test guard; `recordAttempt` now returns 400).
2. 3 wrong answer keys in the practice set (os_2025_001, cn_2024_001, dbms_2025_001) corrected.
3. Mock test: subject-name mismatch (0 questions), CN/Compiler never loaded, submit crash, client-chosen questions, repeat submissions.
4. Active Recall: answer leaked on attempt 1, client-controlled attempt counter, unused idempotency key, stale test.
5. Fake `grounded:true / confidence 0.9-0.95` and out-of-domain acceptance ("neural networks").
6. Revision ranked never-seen topics above just-failed topics; dashboard counted unseen topics as 0 %.
7. `seed.js` used `INSERT OR REPLACE` + `DELETE` which cascades away learner progress; now upsert-only and run at start-up.
8. Hardcoded public JWT secret; optional auth on learning routes; public token report; no rate limits; open CORS; unvalidated signup (password "x", invalid email, case-sensitive duplicates).
9. XSS: LLM/user text was injected via `innerHTML` (`esc()` + escape-first markdown); `javascript:` links removed.
10. Mobile: navigation was hidden below 768 px; fixed-width exam grid; no overflow at 375 px now (checked on 6 pages).
11. Stale RAG index (never rebuilt when data changed) -> fingerprinted, auto-rebuilt.
12. Smart-flashcard "Got it" message claimed mastery; now says self-ratings do not change mastery.
13. Dependency vulnerabilities (1 critical, 2 high, 1 moderate -> 0); unused `chromadb` removed.
14. Tests ran in parallel against the real DB (the existing `data/edugraph.db` holds 97 users, probably mostly from earlier test runs - not verified); now one temp DB per file, sequential.
15. Tracked binary DB side files (`-shm`, `-wal`) and a runtime cache removed from git tracking.

## 3. Features completed
PYQ Practice page (year/subject/topic/type/difficulty/source filters, MCQ/MSQ/NAT inputs, official-key grading, solution, attempt tracking), mock-test setup filters + MSQ/NAT + review screen,
server-driven Active Recall UI, solver fed from the question bank, concept answers with related PYQs and "offline note" labels, dashboard "not started / needs more data" states,
revision suggestions with PYQ links, GATE ingestion pipeline + review queue, held-out retrieval evaluation.

## 4. APIs
New: `GET /api/pyq/filters`, `GET /api/pyq`, `GET /api/pyq/:id`, `POST /api/pyq/:id/attempt`, `GET /api/recall/state/:promptId`, `GET /api/mock/history`, `GET /api/mock/report/:testId`.
Changed: `/api/recall/grade|submit` (body `{promptId, studentAnswer}`; response has `attemptNumber, attemptsRemaining, completed`), `/api/mock/start` (filters, persisted) and `/submit`,
`/api/agents/solve` (`reveal`, new response fields), `/api/agents/concept` (`relatedQuestions, generatedBy`), `/api/revision/schedule`, `/api/learner/dashboard` (statuses, `null` averages),
`/api/agents/token-report` (admin only). Auth is now required on all learning routes; `/api/syllabus/*`, `/api/tts/config|normalize` stay open.

## 5. Database changes (all migrated idempotently; verified on a copy of the existing DB: 97 users / 184 attempts / 93 mastery rows preserved)
New tables `papers`, `questions`, `ingest_review_queue`, `recall_attempts`, `mock_tests`; new columns `mastery.n_attempts/n_correct`, `recall_prompts.user_id`, `attempts.source/question_id`,
`token_logs.usage_source/via`; indexes on `attempts(user_id, created_at|topic_id)` and `questions`.

## 6. BKT and personalisation
Standard BKT recursion unchanged (P(L0)=.30, P(T)=.15, P(S)=.10); guess probability now depends on format (MCQ .25, MSQ .07, NAT .03, recall .10 with slip .15). Updates are transactional, validate the topic, keep attempt counters.
`statusFor(p, n)` (insufficient_data < 2 attempts, weak < .50, learning, strong >= .65, mastered >= .75) is shared by dashboard, revision and syllabus; flashcards keep their own identical thresholds.
Smart Flashcards were already BKT-driven; verified 3 strong + 2 weak with honest fallback reasons. Self-ratings never update BKT. Parameters are textbook defaults, not fitted to data.

## 7. RAG
Chunker with overlap, BM25 + hashed char-n-gram hybrid, per-task strategies (concept / summary / pyq / solution / revision) with own sources, K and context budget, metadata filters, source-typed citations
(official vs practice), fingerprinted auto-rebuild, grounding gate calibrated on the tuning set only. Still lexical, no neural embeddings, no document upload.

| Evaluation set | n | grounding accuracy | false positives | topic@1 |
|---|---|---|---|---|
| tuning (test_cases.json) | 42 | 100 % | 0 | 27/28 |
| held-out 1 (misses seen earlier) | 22 | 81.8 % | 0 | 12/14 |
| held-out 2 (not used for tuning) | 20 | **85.0 %** | 0 | 7/10 |
(measured with the 8 real papers in the index; threshold re-set from the tuning set only after adding them; General Aptitude questions are excluded from the index)
Weak spot: natural-language paraphrases ("how does the ethernet protocol avoid collisions") are sometimes refused or mapped to the wrong topic. Neural embeddings would be the real fix.

## 8. Token / cost (single live run on `gemini-2.5-flash`, n = 1 per row, provider-reported tokens)
| Call | input | output | latency |
|---|---|---|---|
| Concept (cold) | 349 | 674 | 4.9 s (first attempt hit a 503, retried) |
| Same concept, reworded (cache) | 0 | 0 | 0 ms |
| Solver, custom problem | 206 | 538 | 3.7 s |
| Recall question generation | 275 | 501 (truncated at the old 512 limit -> limit raised to 900, not re-measured) | 3.3 s |
| Recall grading | 210 | 105 | 1.5 s |
| CrewAI crew (semaphore, via Node bridge) | 172 | 72 | 6.2 s wall (incl. Python start) |
No before/after comparison against the old code was measured, so no saving percentage is claimed. What changed structurally: cache check before any LLM call, no double solver execution, no Python RAG duplicate,
in-flight de-duplication, 30 s timeout + one retry, API key in a header, `LLM_MODEL_FAST` routing (unset by default, so no routing saving yet).
The Gemini free-tier quota (HTTP 429) was exhausted during the second live run; all agents degraded gracefully (labelled fallbacks) which is itself evidence the error paths work.

## 9. Not done / limitations
* **Official papers ingested: 2022-2026 (8 papers, 446 questions stored).** 2021 needs OCR; 2017-2020 were not on the official page. See docs/GATE_DATA.md. This is retrieval/practice indexing, not model training.
* No OCR, no figure extraction; difficulty is a marks proxy.
* Retrieval is lexical; BKT parameters are defaults; Smart Flashcards still draw from a static card bank.
* Live LLM paths were exercised only briefly (n=1 per agent); the CrewAI path was verified for the concept role only.
* Quick Formula Evaluator in `study.html` still uses `Function()` on a sanitised string.
* Not tested: iOS/Android devices, load, a real deployment.

## 10. Setup changes you must make
1. Put a strong `JWT_SECRET` in `backend/.env` (`openssl rand -hex 48`); your current value equals the old public default, so the server now ignores it and uses an ephemeral secret (everyone is logged out on each restart).
2. Optional: `ADMIN_EMAILS`, `LLM_MODEL_FAST`, `CORS_ORIGIN`, `USE_CREWAI`, `PYTHON_BIN` (see `.env.example`). `pip install -r backend/crewai/requirements.txt` for CrewAI.
3. Rotate the Gemini key if `.env` was ever shared.
4. Deployment: `npm ci --omit=dev && npm start` behind HTTPS reverse proxy; persist `data/`; set `DB_PATH`; run `npm run seed` once if you prefer explicit seeding.

## 11. Files
Backend: `app.js`, `middleware/{authRequired,rateLimit}.js`, `routes/*`, `agents/*`, `crewai/*`, `rag/*`, `services/{question_bank,agent_prompts,token_monitor}.js`, `tools/*`, `knowledge_tracing/bkt.js`, `database/{schema.sql,db.js,seed.js}`, `package.json`, `.env.example`.
Frontend: `app.js`, `styles.css`, `pyq.html` (new), `study.html`, `mock.html`, `recall.html`, `dashboard.html`, `flashcards.html`, `login.html`.
Data/tools: `data/pyq/*`, `data/syllabus/syllabus.json`, `data_pipeline/gate_ingest.py` (new), `evaluation/*`, `docs/*`.
Tests: `tests/{setup,http_helper}.js`, new `api_flow`, `gate_pipeline`, `rag_eval`, `fixtures/make_fake_gate_pdf.py`; rewritten `active_recall`; updated `agents`, `e2e`.
