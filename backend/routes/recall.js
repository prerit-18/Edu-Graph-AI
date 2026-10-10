const express = require('express');
const router = express.Router();
const { optionalAuth, authRequired } = require('../middleware/authRequired');
const orchestrator = require('../agents/orchestrator');
const activeRecallAgent = require('../agents/active_recall_agent');

/**
 * GET /api/recall/prompt
 * Returns a personalized or topic-specific recall prompt without revealing the answer key.
 */
router.get('/prompt', optionalAuth, async (req, res) => {
  try {
    const { topicId, subject, type } = req.query;
    const prompt = await orchestrator.generateActiveRecall({
      topicId,
      subject,
      type,
      userId: req.user?.id
    });
    res.json(prompt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/recall/grade
 * Evaluates student answer against server-side rubric, updates BKT, and returns feedback.
 */
router.post('/grade', optionalAuth, async (req, res) => {
  try {
    const { promptId, topicId, studentAnswer, idempotencyKey } = req.body;
    const evaluation = await orchestrator.gradeActiveRecall({
      promptId,
      topicId,
      studentAnswer,
      idempotencyKey,
      userId: req.user?.id
    });
    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/recall/submit
 * Alias for /grade to support standard submission semantics.
 */
router.post('/submit', optionalAuth, async (req, res) => {
  try {
    const { promptId, topicId, studentAnswer, idempotencyKey } = req.body;
    const evaluation = await orchestrator.gradeActiveRecall({
      promptId,
      topicId,
      studentAnswer,
      idempotencyKey,
      userId: req.user?.id
    });
    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/recall/history
 * Returns the authenticated student's previous active recall attempts.
 */
router.get('/history', authRequired, (req, res) => {
  try {
    const { topicId, limit } = req.query;
    const history = activeRecallAgent.getRecallHistory(
      req.user.id,
      topicId || null,
      parseInt(limit, 10) || 10
    );
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
