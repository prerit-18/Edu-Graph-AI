const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/authRequired');
const orchestrator = require('../agents/orchestrator');

/**
 * GET /api/revision/schedule
 */
router.get('/schedule', authRequired, async (req, res) => {
  try {
    const result = await orchestrator.getRevisionSchedule({ userId: req.user.id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
