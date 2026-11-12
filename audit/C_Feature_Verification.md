> **Historical document:** this audit describes the project BEFORE the fixes; see docs/FINAL_REPORT.md and docs/CHANGES.md for the current state.

# Report C — Feature Verification

Status vocabulary as requested. "Verified" = I executed the path against a temp DB with LLM keys blank (so the **no-LLM fallback path** was tested; the live-Gemini path was *not*).

| Feature | Frontend | Backend | Database | Actual status | Issues |
|---|---|---|---|---|---|
| Signup / login / me | `login.html`, `app.js` | `routes/auth.js` | `users` | **Fully implemented and verified** (bcrypt cost 10, JWT 7 d) | Accepts password `"x"` and email `"not-an-email"` (HTTP 201); no email normalisation (case-sensitive dupes); no rate limit |
| Demo login | `app.js:quickDemoLogin` | same | `users` | Works | Hardcoded credentials auto-created in whatever DB is live |
| Syllabus & prerequisites | dashboard/study | `routes/syllabus.js`, `agents/syllabus_agent.js` | `topics`, `mastery` | **Fully implemented and verified** | Readiness uses p_know 0.0 for unseen topics; seeding is manual; every call writes an `agent_logs` row |
| Concept Study | `study.html` | `routes/agents.js /concept` → `concept_teacher.js` / python | `agent_logs`, `response_cache` | **Partially implemented** | ~12 topics answered from hardcoded text; other in-domain queries get a "Found Verified Knowledge Chunks" dump; off-topic *neural networks* judged grounded (0.9); citations empty on python path |
| Quick actions | study.html | `routes/quick_actions.js` | – | Works (prompt presets) | Default topic "CPU Scheduling"; this is the only "Doubt" feature |
| PYQ analysis | `study.html` | `pyq_analyst.js` / python | – | Partially implemented | Only 23 PYQs; `pyq_tool` loads just os/algorithms/dbms (networks+compiler JSON never loaded in JS) |
| PYQ practice / Problem Solver | `study.html?view=solver` | `problem_solver.js` | `attempts`, `mastery`, `revision_schedule` | **Broken** for 6/23 PYQs | `algo_2023_001/002`, `algo_2022_001`, `dbms_2022_001`, `dbms_2021_001`, `os_2021_001` → `SQLITE_CONSTRAINT_FOREIGNKEY` → HTTP 500. The other 17 work (os_2022_001 wrong → 0.30→0.1932 verified) |
| Active Recall | `recall.html` | `active_recall_agent.js`, `routes/recall.js` | `recall_prompts`, `attempts`, `mastery` | **Partially implemented** | 3-attempt rule only in the browser; API returns `referenceAnswer` on attempts 1–3; `attemptNumber` client-supplied (99 accepted); `idempotencyKey` accepted but unused (30 s same-question window instead); deterministic grader is keyword matching |
| Smart Flashcards | `flashcards.html` (889 lines) | `smart_flashcards.js`, `flashcards.js` | `smart_fc_*`, `mastery` | **Fully implemented and verified** (BKT-driven) | New user: fallback fills (0 strong/1 weak real) — correctly reported in `fallbackReasons`; static knowledge bank; cache file `daily_flashcards_cache.json` committed |
| Mock Test | `mock.html` | `mock_test_agent.js` | `attempts`, `mastery` | **Broken** | Pool = 19 PYQs (os/algo/dbms only); selecting Databases or Computer Networks returns 0 questions (subject-name mismatch "Databases" vs "Database Management Systems"); submit crashes (FK) when any question has an orphan topic — 30-q request → HTTP 500; `testId` never stored/validated; client controls submitted questions; each attempted answer triggers a full BKT step (a 19-question test moves several topics at once) |
| Dashboard | `dashboard.html` | `routes/learner.js` | `mastery`, `attempts` | **Fully implemented and verified** | Unseen topics counted at 0 % (BKT prior is 30 %) → averageMastery 1.4 % after 2 attempts; no pagination |
| Performance tracking (history) | dashboard | `/learner/attempts` | `attempts` | Works | – |
| Knowledge tracing (BKT) | – | `knowledge_tracing/bkt.js` | `mastery` | **Fully implemented and verified** (math), `tests/bkt.test.js` passes | Single global parameter set, no per-topic fitting; no forgetting; no minimum-attempts gate |
| Revision recommendations | dashboard / recall | `revision_agent.js`, `/revision/schedule` | `mastery`, `revision_schedule` | **Partially implemented** | After failing OS topics, top recommendation was `compiler_parsing` (never seen); `revision_schedule.due_at` is computed but the agent ignores it (recomputes its own `isDue`) |
| Smart-flashcard feedback loop | flashcards.html | `/flashcards/feedback` | `smart_fc_feedback` | Works | Feedback ("got it/need practice") does **not** update BKT, only affects sort tie-break (×0.05) |
| AI Speaking Tutor (TTS) | `tutor_speech.js` | `routes/tts.js`, `text_normalizer.js` | – | **Fully implemented and verified** (8 unit checks pass) | Browser TTS only unless ElevenLabs key set; avatar is a static image + CSS |
| Agent workflows / CrewAI | – | `crew.js`, `crewai/*` | – | Partially implemented | See Report B; single-agent crews, no inter-agent flow |
| RAG retrieval | – | `rag/*` | JSON file | **Mock/demo-grade** implementation | Hash-embedding; 50 chunks; no upload |
| Textbook/PDF upload & summarisation | – | – | – | **Not implemented** | Neither UI nor route nor parser exists |
| Interview Agent | – | – | – | **Not implemented** | – |
| Doubt Debugger Agent | – | – | – | **Not implemented** | – |
| Token monitor | – | `token_monitor.js`, `/agents/token-report` | `token_logs` | Partially implemented | Estimates `chars/4`; endpoint is public |
| Evaluation harness | – | `evaluation/run_eval.js` | – | Demo only | 5 cases, 100 % — too small to support any claim |

## Student-journey trace (Phase 6) — where it breaks
| # | Step | Result |
|---|---|---|
| 1–2 | Register + log in | OK |
| 3–4 | Open syllabus, choose OS | OK (prereq warnings shown) |
| 5 | Study "Deadlocks" | OK — served from hardcoded curated text |
| 6–7 | Attempt PYQ `os_2022_001` (deadlock) with wrong answer | OK, 0.30 → 0.1932 |
| 6' | Attempt *other* PYQ (e.g. `algo_2023_002`) | **500 FK error** |
| 8 | Progress updated | OK (`mastery`, `attempts`, `revision_schedule`) |
| 9–10 | Active Recall, 3 wrong attempts | BKT updated only on attempt 3 (0.1932 → 0.1747) as designed; **answer was in the API response from attempt 1** |
| 11–12 | Smart Flashcards | Returns 3 "strong" + 2 "weak", but for this student: strong = *unseen foundational* topics (fallback), weak = deadlock + scheduling (real). Honest `fallbackReasons` returned |
| 13 | Mock test | **500 on submit** |
| 14 | Dashboard | OK but average mastery 1.4 % (unseen = 0) |
| 15 | Revision | Recommends unseen `compiler_parsing` first, not the failed deadlock topic |

Not tested: real browser rendering, mobile layout, live-LLM behaviour.
