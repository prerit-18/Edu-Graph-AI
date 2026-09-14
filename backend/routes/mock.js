const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authRequired');
const orchestrator = require('../agents/orchestrator');

/**
 * GET /api/mock/start
 */
router.get('/start', optionalAuth, (req, res) => {
  try {
    const subject = req.query.subject || 'All';
    const count = parseInt(req.query.count, 10) || 10;
    const test = orchestrator.generateMockTest({ subject, count });
    res.json(test);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mock/submit
 */
router.post('/submit', optionalAuth, (req, res) => {
  try {
    const { testId, submissions } = req.body;
    if (!testId || !Array.isArray(submissions)) {
      return res.status(400).json({ error: 'testId and submissions array are required' });
    }

    const report = orchestrator.evaluateMockTest({
      testId,
      submissions,
      userId: req.user?.id
    });

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
