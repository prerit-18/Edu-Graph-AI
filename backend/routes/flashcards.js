const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/authRequired');
const { rateLimit } = require('../middleware/rateLimit');
const daily = require('../services/daily_flashcards');
const smartFlashcardsService = require('../services/smart_flashcards');

const aiLimiter = rateLimit({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_AI || 40), name: 'fc' });

function fail(res, err, label) {
  const status = err.status || 500;
  if (status >= 500 && status !== 503) console.error(`${label} error:`, err);
  res.status(status).json({ error: status >= 500 && status !== 503 ? 'Internal server error' : err.message, code: err.code || undefined });
}

/**
 * GET /api/flashcards/today[?tz=Area/City]
 * The learner's ONE persisted session for today (their local date). Created on first request (Gemini, grounded +
 * validated), then restored on every later request the same day - with card feedback and resume position.
 * Aliases: /smart-session (GET).
 */
async function today(req, res) {
  try { res.json(await daily.getToday(req.user.id, { tz: req.query.tz })); }
  catch (err) { fail(res, err, 'Daily flashcards'); }
}
router.get('/today', authRequired, aiLimiter, today);
router.get('/smart-session', authRequired, aiLimiter, today);

/** POST /api/flashcards/feedback { sessionId, flashcardId, response: 'got_it'|'need_practice' }  (self-assessment only) */
router.post('/feedback', authRequired, (req, res) => {
  try {
    const { sessionId, flashcardId, response } = req.body || {};
    if (!sessionId || !flashcardId || !response) return res.status(400).json({ error: 'sessionId, flashcardId and response are required' });
    res.json(daily.recordFeedback({ userId: req.user.id, sessionId, flashcardId, response }));
  } catch (err) { fail(res, err, 'Flashcard feedback'); }
});

/** GET /api/flashcards/history */
router.get('/history', authRequired, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 14, 1), 60);
  res.json({ history: daily.getHistory(req.user.id, limit) });
});
router.get('/smart-history', authRequired, (req, res) => res.json({ history: daily.getHistory(req.user.id, 10) }));

/** GET /api/flashcards/topic-classification - the BKT-based strong/weak/neutral/insufficient/unseen split */
router.get('/topic-classification', authRequired, (req, res) => {
  try { res.json(smartFlashcardsService.classifyTopics(req.user.id)); }
  catch (err) { fail(res, err, 'Topic classification'); }
});

module.exports = router;
