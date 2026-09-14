const express = require('express');
const router = express.Router();
const syllabusTool = require('../tools/syllabus_tool');
const { optionalAuth } = require('../middleware/authRequired');
const orchestrator = require('../agents/orchestrator');

/**
 * GET /api/syllabus/topics
 */
router.get('/topics', optionalAuth, async (req, res) => {
  try {
    const subject = req.query.subject;
    const result = await orchestrator.exploreSyllabus({
      subject,
      userId: req.user?.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/syllabus/subjects
 */
router.get('/subjects', (req, res) => {
  const subjects = syllabusTool.getAllSubjects();
  res.json({ subjects });
});

/**
 * GET /api/syllabus/path/:topicId
 */
router.get('/path/:topicId', optionalAuth, async (req, res) => {
  try {
    const topicId = req.params.topicId;
    const result = await orchestrator.exploreSyllabus({
      topicId,
      userId: req.user?.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
