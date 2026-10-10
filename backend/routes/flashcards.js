const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authRequired');
const flashcardGenerator = require('../agents/flashcard_generator');

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

