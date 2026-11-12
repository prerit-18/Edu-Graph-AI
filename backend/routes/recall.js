const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/authRequired');
const { rateLimit } = require('../middleware/rateLimit');
const orchestrator = require('../agents/orchestrator');
const activeRecallAgent = require('../agents/active_recall_agent');

const aiLimiter = rateLimit({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_AI || 40), name: 'recall' });

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Recall route error:', err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message, ...(err.state ? { state: err.state } : {}) });
}

/**
 * GET /api/recall/prompt?topicId&subject&type
 * Returns a recall question WITHOUT the answer key. The prompt is bound to the caller.
 */
router.get('/prompt', authRequired, aiLimiter, async (req, res) => {
  try {
    const { topicId, subject, type } = req.query;
    const prompt = await orchestrator.generateActiveRecall({ topicId, subject, type, userId: req.user.id });
    res.json({ ...prompt, maxAttempts: 3, attemptsUsed: 0, attemptsRemaining: 3, completed: false });
  } catch (err) { sendError(res, err); }
});

/**
 * GET /api/recall/state/:promptId - attempts used/remaining; reveals the answer only once complete.
 */
router.get('/state/:promptId', authRequired, (req, res) => {
  const state = activeRecallAgent.getPromptState(req.user.id, req.params.promptId);
  if (!state) return res.status(404).json({ error: 'Recall prompt not found' });
  res.json(state);
});

/**
 * POST /api/recall/grade  { promptId, studentAnswer }
 * Attempt counting, answer reveal and BKT update are decided server-side.
 */
async function grade(req, res) {
  try {
    const { promptId, studentAnswer } = req.body || {};
    const evaluation = await orchestrator.gradeActiveRecall({ promptId, studentAnswer, userId: req.user.id });
    res.json(evaluation);
  } catch (err) { sendError(res, err); }
}
router.post('/grade', authRequired, aiLimiter, grade);
router.post('/submit', authRequired, aiLimiter, grade); // alias

/**
 * GET /api/recall/history
 */
router.get('/history', authRequired, (req, res) => {
  try {
    const { topicId, limit } = req.query;
    const lim = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    res.json({ history: activeRecallAgent.getRecallHistory(req.user.id, topicId || null, lim) });
  } catch (err) { sendError(res, err); }
});

module.exports = router;
