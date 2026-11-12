const express = require('express');
const router = express.Router();
const { authRequired, adminRequired } = require('../middleware/authRequired');
const { rateLimit } = require('../middleware/rateLimit');
const orchestrator = require('../agents/orchestrator');
const tokenMonitor = require('../services/token_monitor');

const aiLimiter = rateLimit({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_AI || 40), name: 'agents' });
function fail(res, err, label) {
  const status = err.status || 500;
  if (status >= 500) console.error(`${label} route error:`, err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
}

/**
 * POST /api/agents/concept
 * Concept Teacher workflow
 */
router.post('/concept', authRequired, aiLimiter, async (req, res) => {
  try {
    const { query, subject, topicId } = req.body || {};
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = await orchestrator.askConcept({
      query,
      subject,
      topicId,
      userId: req.user.id
    });

    res.json(result);
  } catch (err) {
    fail(res, err, 'Concept teacher');
  }
});

/**
 * POST /api/agents/pyq-analyst
 * PYQ Analyst workflow
 */
router.post('/pyq-analyst', authRequired, aiLimiter, async (req, res) => {
  try {
    const { topicId, subject, query } = req.body || {};
    const result = await orchestrator.analyzePYQ({
      topicId,
      subject,
      query,
      userId: req.user.id
    });

    res.json(result);
  } catch (err) {
    fail(res, err, 'PYQ analyst');
  }
});

/**
 * POST /api/agents/solve
 * Problem Solver workflow
 */
router.post('/solve', authRequired, aiLimiter, async (req, res) => {
  try {
    const { questionId, questionText, studentAnswer, topicId, reveal } = req.body || {};
    if (!questionId && !questionText) {
      return res.status(400).json({ error: 'questionId or questionText is required' });
    }

    const result = await orchestrator.solveProblem({
      questionId,
      questionText,
      studentAnswer,
      userId: req.user.id,
      topicId,
      reveal: reveal === true
    });

    res.json(result);
  } catch (err) {
    fail(res, err, 'Problem solver');
  }
});

/**
 * GET /api/agents/token-report
 * Token Usage & Cost Audit Report
 */
router.get('/token-report', authRequired, adminRequired, (req, res) => {
  try {
    const report = tokenMonitor.getReport();
    res.json(report);
  } catch (err) {
    fail(res, err, 'Token report');
  }
});

module.exports = router;
