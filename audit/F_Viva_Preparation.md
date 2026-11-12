> **Historical document:** this audit describes the project BEFORE the fixes; see docs/FINAL_REPORT.md and docs/CHANGES.md for the current state.

# Report F — Academic Viva Preparation (46 Q&A, based on the actual code)

Tip: answer honestly about limitations — examiners reward correct self-assessment. Numbers below were verified in this audit.

## Idea & novelty
**Q1. What problem does EduGraph AI solve?** GATE CSE aspirants get generic content and no per-topic feedback. EduGraph tracks per-topic mastery with BKT and uses it to choose practice, flashcards and revision, while an LLM explains concepts from a syllabus-grounded knowledge base.

**Q2. What is the technical contribution?** An *integration*: syllabus-specific retrieval + topic-level probabilistic learner modelling + practice + active recall + revision, all sharing one `mastery` table. The individual parts (BKT, RAG, LLMs) are standard.

**Q3. Is it novel research?** No — it's an engineering/system contribution. BKT is from Corbett & Anderson (1995); RAG from Lewis et al. (2020). Novelty claims would need an experiment (Q39).

**Q4. How is it different from a normal learning platform?** Static platforms show the same content to everyone. Here, `smart_flashcards.js` picks 3 cards from topics with P(know) ≥ 0.65 and 2 from topics < 0.50, and recall topics are chosen from the lowest-mastery topic.

