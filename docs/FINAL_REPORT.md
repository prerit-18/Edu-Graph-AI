# EduGraph AI - Final implementation report (Minor Project)

Verified state: `cd backend && npm test` -> **14 suites, 14 passed** (throw-away SQLite DBs, Gemini stubbed, no network); `npm audit --omit=dev` -> **0 vulnerabilities**;
every inline script / JS / Python file compiles; real-browser checks (signup, dashboard, PYQ practice, Active Recall, mock test, Smart Flashcards resume, 375 px layout);
live Gemini checks listed in section 4. Nothing is committed.

## 1. Gemini integration (one central service: `backend/agents/llm_client.js`)
* Key only from `backend/.env`, sent in the `x-goog-api-key` header, never in URLs/logs/frontend; `/api/health` exposes provider, models and last error **code** only.
* Start-up check (`validateConfig`): lists models with the key and confirms the routed models exist. Verified live: `{"ok":true,"missingModels":[]}`. Available models were checked through the API (e.g. `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-embedding-001`; the API also lists 3.x previews, not used).
* Capabilities: `generate`, `generateOrThrow`, `generateJSON` (schema + validator + one repair), `embed`. Used by every agent/service (concept, PYQ explanation, flashcards, recall generation/grading, summaries).
* Errors are typed: `NO_KEY, INVALID_KEY, QUOTA, RATE_LIMIT, TIMEOUT, NETWORK, SERVER, BAD_REQUEST, BLOCKED, MALFORMED, VALIDATION`. Retries only for 429/5xx/network, at most `LLM_MAX_RETRIES` (default 2, hard cap 3) with exponential backoff / `retryDelay`. `INVALID_KEY` disables calls until restart; `QUOTA`/`RATE_LIMIT` open a cool-down (fail fast). Identical concurrent prompts share one request. No failure ever returns a fabricated answer: callers either use a **labelled** fallback (`generatedBy`, `aiNotice`, `evaluatedBy`, `generation`) or return 503 and persist nothing.
* Routing: complex model (`gemini-2.5-flash`) for explanations, flashcard generation and recall generation; fast model (`gemini-2.5-flash-lite`) for quick doubts, recall grading and PYQ insight. Flashcards were first routed to the fast model: live runs showed it returning wrong arithmetic that the validators rejected, so they now use the stronger model.
* Verified live against the real API: invalid key -> `INVALID_KEY` and calls blocked; quota exhaustion -> `QUOTA`, fallbacks labelled (this happened on the project's key after the live tests).
* CrewAI: used for Concept Teacher, PYQ-Analyst narrative and the provisional (no-key) solver path (`USE_CREWAI=true`, Gemini through its OpenAI-compatible endpoint). Flashcards, recall, official-key explanations and embeddings use direct structured Gemini calls because they need strict JSON validation; a crew adds latency and tokens without adding capability there.

## 2. The three mandatory requirements

### 2.1 Daily Smart Flashcards (`services/daily_flashcards.js`, tables `fc_daily_sessions`, `fc_daily_cards`)
* One session of 5 cards per user per **local day**: `UNIQUE(user_id, session_date)`, date from the user's IANA timezone (`users.timezone`, `POST /api/auth/timezone`, `?tz=`).
* 3 strong + 2 weak chosen from real BKT/attempt data (`smart_flashcards.classifyTopics`); topics used in the last 3 days are rotated out, seeded shuffle per user+day. With too little data the mix changes **transparently**: slots are filled by `learning`, `early_practice`, `new_topic` topics, labelled as such, with the reasons stored/shown (a brand-new learner gets 5 `new_topic` cards, none called strong/weak).
* One structured Gemini call, grounded in the syllabus entry + one reference PYQ per topic + "avoid" list; schema-constrained; validated deterministically (schema, lengths, no "GATE 20xx"/question-number claims, arithmetic `calc` check with mathjs, relevance to the topic vocabulary, duplicate and near-duplicate (Jaccard >= 0.8) vs the learner's history). Only failing cards are regenerated (one extra call); anything still failing -> 503 and **nothing is saved**. Cards are always `origin = ai_generated_practice`, never presented as PYQs; "Got it" never touches BKT.
* Persisted session: refresh/return restores the same cards, feedback and resume position; completed sessions show their summary. Concurrency: in-process single-flight + DB constraint + stale-`generating` recovery. Gemini down: previously validated cards for the same topics (not seen by the learner) are reused and labelled `reused_validated`, otherwise 503.
* Replaced: the static card bank / fixed "daily deck" (`flashcard_generator.js`, its routes and UI tab).
* **Tested** (`daily_flashcards.test.js`): timezone dates, new-learner fallback, 1 call per session, refresh x3 = 0 calls, 8 concurrent first requests -> 1 session + 1 call, DB UNIQUE rejection, exactly 3 strong + 2 weak from BKT, feedback/resume/completion, BKT unchanged by "Got it", next day (injected clock) -> new session + new questions + 1 new call, invalid key / quota / network / malformed JSON / PYQ impersonation / wrong arithmetic -> 503 with nothing persisted, retry after outage -> exactly one session, reuse fallback. **Live**: real Gemini produced the 3+2 session (845 input / 1,363 output tokens, ~7 s) and a refresh returned it with 0 calls; browser reload resumed at card 3 with feedback kept.

### 2.2 Official PYQ answer-key integrity (`question_bank.officialKeyRecord`, `problem_solver.explainOfficialAnswer`)
Official question DB -> key lookup -> provenance check (key must belong to the paper/year/question number in the id; otherwise not shown as official) -> Gemini gets question + official key + supporting syllabus text and returns `{explanation, final_answer}` -> `final_answer` is checked with the deterministic MCQ/MSQ/NAT logic against the key; a disagreeing explanation is **discarded** (the key is still shown) -> response keeps `official{answer, source{year, paper, session, question_no, key_url, key_version}}` separate from `aiExplanation`. Valid explanations are cached per key version.
* No key -> `answerStatus: unverified`, not graded, no BKT, provisional AI solution labelled "AI-generated, unverified". Practice-set keys are labelled "not an official GATE key".
* Revised keys: `answer_key_revisions` keeps every version; the live key is the latest; `reviseKey()` and re-ingestion bump the version; cached explanations for the old key are not reused.
* **Tested** (`pyq_key_integrity.test.js`, 10 groups incl. contradicting MCQ and NAT explanations, MSQ/NAT-range keys, missing key, tampered provenance, revision, outage). Not live-verified after the key's quota ran out (stub-verified).

### 2.3 GATE knowledge base = structured DB + RAG (no fine-tuning)
PDF -> extraction (pdfplumber/PyMuPDF; OCR not installed) -> question/option/type detection -> official key mapping -> subject/topic classification -> validation/duplicates -> SQLite (`papers`, `questions`, `ingest_review_queue`) -> index chunks (syllabus, official syllabus, questions; General Aptitude excluded) -> **Gemini embeddings** (`gemini-embedding-001`, `chunk_embeddings`) -> BM25 + character n-gram + embedding retrieval. Exact filters (year/subject/topic/type/difficulty/origin) are plain SQL; conceptual lookup (`/api/pyq/search`, Concept Teacher) is semantic. Nothing is trained or fine-tuned; only ingestion and retrieval.
* Retrieval quality with real embeddings (`evaluation/run_semantic_eval.js`; gate calibrated on the tuning set only):

| Set | n | lexical grounding / topic@1 | semantic grounding / topic@1 | false positives |
|---|---|---|---|---|
| tuning | 42 | 100% / 27 of 28 | 100% / 27 of 28 | 0 |
| held-out 1 | 22 | 81.8% / 12 of 14 | 100% / 14 of 14 | 0 |
| held-out 2 | 20 | 85.0% / 7 of 10 | 100% / 8 of 10 | 0 |
Small sets: indicative, not a benchmark. 463/463 chunks are embedded in `data/edugraph.db` (463 embedding calls; `npm run embed` is resumable if the corpus changes).

## 3. Feature verification

| Feature | Implementation | Test result | Remaining issues |
|---|---|---|---|
| Auth + timezone | bcrypt, JWT (no default secret), validation, rate limits, `/auth/timezone` | api_flow, e2e pass; browser signup OK | JWT in localStorage |
| Syllabus | 46 topics/11 subjects + official text from `syllabus.json` | api_flow, e2e | topic weights are provisional |
| Concept Study | grounded retrieval (semantic when embedded), refusal, related PYQs, CrewAI/Gemini, `aiNotice` | agents, api_flow, semantic; live earlier | live recheck after quota reset |
| Learning actions | 8 actions (explain, quick revision, example, exam traps, **solve PYQ = stored question, never invented**, test me, flashcards, ask a doubt) | semantic_retrieval test | "Ask a doubt" is a short Concept Teacher Q&A; Doubt Debugger stays reserved |
| PYQ practice | filters, MCQ/MSQ/NAT, official key + AI explanation separated, semantic search | api_flow, key_integrity, browser | topic labels unaudited |
| Problem solver | key-validated explanations, provisional labelled | key_integrity | - |
| PYQ analytics | `/api/pyq/analytics`: topic counts/shares, subject distribution, year trends, type mix | run on real papers | counts exclude 74 review-queue questions; 2024-26 have 2 papers/yr |
| Active Recall | dynamic grounded generation (level, past mistakes, PYQ style), numeric check in code, semantic grading vs validated reference, 3 server-side attempts, persisted | active_recall(_dynamic) pass | generator/grader not live-verified after quota |
| Smart Flashcards | section 2.1 | daily_flashcards pass, live + browser | needs quota (1 call/day/user) |
| Mock tests | persisted, keyed questions, GATE marking, no repeats | api_flow, browser | - |
| Dashboard / revision | statuses from BKT, "needs more data", PYQ suggestions | api_flow, e2e | - |
| Admin usage | `/admin.html` + `/api/agents/token-report` (admin only): calls, tokens, latency, est. cost by feature/agent/model; provider-reported tokens | api_flow (403 for non-admin) | cost constants are estimates |
| TTS tutor | browser speech | speaking_tutor pass | - |

## 4. Agents

| Agent | Role | Gemini integration | Knowledge source | Tested |
|---|---|---|---|---|
| Syllabus | curriculum + readiness | none (deterministic) | `syllabus.json` | pass |
| Concept Teacher | focused grounded explanation | CrewAI -> direct JSON/text -> labelled fallback | syllabus + embeddings + related PYQs | pass; live (earlier run) |
| PYQ Analyst | data-based exam patterns | LLM narrative only when >= 3 questions | question bank + analytics | pass; live (earlier run) |
| Problem Solver | grade + explain official keys | structured JSON, consistency-checked | official key + syllabus chunks | pass (stubbed) |
| Revision | weak topics + practice | none | BKT, attempts, bank | pass |
| Mock Test | tests + scoring | none | keyed bank | pass |
| Active Recall | dynamic questions + grading | structured JSON; numeric in code | syllabus, learner history, PYQ style | pass (stubbed) |
Reserved for the Major Project and **not created**: Doubt Debugger, Interview. Extension point: `agents/crew.js` header.

Live Gemini results (n = 1 each, provider-reported tokens): flashcard session 845 in / 1,363 out, 7.1 s; refresh 0 tokens; earlier runs: concept 349 / 674, solver 206 / 538, CrewAI crew 172 / 72; embeddings 463 + ~170 query calls. **Token savings are not claimed**: only measured facts are cache hits (0 tokens) and one-call-per-day flashcards.

## 5. GATE data coverage (unchanged from docs/GATE_DATA.md)

| Year | Papers found | Questions extracted | Verified answers | Unprocessed questions |
|---|---|---|---|---|
| 2026 | CS-1, CS-2 | 130 | 122 | 8 |
| 2025 | CS-1, CS-2 | 130 | 116 | 14 |
| 2024 | CS-1, CS-2 | 130 | 100 | 30 |
| 2023 | CS | 65 | 51 (+1 unverified) | 13 |
| 2022 | CS | 65 | 56 | 9 |
| 2021 | CS (scanned) | 0 | 0 | whole paper (OCR needed) |
| 2017-2020 | not on the official page | 0 | 0 | - |
446 stored (445 verified). Insights from them, e.g. most questions in Parsing (23), Logic/Sets (22), C programming (19) and per-year type mixes, are served by `/api/pyq/analytics`; they are counts over stored questions, with the caveats shown in the API.

## 6. Removed / consolidated
`flashcard_generator.js` (+ cache file, routes, daily-deck UI), `concept.html` and `solver.html` redirect stubs, two identical unused `bg.png`, stale `data_pipeline/{ingest_papers,indexer,build_rag}`+example file, JS `calculator_tool.js` (the CrewAI calculator is the real tool), `retrieveCompact`, the unused `uuid` dependency, FastAPI `server.py`, hardcoded curated-answer duplicates in Python. Each was checked for references first. Legacy `smart_fc_*` tables are kept (no student data deleted) and marked legacy.

## 7. Remaining limitations
2021 needs OCR; 2017-2020 not obtained; figure questions are queued, not served; topic labels are a keyword classifier; BKT parameters are defaults; the 18-step journey is covered by the e2e + flashcard + recall + key tests rather than one long script, and "next day" is tested with an injected clock; the Gemini free-tier quota of the configured key was exhausted during testing, so recall generation/grading and official-key explanations were verified with a Gemini stub, not live; no mobile-device or load testing; JWT secret must be set (see below).

## 8. Setup and deployment
1. `cd backend && npm ci && cp .env.example .env`; set `JWT_SECRET` (`openssl rand -hex 48`), `GEMINI_API_KEY`, optionally `ADMIN_EMAILS`, `LLM_MODEL`, `LLM_MODEL_FAST`, `USE_CREWAI`.
2. `pip install -r crewai/requirements.txt` (CrewAI path only), `pip install -r ../data_pipeline/requirements.txt` (ingestion only).
3. `npm start` (seeds syllabus, imports `data/pyq` + `data/gate_papers/processed`, validates the key). `npm run embed` after ingesting new papers.
4. Production: HTTPS reverse proxy, persistent `data/`, `CORS_ORIGIN` only if the UI is hosted elsewhere, rate limits via `RATE_LIMIT_*`.
5. Change log of the earlier phase: `docs/CHANGES.md`; ingestion details: `docs/GATE_DATA.md`.
