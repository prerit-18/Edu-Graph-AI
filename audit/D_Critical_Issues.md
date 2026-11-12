> **Historical document:** this audit describes the project BEFORE the fixes; see docs/FINAL_REPORT.md and docs/CHANGES.md for the current state.

# Report D — Critical Issues

Each: **file → function/API**; problem; why it matters; fix. Items marked [V] were reproduced.

## Critical
**D1. Orphan PYQ topic IDs crash solver and mock submit [V]** — `data/pyq/*/questions.json` vs `data/syllabus/syllabus.json`; `knowledge_tracing/bkt.js:recordAttempt` (FK on `attempts.topic_id`).
Problem: 6 of 23 PYQs use ids not in `topics` (`algo_graphs`, `algo_shortest_paths`, `dbms_sql`, `dbms_rel_algebra`, `os_memory`). Matter: HTTP 500 during demo; a 19-question mock almost always contains one. Fix: normalise ids in the JSON to syllabus ids (e.g. `algo_graphs_mst_shortest_paths`, `dbms_rel_algebra_sql`, `os_virtual_mem`), add a startup/`npm test` check that every PYQ `topic_id` exists, and make `recordAttempt` return a 400 rather than crash.

**D2. Default/committed JWT secret and a live-looking key in `.env` [S]** — `middleware/authRequired.js` (`||` fallback literal), `.env.example` (same literal; your local `.env` uses the identical value). Anyone who reads the repo can forge any user's token. Fix: remove the fallback, fail fast if `JWT_SECRET` is unset, rotate the value, and rotate the Gemini key if `.env` was ever shared (it is git-ignored and was never committed — verified via `git log --all`).

**D3. Fake confidence/grounding [V]** — `crewai/crew_runner.py:synthesize_grounded_concept` (always `grounded` true unless blacklist words) and `run_concept_crew` (`confidence: 0.95`, citation "CrewAI Grounded Knowledge Base"). *Neural networks backpropagation* → `grounded:true, confidence 0.9`. JS retriever alone also false-positives (`overlap 0.33`, score 0.283). Matter: the project's headline "hallucination refusal" claim is unsupported. Fix: single retrieval path (JS or Python, not both); compute grounding from retrieval only; require a minimum lexical overlap ≥ 0.5 *and* a topic keyword in `topics`; remove the blacklist/whitelist of keywords.

## High
**D4. Active Recall answer leak + client-trusted attempt counter [V]** — `active_recall_agent.js:gradeResponse`, `routes/recall.js`. API returns `referenceAnswer` on every attempt; `attemptNumber=99` forces a BKT update; `idempotencyKey` unused. Fix: store `attempts_used` per (user, promptId) server-side; reveal reference only when correct or attempts ≥ 3; delete the client field.

**D5. Optional auth on state-changing endpoints [V]** — `routes/agents.js`, `recall.js`, `mock.js`, `flashcards.js`, `tts.js` use `optionalAuth`. Anonymous callers get full answers (`officialAnswer` returned by `/solve` unauthenticated) and can burn your LLM quota. `/api/agents/token-report` has no auth at all. Fix: `authRequired` on all but `/health`, `/auth/*`, `/syllabus/subjects`; admin-gate token-report.

**D6. No rate limiting, open CORS, no helmet [S]** — `app.js` (`cors()` wide open). 200 KB body is rejected (413) but each LLM call is unmetered. Fix: `express-rate-limit` (per-IP and per-user), `helmet`, restrict CORS origin.

**D7. Mock test integrity [V]** — `mock_test_agent.js`. `testId` not persisted; the client chooses which questions to submit (can submit only known answers; can submit same question many times to inflate BKT). Subject filter mismatch returns 0 questions. Fix: store test (`mock_tests` table) with question ids; score only those; map subjects consistently; update BKT once per topic per test (aggregate), not per question.

**D8. Vulnerable dependencies [V]** — `backend/package.json`: `proxy-addr` (critical), `body-parser`, `mathjs`, `qs`. `npm audit fix` / bump `express` and `mathjs`.

**D9. Python subprocess per request [S]** — `agents/crewai_bridge.js`. Spawns Python and imports `crewai` (seconds) for every concept/PYQ/solve call, bypasses the JS response cache when it succeeds, hardcodes `/opt/anaconda3/bin/python3` (machine-specific), and `crew.js` double-runs the solver. Fix: either long-lived FastAPI service (`crewai/server.py` already exists but is not used) or drop CrewAI for the JS runners; pick one.