**Q5. What claims are unsupported?** Effectiveness (no study); "hallucination-free" (our retriever false-accepts off-topic queries); "multi-agent collaboration" (agents don't communicate); textbook-RAG (not implemented).

## Architecture
**Q6. Describe the architecture.** Static HTML → Express REST → orchestrator → agents → SQLite + JSON vector index; optional Python CrewAI subprocess for four task types.

**Q7. Why SQLite?** Zero-ops, single-file, enough for a prototype; `better-sqlite3` is synchronous and fast. Limitation: single writer, no horizontal scale.

**Q8. What is the orchestrator for?** `orchestrator.js` hides the framework behind methods (`askConcept`, `solveProblem`, …) so CrewAI could be swapped for LangGraph without changing routes.

**Q9. How is authentication done?** bcrypt (cost 10) password hashes, JWT HS256 valid 7 days sent as Bearer token; `authRequired` middleware. Weakness: optional auth on learning endpoints, default secret fallback, token in localStorage.

**Q10. How are APIs protected from SQL injection?** All queries use prepared statements with `?` placeholders (verified: `' OR 1=1 --` login returns 401).

## CrewAI & agents
**Q11. Is CrewAI really used?** Yes, in `backend/crewai/crew_runner.py` with real `Agent/Task/Crew` objects, called via a subprocess for concept, PYQ, solve and recall-grade. But each crew has one agent and one task, and falls back to local code on any failure.

**Q12. How many agents exist?** Seven runner classes: Syllabus, Concept Teacher, PYQ Analyst, Problem Solver, Revision, Mock Test, Active Recall. Doubt Debugger and Interview agents are *not* implemented.

**Q13. Agent vs LLM call vs function?** An agent chooses actions/tools via LLM reasoning in a loop; an LLM call is one prompt→completion; a function is deterministic code. Here Revision/Syllabus/Mock Test are plain functions; Concept/PYQ/Recall in JS are single LLM calls; the Python crews are the only agent-like components, with limited tool use.

**Q14. Do agents communicate?** No. Each orchestrator method builds a one-agent crew. `Crew.kickoff` in `crew.js` iterates tasks sequentially but there is only ever one.

**Q15. What happens if the LLM is down?** `llm_client.generate` returns `null` and every agent falls back to deterministic templates/curated answers — resilient, but the UI can't always tell the user the answer wasn't LLM-generated.

**Q16. Why spawn Python from Node?** CrewAI is Python-only. Trade-off: process start + import cost per request; better to run `crewai/server.py` as a service.

## RAG & embeddings
**Q17. Walk through the RAG pipeline.** Syllabus topics + PYQs → one chunk each (50 total) → hashed 512-d vectors → JSON file → linear scan with score 0.35·cosine + 0.65·keyword overlap → dedup → topK → grounding decision → top chunks truncated to 200 chars go into the prompt.

**Q18. Which embedding model?** None — it is feature hashing (FNV-1a on unigrams + character trigrams, L2 normalised). It is lexical, not semantic; "mutex" and "lock" are unrelated vectors.

**Q19. Is it a vector database?** No. `data/chroma/vector_index.json` scanned in memory; `chromadb` is an unused dependency.

**Q20. How does cosine similarity work?** `cos(a,b)=a·b/(|a||b|)`; vectors are unit-normalised so it's the dot product; ours is clamped to [0,1].

**Q21. How do you avoid hallucination?** If hybrid score < 0.25 or overlap < 0.20 the concept agent refuses. Honest limitation: *neural networks backpropagation* scored 0.283 / overlap 0.33 and was accepted.

**Q22. Chunk size / overlap / top-K?** No chunking (one item per chunk, 50 chunks), no overlap; top-K default 3, concept uses 2; there is no reranker.

**Q23. Can it summarise a 1,000-page textbook?** Not today: no upload, PDF extraction, chunking or per-user index. Needed: ingestion pipeline, real embeddings + vector DB, page-level citations, map-reduce summarisation (Report E, P2).

**Q24. How would you evaluate retrieval?** Labelled queries → Recall@k / MRR / nDCG, plus an out-of-domain refusal rate. Currently 5 cases only (not meaningful).

## BKT & Bayesian probability
**Q25. Explain BKT.** A 2-state HMM per skill: hidden *known/unknown*, observed *correct/incorrect*. Parameters: P(L0)=0.30, P(T)=0.15, P(S)=0.10, P(G)=0.20.

**Q26. Give the update equations.** Correct: P(L|c)=P(L)(1−S)/[P(L)(1−S)+(1−P(L))G]. Incorrect: P(L|w)=P(L)S/[P(L)S+(1−P(L))(1−G)]. Then P(L_{t+1})=P(L|obs)+(1−P(L|obs))·T (`bkt.js:updateBKT`).

**Q27. Show a worked example.** Prior 0.30, correct: 0.27/(0.27+0.14)=0.659 → +0.341·0.15 = **0.7098** (matches the test). Wrong: 0.03/(0.03+0.56)=0.0508 → 0.0508+0.9492·0.15 = **0.1932**.

**Q28. Where is BKT stored/used?** `mastery(user_id, topic_id, p_know)`; read by dashboard, syllabus readiness, revision ranking, flashcard classification and recall topic selection.

**Q29. Marks vs accuracy vs P(know)?** Marks = scored points (+1, −⅓ for MCQ). Accuracy = fraction correct, ignores order/guessing. P(know) = posterior belief about the hidden skill, accounting for slips/guesses and recency of evidence.

**Q30. What are BKT's weaknesses here?** Same parameters for all topics; no forgetting; guess = 0.2 for both MCQ and NAT (NAT guess is ≈0); no minimum-attempts gate; recall score ≥ 60 is a coarse binary mapping.

**Q31. Does personalisation really change outputs?** Yes for: smart flashcard selection, recall topic selection, syllabus readiness, revision ranking (verified). No for: concept explanations (not conditioned on P(know)).

**Q32. Known recommendation bug?** Revision ranks unseen topics above just-failed ones because unseen topics use p_know = 0 and 7 days staleness (Report D10).

## Token optimisation
**Q33. How did you reduce tokens?** Short system prompts, per-feature `maxOutputTokens`, stateless calls, top-2 chunks ≤ 200 chars, and a SHA-256-keyed response cache (24 h, LRU + SQLite). Savings were not measured; `token_monitor` estimates chars/4.

**Q34. Where is the waste?** Python path skips the cache; solver can run two LLM calls; a process spawn per request.

## Database & API
**Q35. Why a foreign key on attempts.topic_id and what went wrong?** It protects integrity, but 6 PYQs referenced topic ids absent from `topics`, causing HTTP 500 (found by testing).

**Q36. What is idempotency in recall grading?** Prevents double BKT updates on resubmission; implemented as "same user+topic+question within 30 s", while the declared `idempotencyKey` is unused.

**Q37. Why only update BKT on the third wrong attempt?** To avoid penalising multiple tries on one question. Enforcement is partly client-trusted (`attemptNumber`), a known weakness.

## Security
**Q38. Main security risks?** Default JWT secret fallback, optional auth, public token-report, no rate limiting, open CORS, unsanitised `innerHTML`, 4 vulnerable dependencies (1 critical), Gemini key in URL.

## Testing & evaluation
**Q39. How would you prove it helps students?** Randomised study: control (static PYQ list) vs EduGraph; pre/post GATE-style test; measure gain, time-to-mastery; also offline BKT validation (AUC/RMSE of next-answer prediction on logged data) and retrieval Recall@k.

**Q40. What tests exist and what passed?** 7 suites; I ran them: 6 pass, `active_recall.test.js` fails because it expects a BKT update after the first wrong attempt, which the code deliberately skips.

**Q41. What is not verified?** Live-LLM behaviour, CrewAI with a real model, mobile rendering, load.

## Limitations & future
**Q42. Biggest limitation?** Tiny content (27 topics, 23 PYQs), lexical retrieval, no document upload.

**Q43. How would you add textbook upload?** See Q23.

**Q44. How would you improve BKT?** Fit per-topic parameters (EM/pyBKT), add forgetting, separate MCQ/NAT guess, prerequisite coupling.

**Q45. How would you make agents truly collaborative?** Solver → Verifier → Explainer crew with structured outputs and retries, plus a manager agent (hierarchical process).

**Q46. What would you demo confidently?** See the final summary: BKT live updates, smart flashcards, active recall (UI), syllabus prerequisites, dashboard, TTS tutor — avoiding the 6 broken PYQs and mock submit until fixed.
