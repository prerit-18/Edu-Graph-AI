const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/authRequired');
const bank = require('../services/question_bank');
const orchestrator = require('../agents/orchestrator');
const db = require('../database/db');

const str = v => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** GET /api/pyq/filters - available years/subjects/topics/types with counts (drives the filter UI) */
router.get('/filters', authRequired, (req, res) => {
  res.json(bank.filtersSummary());
});

/** GET /api/pyq/search?q=...  - semantic (embedding) search over stored questions; lexical fallback when embeddings are unavailable */
router.get('/search', authRequired, async (req, res) => {
  const q = str(req.query.q);
  if (!q || q.length < 3 || q.length > 300) return res.status(400).json({ error: 'q must be 3-300 characters' });
  const r = await require('../rag/retriever').retrieveAsync(q, { strategy: 'pyq', topK: 8, subject: str(req.query.subject), year: str(req.query.year) });
  const out = [];
  for (const hit of r.results) {
    const full = bank.getById(hit.metadata.question_id);
    if (full && full.verification_status !== 'needs_review') out.push({ ...bank.publicView(full), relevance: hit.similarity, semanticScore: hit.semantic });
  }
  res.json({ query: q, semantic: !!r.semantic, grounded: r.isGrounded, total: out.length, questions: out, note: r.isGrounded ? null : 'No closely related stored question found.' });
});

/** GET /api/pyq/analytics[?subject=] - counts, shares and trends computed from the stored official papers */
router.get('/analytics', authRequired, (req, res) => res.json(bank.analytics({ subject: str(req.query.subject) })));

/** GET /api/pyq?year&subject&topic&type&difficulty&origin&q&unattempted&limit&offset  (answers are NOT included) */
router.get('/', authRequired, (req, res) => {
  const f = {
    year: str(req.query.year), subject: str(req.query.subject), topic_id: str(req.query.topic),
    type: str(req.query.type), difficulty: str(req.query.difficulty), q: str(req.query.q)
  };
  if (req.query.origin === 'official') f.origin = 'official_gate';
  if (req.query.origin === 'practice') f.origin = 'synthetic_practice';
  if (req.query.unattempted === 'true') {
    f.excludeIds = db.prepare("SELECT DISTINCT question_id FROM attempts WHERE user_id = ? AND question_id != ''")
      .all(req.user.id).map(r => r.question_id);
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const { total, questions } = bank.search(f, { limit, offset });
  const done = new Map(db.prepare("SELECT question_id, MAX(correct) c FROM attempts WHERE user_id = ? AND question_id != '' GROUP BY question_id").all(req.user.id).map(r => [r.question_id, r.c]));
  res.json({
    total, limit, offset,
    questions: questions.map(q => ({ ...bank.publicView(q), attempted: done.has(q.id), everCorrect: done.get(q.id) === 1 }))
  });
});

/** GET /api/pyq/:id - one question without the key */
router.get('/:id', authRequired, (req, res) => {
  const q = bank.getById(req.params.id);
  if (!q) return res.status(404).json({ error: 'Question not found' });
  res.json(bank.publicView(q));
});

/** POST /api/pyq/:id/attempt { answer }  - official-key grading + BKT update + explanation */
router.post('/:id/attempt', authRequired, async (req, res) => {
  try {
    const answer = req.body && req.body.answer;
    if (answer === undefined || String(answer).trim() === '') return res.status(400).json({ error: 'answer is required' });
    if (String(answer).length > 50) return res.status(400).json({ error: 'answer is too long' });
    const result = await orchestrator.solveProblem({ questionId: req.params.id, studentAnswer: String(answer), userId: req.user.id });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('PYQ attempt error:', err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  }
});

module.exports = router;
