> **Historical document:** this audit describes the project BEFORE the fixes; see docs/FINAL_REPORT.md and docs/CHANGES.md for the current state.

# Report E — Improvement Roadmap

## P0 — Must fix before the demonstration (≈1–2 days)
1. **Fix PYQ topic ids** (D1): edit the 6 orphan `topic_id`s in `data/pyq/{algorithms,dbms,os}/questions.json`; add a test `every PYQ topic_id ∈ topics`. Also fix the `eval_02` expectation `algo_graphs` in `evaluation/test_cases.json`.
2. **Mock test**: map subject names (`Databases` ↔ `Database Management Systems`) in `mock_test_agent.js:generateTest`; load networks + compiler JSON in `tools/pyq_tool.js:loadAll`; guard `recordAttempt` against unknown topics.
3. **Seed on startup**: call `seedDatabase()` from `app.js` (additive version).
4. **Remove default JWT secret** and rotate it; stop returning `officialAnswer` to unauthenticated callers; make `authRequired` the default on learning routes; protect `/token-report`.
5. **Server-side attempt counter for Active Recall** and hide `referenceAnswer` until correct/3rd attempt (D4). Update the stale test (`active_recall.test.js:128`) to the chosen rule.
6. **Fix grounding honesty**: remove `confidence: 0.95` and the "CrewAI Grounded Knowledge Base" citation; make the retriever's `isGrounded` the only source; tighten thresholds so *neural networks* is refused. Add 20 in-domain + 20 out-of-domain queries to `evaluation/test_cases.json`.
7. **Make `npm test` safe and green**: run tests on a temp `DB_PATH`; get 7/7 passing.
8. Add `data/edugraph.db-*` and `daily_flashcards_cache.json` to `.gitignore`.

## P1 — Reliability (≈1 week)
- Choose one AI execution path. Recommended: keep CrewAI but run `crewai/server.py` as a long-lived service (already written), remove `execFile` and the hardcoded anaconda path, and move cache lookup into `crew.js:executeTask`.
- Add `express-rate-limit`, `helmet`, strict CORS, input validation (zod/joi) on every body, bounded `limit`/`count`.
- Upgrade vulnerable dependencies (`npm audit fix`, bump express/mathjs); remove unused `chromadb`.
- Escape/sanitise all `innerHTML` rendering (DOMPurify + `marked` + KaTeX).
- Persist mock tests; one BKT update per topic per test.
- Replace `chars/4` with provider-reported usage.
- Add DB indices: `attempts(user_id, created_at)`, `attempts(user_id, topic_id)`; wrap multi-statement writes (`recordAttempt`) in a transaction.
- Real-browser/mobile pass: add viewport meta to redirect stubs; test 375 px on dashboard, study, recall, flashcards.

## P2 — AI quality and personalisation
- **Real retrieval**: replace hash embeddings with a real embedding model (e.g. Gemini `text-embedding-004`, or local `bge-small` via `@xenova/transformers`) and an actual vector store (sqlite-vss, Chroma server, or pgvector). Keep the hybrid lexical component (BM25) and add a cross-encoder/LLM reranker; return chunk-level citations (source, page).
- **Document ingestion (the 1,000-page textbook use case)**: add `POST /api/docs` (multer, per-user, size/type limits, antivirus/MIME check) → `pdf-parse`/`pymupdf` extraction → clean (headers/footers, hyphenation) → chunk 500–800 tokens with 10–15 % overlap, heading-aware → embed in batches → per-user collection with metadata `{doc_id, page, chapter, topic_id}`. Summaries: map-reduce over retrieved chunks for the requested concept; refuse if top similarity is below threshold; cite pages. None of this exists today.
- **Link retrieval to the learner model**: pass `p_know` to prompts (weak → more scaffolding, strong → harder variants); choose PYQ difficulty by `p_know`.
- **BKT improvements**: per-topic parameters (fit with EM/pyBKT on collected data), add forgetting `P(F)`/time decay (the revision priority already uses recency — unify), require ≥ N attempts before "mastered", prerequisite propagation via the syllabus DAG, distinguish MCQ guess (0.25) vs NAT guess (≈0.02) — the current single `p_g = 0.2` is wrong for NAT.
- **Real multi-agent flow**: e.g. a `Crew` of *Problem Solver → Verifier (calculator tool) → Explainer*, with a structured-output validator (pydantic) and retry; add the missing Doubt Debugger and Interview agents or drop them from the README/viva claims.
- **Grading**: replace keyword grader with LLM-as-judge using the rubric + deterministic fallback, and evaluate agreement vs. human labels.
- Expand the PYQ bank beyond 23 items (GATE has ~1 500 questions in 2010–2025) — importing 10-year papers is the single biggest content gap.

## P3 — Future
Spaced-repetition scheduling with SM-2/FSRS tied to BKT; learning-path generator over the prerequisite DAG; teacher/analytics dashboard; offline PWA; ElevenLabs/neural TTS; multi-exam support (ESE, NET); LangGraph orchestrator (the `OrchestrationInterface` comment anticipates it); A/B study of effectiveness (see Report F, Q39).