**D10. Revision ranks unseen topics above failed topics [V]** — `agents/revision_agent.js:run`. Unseen: `p_know 0` (not 0.30), `daysElapsed = 7` ⇒ priority up to `1·w·2.05`; failed: `0.8·w·1.15`. Result: student who just failed Deadlocks is told to study Compiler Parsing. Fix: use prior 0.30 for unseen, restrict "revision" to topics with `last_seen`, and use `revision_schedule.due_at`.

## Medium
**D11. Stale test hides a design contradiction [V]** — `tests/active_recall.test.js:128` expects BKT on first wrong attempt; code skips it. Decide the rule and update the test (and README, which claims answers are "locked until submission").

**D12. Unseen-topic prior inconsistency [V]** — `learner_state_tool.js:getUserMastery` `COALESCE(m.p_know,0.0)` vs `bkt.js` prior 0.30. Dashboard average and syllabus readiness are understated.

**D13. Weak input validation [V]** — `routes/auth.js` (no email regex, password length, name length), `routes/learner.js` (`limit` unbounded), `mock/start` `count` unbounded.

**D14. XSS surface [S]** — `frontend/*.html`, 44 `innerHTML`; `app.js:formatInlineMarkdown` injects `[text](href)` unescaped (`javascript:` URLs) and LLM/user text unescaped. Fix: escape first, allow-list `https:` links, or use DOMPurify + `marked`.

**D15. JWT in localStorage, no logout invalidation [S]** — acceptable for a prototype; note for viva.

**D16. Token accounting is an estimate [S]** — `token_monitor.js:estimateTokens` = `length/4`. Use `usageMetadata` (Gemini) / `usage` (OpenAI-style).

**D17. Gemini key in URL query string [S]** — `llm_client.js`. Use the `x-goog-api-key` header.

**D18. Binary DB side files committed [V]** — `data/edugraph.db-shm`, `-wal` are tracked and change when the DB is opened; `daily_flashcards_cache.json` too. Add to `.gitignore` and `git rm --cached`.

**D19. Seeding is manual [V]** — `database/seed.js` is never called by `app.js`; fresh clone → empty `topics` → every feature fails quietly. Call `seedDatabase()` at startup (idempotent) — note it currently `DELETE`s topics not in syllabus, which cascades to `mastery`/`attempts`; make it additive.

## Low
- **D20.** `chromadb` dependency unused (`backend/package.json`) — remove or implement.
- **D21.** Duplicated curated explanations in `concept_teacher.js` and `crew_runner.py` (≈400 lines twice). Move to JSON data.
- **D22.** `data_pipeline/ingest_papers.py`, `indexer.py` only print counts; `build_rag.js` is 5 lines — misleading names.
- **D23.** `agent_logs` written on every syllabus view (`syllabus_agent.js`) — noise/DB growth.
- **D24.** `concept.html`, `pyq.html`, `solver.html` lack viewport meta; only 3 media queries — mobile layout unverified.
- **D25.** `Task.description` / `expectedOutput` in `orchestrator.js` are never used by the JS runners (decorative).
- **D26.** `routes/recall.js` `/grade` and `/submit` are duplicated bodies.
- **D27.** Test runner uses the real DB path by default (`tests/*.js` import `backend/app`); a developer running `npm test` pollutes dev data. Use `DB_PATH=:memory:`/temp in the `test` script.

## Token / cost findings (Phase 7 — static analysis; no measurements taken)
- Per-user-action LLM calls (when Gemini is configured): concept = 1 (python crew) ; solve = up to 2 + ≥1 python spawn; recall prompt = 1, recall grade = 1 (+python crew path not wired: `recall_grade` taskType is registered but `executeTask` is not used for recall, so the Python grader is dead code); PYQ analyse = 1; flashcard generate = 1.
- System prompts are short (10–60 words each, `services/agent_prompts.js`); `maxOutputTokens` is capped (512–1024; quick actions 512–2048). History is not sent (stateless) — good.
- RAG context is tiny (topK 2 × ≤200 chars) — cheap, but also weak evidence.
- Cache only protects the JS concept/PYQ paths; the Python path (preferred by `crew.js`) skips it. Moving the cache lookup into `crew.js:executeTask` is the single biggest, easiest saving. **I did not measure before/after; any percentage would be invented.** To measure: enable `token_logs`, replay 50 fixed queries twice, and diff `GET /api/agents/token-report`.
