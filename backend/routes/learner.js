const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/authRequired');
const learnerStateTool = require('../tools/learner_state_tool');
const db = require('../database/db');

/**
 * GET /api/learner/mastery
 */
router.get('/mastery', authRequired, (req, res) => {
  const mastery = learnerStateTool.getUserMastery(req.user.id);
  res.json({ mastery });
});

/**
 * GET /api/learner/attempts
 */
router.get('/attempts', authRequired, (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  const attempts = learnerStateTool.getRecentAttempts(req.user.id, limit);
  res.json({ attempts });
});

/**
 * GET /api/learner/weak-topics
 */
router.get('/weak-topics', authRequired, (req, res) => {
  const threshold = parseFloat(req.query.threshold) || 0.65;
  const weakTopics = learnerStateTool.getWeakTopics(req.user.id, threshold);
  res.json({ weakTopics });
});

/**
 * GET /api/learner/streak
 */
router.get('/streak', authRequired, (req, res) => {
  const streak = learnerStateTool.getLearnerStreak(req.user.id);
  res.json({ streak });
});

/**
 * GET /api/learner/dashboard
 * Aggregated dashboard summary
 */
router.get('/dashboard', authRequired, (req, res) => {
  const userId = req.user.id;
  const mastery = learnerStateTool.getUserMastery(userId);
  const recentAttempts = learnerStateTool.getRecentAttempts(userId, 5);
  const streak = learnerStateTool.getLearnerStreak(userId);

  const totalTopics = mastery.length;
  const masteredCount = mastery.filter(m => m.p_know >= 0.75).length;
  const learningCount = mastery.filter(m => m.p_know >= 0.45 && m.p_know < 0.75).length;
  const weakCount = mastery.filter(m => m.p_know < 0.45).length;

  const avgMastery = totalTopics > 0 
    ? (mastery.reduce((acc, curr) => acc + curr.p_know, 0) / totalTopics) * 100 
    : 0;

  // Count due revisions
  const revisionDueCount = mastery.filter(m => m.due_at && new Date(m.due_at) <= new Date()).length;

  // Subject breakdown
  const subjectMap = {};
  for (const item of mastery) {
    if (!subjectMap[item.subject]) {
      subjectMap[item.subject] = { subject: item.subject, total: 0, sumPKnow: 0 };
    }
    subjectMap[item.subject].total++;
    subjectMap[item.subject].sumPKnow += item.p_know;
  }

  const subjectProgress = Object.values(subjectMap).map(s => ({
    subject: s.subject,
    percentage: Math.round((s.sumPKnow / s.total) * 100),
    topicCount: s.total
  }));

  res.json({
    summary: {
      averageMastery: Number(avgMastery.toFixed(1)),
      masteredCount,
      learningCount,
      weakCount,
      totalTopics,
      revisionDueCount,
      streak: streak.currentStreak
    },
    subjectProgress,
    recentAttempts,
    mastery
  });
});

module.exports = router;
