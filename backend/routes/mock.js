const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/authRequired');
const orchestrator = require('../agents/orchestrator');
const mockAgent = require('../agents/mock_test_agent');

function fail(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Mock route error:', err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
}

/** GET /api/mock/start?subject&year&difficulty&origin=official|practice|any&count&topic */
router.get('/start', authRequired, (req, res) => {
  try {
    const { subject, year, difficulty, origin, topic, count } = req.query;
    res.json(orchestrator.generateMockTest({ userId: req.user.id, subject, year, difficulty, origin, topic_id: topic, count }));
  } catch (err) { fail(res, err); }
});

/** POST /api/mock/submit { testId, submissions:[{questionId, answer}] } */
router.post('/submit', authRequired, (req, res) => {
  try {
    const { testId, submissions } = req.body || {};
    if (!testId || !Array.isArray(submissions)) return res.status(400).json({ error: 'testId and submissions array are required' });
    if (submissions.length > 200) return res.status(400).json({ error: 'too many submissions' });
    res.json(orchestrator.evaluateMockTest({ testId, submissions, userId: req.user.id }));
  } catch (err) { fail(res, err); }
});

/** GET /api/mock/history, GET /api/mock/report/:testId */
router.get('/history', authRequired, (req, res) => res.json({ history: mockAgent.getHistory(req.user.id, 20) }));
router.get('/report/:testId', authRequired, (req, res) => {
  const r = mockAgent.getReport(req.user.id, req.params.testId);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  res.json(r);
});

module.exports = router;
