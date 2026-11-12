const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/authRequired');
const { rateLimit } = require('../middleware/rateLimit');
const conceptTeacher = require('../agents/concept_teacher');
const bank = require('../services/question_bank');
const db = require('../database/db');

const aiLimiter = rateLimit({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_AI || 40), name: 'qa' });

/**
 * Predefined learning actions: the student picks a topic + an action; the backend turns it into a compact,
 * token-capped instruction (or, where no LLM is needed, answers from the database / returns a navigation target).
 *  - LLM actions run through the Concept Teacher (grounded retrieval, refusal when out of scope, response cache).
 *  - solve_pyq NEVER asks a model to invent a PYQ: it returns a real stored question.
 *  - "ask_doubt" is a short grounded Q&A on the Concept Teacher; the dedicated Doubt Debugger agent is reserved for the Major Project.
 */
const LLM_ACTIONS = {
  explain_concept: { feature: 'concept_explain', maxTokens: 1024, prompt: t => `Explain ${t} for GATE CSE: intuition, formulas, key invariants, exam traps.` },
  quick_revision: { feature: 'quick_doubt', maxTokens: 400, prompt: t => `5-bullet quick revision of ${t} for GATE CSE.` },
  give_example: { feature: 'quick_doubt', maxTokens: 450, prompt: t => `One concrete worked example of ${t} relevant to GATE CSE.` },
  exam_traps: { feature: 'quick_doubt', maxTokens: 400, prompt: t => `Top 3 common mistakes/traps on ${t} in GATE CSE.` },
  ask_doubt: { feature: 'quick_doubt', maxTokens: 500, prompt: (t, body) => `Student doubt about ${t}: "${String(body.doubt || '').slice(0, 300)}". Identify the exact misunderstanding, give the correction briefly, then one example.` }
};
const ACTIONS = [...Object.keys(LLM_ACTIONS), 'solve_pyq', 'test_me', 'generate_flashcards'];

/** GET /api/quick-actions - available actions (drives the UI) */
router.get('/', authRequired, (req, res) => res.json({ actions: ACTIONS }));

/** POST /api/quick-actions/:action { topic, topicId?, subject?, doubt? } */
router.post('/:action', authRequired, aiLimiter, async (req, res) => {
  try {
    const { action } = req.params;
    if (!ACTIONS.includes(action)) return res.status(400).json({ error: `Unknown quick action: "${action}". Available: ${ACTIONS.join(', ')}` });
    const { topic, topicId, subject, doubt } = req.body || {};
    if (typeof topic !== 'string' || topic.trim().length < 2 || topic.length > 120) return res.status(400).json({ error: 'topic (2-120 characters) is required' });
    if (action === 'ask_doubt' && (typeof doubt !== 'string' || doubt.trim().length < 5)) return res.status(400).json({ error: 'doubt (at least 5 characters) is required' });
    const tid = topicId && db.prepare('SELECT 1 FROM topics WHERE id = ?').get(topicId) ? topicId : undefined;

    if (action === 'solve_pyq') {
      const done = db.prepare("SELECT DISTINCT question_id FROM attempts WHERE user_id = ? AND question_id != ''").all(req.user.id).map(r => r.question_id);
      let { questions } = bank.search({ topic_id: tid, hasKey: true, verifiedOnly: true, excludeIds: done }, { limit: 30 });
      if (!questions.length && tid) ({ questions } = bank.search({ topic_id: tid, hasKey: true, verifiedOnly: true }, { limit: 30 }));
      if (!questions.length) return res.json({ type: 'pyq', action, found: false, message: 'No stored question for this topic yet.' });
      const q = questions.sort((a, b) => (a.origin === 'official_gate' ? 0 : 1) - (b.origin === 'official_gate' ? 0 : 1) || b.year - a.year)[0];
      return res.json({ type: 'pyq', action, found: true, question: { ...bank.publicView(q), label: q.origin === 'official_gate' ? `GATE ${q.year} (official)` : 'Practice question (not an official GATE question)' }, url: `study.html?view=solver&question=${encodeURIComponent(q.id)}` });
    }
    if (action === 'test_me') return res.json({ type: 'navigate', action, url: `recall.html?topic=${encodeURIComponent(tid || '')}` });
    if (action === 'generate_flashcards') return res.json({ type: 'navigate', action, url: 'flashcards.html' });

    const cfg = LLM_ACTIONS[action];
    const result = await conceptTeacher.run({ query: cfg.prompt(topic.trim(), req.body), retrievalQuery: action === 'ask_doubt' ? `${topic.trim()} ${String(doubt).slice(0, 150)}` : topic.trim(), topicId: tid, subject, userId: req.user.id, maxOutputTokens: cfg.maxTokens, featureLabel: cfg.feature });
    res.json({ type: 'text', action, feature: cfg.feature, agent: result.agent, explanation: result.explanation, grounded: result.grounded, generatedBy: result.generatedBy, citations: result.citations || [], relatedQuestions: result.relatedQuestions || [], aiNotice: result.aiNotice || null });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(`Quick action [${req.params.action}] error:`, err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  }
});

module.exports = router;
