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
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const attempts = learnerStateTool.getRecentAttempts(req.user.id, limit);
  res.json({ attempts });
});

/**
 * GET /api/learner/weak-topics
 */
router.get('/weak-topics', authRequired, (req, res) => {
  const threshold = Math.min(Math.max(parseFloat(req.query.threshold) || 0.65, 0.05), 0.99);
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

  const { statusFor } = require('../knowledge_tracing/bkt');
  // Only attempted topics carry evidence; unattempted topics are reported as "not started", never as 0%.
  const attempted = mastery.filter(m => m.last_seen);
  const withStatus = mastery.map(m => ({ ...m, status: m.last_seen ? statusFor(m.p_know, m.n_attempts) : 'not_started' }));
  const count = s => withStatus.filter(m => m.status === s).length;
  const totalTopics = mastery.length;
  const masteredCount = count('mastered') + count('strong');
  const learningCount = count('learning');
  const weakCount = count('weak');
  const insufficientCount = count('insufficient_data');
  const notStartedCount = count('not_started');
  const avgMastery = attempted.length > 0
    ? (attempted.reduce((acc, curr) => acc + curr.p_know, 0) / attempted.length) * 100
    : null;
  const revisionDueCount = withStatus.filter(m => m.due_at && new Date(m.due_at) <= new Date() && m.status !== 'insufficient_data' && m.status !== 'mastered').length;

  // Subject breakdown
  const subjectMap = {};
  for (const item of withStatus) {
    const s = subjectMap[item.subject] || (subjectMap[item.subject] = { subject: item.subject, total: 0, attempted: 0, sumPKnow: 0 });
    s.total++;
    if (item.last_seen) { s.attempted++; s.sumPKnow += item.p_know; }
  }

  const subjectProgress = Object.values(subjectMap).map(s => ({
    subject: s.subject,
    percentage: s.attempted ? Math.round((s.sumPKnow / s.attempted) * 100) : null,
    topicCount: s.total,
    attemptedTopics: s.attempted
  }));

  res.json({
    summary: {
      averageMastery: avgMastery === null ? null : Number(avgMastery.toFixed(1)),
      attemptedTopics: attempted.length,
      insufficientCount,
      notStartedCount,
      masteredCount,
      learningCount,
      weakCount,
      totalTopics,
      revisionDueCount,
      streak: streak.currentStreak
    },
    subjectProgress,
    recentAttempts,
    mastery: withStatus
  });
});

module.exports = router;
