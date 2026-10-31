const express = require('express');
const router = express.Router();
const { optionalAuth, authRequired } = require('../middleware/authRequired');
const flashcardGenerator = require('../agents/flashcard_generator');
const smartFlashcardsService = require('../services/smart_flashcards');

/**
 * GET /api/flashcards/smart-session
 * Generate exactly 5 personalized flashcards (3 Strong Topics + 2 Weak Topics)
 * Optional query: ?strongThreshold=0.65&weakThreshold=0.50&minAttempts=2
 */
router.get('/smart-session', optionalAuth, async (req, res) => {
  try {
    const config = {};
    if (req.query.strongThreshold) config.strongThreshold = parseFloat(req.query.strongThreshold);
    if (req.query.weakThreshold) config.weakThreshold = parseFloat(req.query.weakThreshold);
    if (req.query.minAttempts) config.minAttempts = parseInt(req.query.minAttempts, 10);

    const session = smartFlashcardsService.generateSession(req.user?.id, config);
    res.json(session);
  } catch (err) {
    console.error('Smart flashcards session error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/flashcards/smart-session
 * Generate a fresh personalized 5-card session with optional config in body
 */
router.post('/smart-session', optionalAuth, async (req, res) => {
  try {
    const config = req.body.config || {};
    const session = smartFlashcardsService.generateSession(req.user?.id, config);
    res.json(session);
  } catch (err) {
    console.error('Smart flashcards session creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/flashcards/feedback
 * Record student self-evaluation ('got_it' | 'need_practice') on a card
 */
router.post('/feedback', optionalAuth, async (req, res) => {
  try {
    const { sessionId, flashcardId, response } = req.body;
    if (!sessionId || !flashcardId || !response) {
      return res.status(400).json({ error: 'sessionId, flashcardId, and response are required' });
    }

    const result = smartFlashcardsService.recordFeedback({
      sessionId,
      flashcardId,
      userId: req.user?.id,
      response
    });

    res.json(result);
  } catch (err) {
    console.error('Smart flashcard feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/flashcards/smart-history
 * Returns user past smart flashcard sessions with summaries
 */
router.get('/smart-history', optionalAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const history = smartFlashcardsService.getHistory(req.user?.id, limit);
    res.json({ history });
  } catch (err) {
    console.error('Smart flashcard history error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/flashcards/topic-classification
 * Returns breakdown of strong, weak, neutral, and insufficient data topics
 */
router.get('/topic-classification', optionalAuth, (req, res) => {
  try {
    const config = {};
    if (req.query.strongThreshold) config.strongThreshold = parseFloat(req.query.strongThreshold);
    if (req.query.weakThreshold) config.weakThreshold = parseFloat(req.query.weakThreshold);
    if (req.query.minAttempts) config.minAttempts = parseInt(req.query.minAttempts, 10);

    const classification = smartFlashcardsService.classifyTopics(req.user?.id, config);
    res.json(classification);
  } catch (err) {
    console.error('Topic classification error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/flashcards
 * Dynamically generates today's curated flashcard deck rotated across the 10 GATE CSE subjects
 * Query params: ?subject=All|OS|Algo... &date=YYYY-MM-DD &seed=... &count=12 &generate_ai=true
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { subject = 'All', date, seed, count = 10, generate_ai } = req.query;

    if (generate_ai === 'true' || generate_ai === '1') {
      const aiCards = await flashcardGenerator.generateAIFlashcards({
        subject: subject !== 'All' ? subject : 'Operating Systems',
        topicId: req.query.topicId,
        query: req.query.query,
        count: parseInt(count, 10) || 5
      });
      return res.json(aiCards);
    }

    const isRefresh = req.query.refresh === 'true' || req.query.refresh === '1';

    const deck = await flashcardGenerator.getDailyDeck({
      dateStr: date,
      seed,
      subject,
      userId: req.user?.id,
      count: parseInt(count, 10) || 10,
      forceRefresh: isRefresh
    });

    res.json(deck);
  } catch (err) {
    console.error('Flashcards generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/flashcards/generate
 * On-demand AI synthesis endpoint for specific custom topics
 */
router.post('/generate', optionalAuth, async (req, res) => {
  try {
    const { subject, topicId, query, count } = req.body;
    const result = await flashcardGenerator.generateAIFlashcards({
      subject: subject || 'Operating Systems',
      topicId,
      query,
      count: count || 3
    });
    res.json(result);
  } catch (err) {
    console.error('Custom flashcard generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

