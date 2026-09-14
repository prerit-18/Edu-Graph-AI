const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authRequired');
const orchestrator = require('../agents/orchestrator');

/**
 * GET /api/recall/prompt
 */
router.get('/prompt', optionalAuth, async (req, res) => {
  try {
    const topicId = req.query.topicId;
    const prompt = await orchestrator.generateActiveRecall({
      topicId,
      userId: req.user?.id
    });
    res.json(prompt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/recall/grade
 */
router.post('/grade', optionalAuth, async (req, res) => {
  try {
    const { topicId, question, studentAnswer, referenceAnswer, keyConcepts } = req.body;
    const evaluation = await orchestrator.gradeActiveRecall({
      topicId,
      question,
      studentAnswer,
      referenceAnswer,
      keyConcepts,
      userId: req.user?.id
    });
    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
