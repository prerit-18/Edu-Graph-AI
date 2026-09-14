const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authRequired');
const orchestrator = require('../agents/orchestrator');

/**
 * POST /api/agents/concept
 * Concept Teacher workflow
 */
router.post('/concept', optionalAuth, async (req, res) => {
  try {
    const { query, subject, topicId } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = await orchestrator.askConcept({
      query,
      subject,
      topicId,
      userId: req.user?.id
    });

    res.json(result);
  } catch (err) {
    console.error('Concept teacher route error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/agents/pyq-analyst
 * PYQ Analyst workflow
 */
router.post('/pyq-analyst', optionalAuth, async (req, res) => {
  try {
    const { topicId, subject, query } = req.body;
    const result = await orchestrator.analyzePYQ({
      topicId,
      subject,
      query,
      userId: req.user?.id
    });

    res.json(result);
  } catch (err) {
    console.error('PYQ analyst route error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/agents/solve
 * Problem Solver workflow
 */
router.post('/solve', optionalAuth, async (req, res) => {
  try {
    const { questionId, questionText, studentAnswer, topicId } = req.body;
    if (!questionId && !questionText) {
      return res.status(400).json({ error: 'questionId or questionText is required' });
    }

    const result = await orchestrator.solveProblem({
      questionId,
      questionText,
      studentAnswer,
      userId: req.user?.id,
      topicId
    });

    res.json(result);
  } catch (err) {
    console.error('Problem solver route error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
