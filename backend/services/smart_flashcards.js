const crypto = require('crypto');
const db = require('../database/db');
const flashcardGenerator = require('../agents/flashcard_generator');

/**
 * Default configurable thresholds for Smart Flashcard topic classification
 */
const DEFAULT_THRESHOLDS = {
  strongThreshold: 0.65,          // BKT P(Know) >= 0.65 is classified as Strong
  weakThreshold: 0.50,            // BKT P(Know) < 0.50 is classified as Weak
  minAttempts: 2,                 // Minimum attempts needed to classify; 1 attempt is handled as insufficient data
  accuracyStrongThreshold: 0.70,  // Fallback quiz accuracy >= 70% if BKT not updated
  accuracyWeakThreshold: 0.50     // Fallback quiz accuracy < 50% if BKT not updated
};

class SmartFlashcardsService {
  constructor(thresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Configure classification thresholds dynamically
   */
  setThresholds(newThresholds = {}) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    return this.thresholds;
  }

  getThresholds() {
    return { ...this.thresholds };
  }

  /**
   * Classify topics for a user into strong, weak, neutral, and insufficient data
   * @param {string} userId - User ID
   * @param {object} customConfig - Optional threshold overrides
   */
  classifyTopics(userId, customConfig = {}) {
    const config = { ...this.thresholds, ...customConfig };

    // 1. Get all syllabus topics
    const allTopics = db.prepare(`
      SELECT id, subject, name, pyq_weight 
      FROM topics 
      ORDER BY subject, id
    `).all();

    if (!userId) {
      // Unauthenticated / guest: all topics are unclassified
      return {
        strongTopics: [],
        weakTopics: [],
        neutralTopics: [],
        insufficientDataTopics: [],
        unseenTopics: allTopics.map(t => ({ ...t, p_know: null, attempts: 0, accuracy: null })),
        thresholds: config
      };
    }

    // 2. Fetch mastery records for this user
    const masteryRows = db.prepare(`
      SELECT topic_id, p_know, last_seen 
      FROM mastery 
      WHERE user_id = ?
    `).all(userId);
    const masteryMap = new Map(masteryRows.map(m => [m.topic_id, m]));

    // 3. Fetch attempt statistics per topic
    const attemptRows = db.prepare(`
      SELECT topic_id, 
             COUNT(*) as attempt_count, 
             SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct_count
      FROM attempts 
      WHERE user_id = ? 
      GROUP BY topic_id
    `).all(userId);
    const attemptMap = new Map(attemptRows.map(a => [a.topic_id, a]));

    // 4. Fetch flashcard feedback history to factor in recent student self-assessments
    const feedbackRows = db.prepare(`
      SELECT topic_id,
             SUM(CASE WHEN response = 'need_practice' THEN 1 ELSE 0 END) as need_practice_count,
             SUM(CASE WHEN response = 'got_it' THEN 1 ELSE 0 END) as got_it_count
      FROM smart_fc_feedback
      WHERE user_id = ?
      GROUP BY topic_id
    `).all(userId);
    const feedbackMap = new Map(feedbackRows.map(f => [f.topic_id, f]));

    const strongTopics = [];
    const weakTopics = [];
    const neutralTopics = [];
    const insufficientDataTopics = [];
    const unseenTopics = [];

    for (const topic of allTopics) {
      const mastery = masteryMap.get(topic.id);
      const attempts = attemptMap.get(topic.id) || { attempt_count: 0, correct_count: 0 };
      const feedback = feedbackMap.get(topic.id) || { need_practice_count: 0, got_it_count: 0 };

      const totalAttempts = attempts.attempt_count;
      const accuracy = totalAttempts > 0 ? (attempts.correct_count / totalAttempts) : null;
      const pKnow = mastery && mastery.last_seen ? mastery.p_know : null;

      const enrichedTopic = {
        topic_id: topic.id,
        subject: topic.subject,
        name: topic.name,
        pyq_weight: topic.pyq_weight,
        p_know: pKnow,
        total_attempts: totalAttempts,
        correct_attempts: attempts.correct_count,
        accuracy: accuracy !== null ? Number(accuracy.toFixed(2)) : null,
        need_practice_feedback: feedback.need_practice_count,
        got_it_feedback: feedback.got_it_count,
        last_seen: mastery ? mastery.last_seen : null
      };

      // Rule: Do not classify topics based on a single question.
      if (totalAttempts === 0 && !mastery?.last_seen) {
        unseenTopics.push(enrichedTopic);
        continue;
      }

      if (totalAttempts === 1) {
        insufficientDataTopics.push(enrichedTopic);
        continue;
      }

      // Sufficient learning data: at least minAttempts
      if (totalAttempts >= config.minAttempts || (mastery && mastery.last_seen && totalAttempts >= 1)) {
        // Use BKT p_know if actively tracked
        if (pKnow !== null) {
          if (pKnow >= config.strongThreshold) {
            strongTopics.push(enrichedTopic);
          } else if (pKnow < config.weakThreshold) {
            weakTopics.push(enrichedTopic);
          } else {
            neutralTopics.push(enrichedTopic);
          }
        } else if (accuracy !== null) {
          // Fallback to quiz / attempt accuracy
          if (accuracy >= config.accuracyStrongThreshold) {
            strongTopics.push(enrichedTopic);
          } else if (accuracy < config.accuracyWeakThreshold) {
            weakTopics.push(enrichedTopic);
          } else {
            neutralTopics.push(enrichedTopic);
          }
        } else {
          neutralTopics.push(enrichedTopic);
        }
      } else {
        insufficientDataTopics.push(enrichedTopic);
      }
    }

    // Sort strong topics by highest p_know / accuracy
    strongTopics.sort((a, b) => (b.p_know || b.accuracy || 0) - (a.p_know || a.accuracy || 0));

    // Sort weak topics by lowest p_know / accuracy, prioritizing high need_practice feedback
    weakTopics.sort((a, b) => {
      const aScore = (a.p_know ?? a.accuracy ?? 0.5) - (a.need_practice_feedback * 0.05);
      const bScore = (b.p_know ?? b.accuracy ?? 0.5) - (b.need_practice_feedback * 0.05);
      return aScore - bScore;
    });

    return {
      strongTopics,
      weakTopics,
      neutralTopics,
      insufficientDataTopics,
      unseenTopics,
      thresholds: config
    };
  }

  /**
   * Generate exactly 5 personalized flashcards for a Smart Session:
   * - 3 from strong topics
   * - 2 from weak topics
   * - Graceful fallback if insufficient strong or weak topics exist
   * @param {string} userId - User ID (optional)
   * @param {object} customConfig - Optional threshold overrides
   */
  generateSession(userId = null, customConfig = {}) {
    const classification = this.classifyTopics(userId, customConfig);
    const { strongTopics, weakTopics, neutralTopics, insufficientDataTopics, unseenTopics } = classification;

    // Fetch full knowledge bank (covers all 27 syllabus topics)
    const knowledgeBank = flashcardGenerator.getKnowledgeBank();
    const cardsByTopic = new Map();
    for (const card of knowledgeBank) {
      if (!cardsByTopic.has(card.topic_id)) {
        cardsByTopic.set(card.topic_id, []);
      }
      cardsByTopic.get(card.topic_id).push(card);
    }

    // Get cards user previously struggled with in attempts or flashcard feedback
    const difficultTopicIds = new Set();
    const difficultCardIds = new Set();
    if (userId) {
      try {
        const missedAttempts = db.prepare(`
          SELECT topic_id FROM attempts 
          WHERE user_id = ? AND correct = 0 
          ORDER BY created_at DESC LIMIT 15
        `).all(userId);
        missedAttempts.forEach(m => difficultTopicIds.add(m.topic_id));

        const practiceFeedback = db.prepare(`
          SELECT flashcard_id, topic_id FROM smart_fc_feedback 
          WHERE user_id = ? AND response = 'need_practice' 
          ORDER BY created_at DESC LIMIT 15
        `).all(userId);
        practiceFeedback.forEach(f => {
          difficultCardIds.add(f.flashcard_id);
          difficultTopicIds.add(f.topic_id);
        });
      } catch (err) {
        console.warn('Error fetching difficult history:', err.message);
      }
    }

    const selectedCards = [];
    const usedCardIds = new Set();
    let fallbackReasons = [];

    // ---------------------------------------------------------
    // STEP 1: Select 3 Flashcards from Strong Topics
    // ---------------------------------------------------------
    let strongCount = 0;
    const strongTopicIds = strongTopics.map(t => t.topic_id);

    // Filter available cards belonging to strong topics
    const strongCandidates = knowledgeBank.filter(c => strongTopicIds.includes(c.topic_id));

    // Shuffle slightly with a preference for high mastery
    for (const card of strongCandidates) {
      if (strongCount >= 3) break;
      if (!usedCardIds.has(card.id)) {
        const topicMeta = strongTopics.find(t => t.topic_id === card.topic_id);
        selectedCards.push({
          ...card,
          card_label: 'strong',
          is_fallback: false,
          topic_name: topicMeta ? topicMeta.name : card.topic_id.replace(/_/g, ' '),
          mastery_score: topicMeta?.p_know ? Math.round(topicMeta.p_know * 100) : null
        });
        usedCardIds.add(card.id);
        strongCount++;
      }
    }

    // Fallback if fewer than 3 strong cards available
    if (strongCount < 3) {
      fallbackReasons.push(`Only ${strongCount}/3 strong topics with available cards found; filled with foundational syllabus cards`);
      
      // Fallback candidates: neutral topics -> unseen topics -> any remaining knowledge bank cards
      const fallbackPool = [
        ...knowledgeBank.filter(c => neutralTopics.some(t => t.topic_id === c.topic_id)),
        ...knowledgeBank.filter(c => unseenTopics.some(t => t.topic_id === c.topic_id)),
        ...knowledgeBank
      ];

      for (const card of fallbackPool) {
        if (strongCount >= 3) break;
        if (!usedCardIds.has(card.id)) {
          selectedCards.push({
            ...card,
            card_label: 'strong',
            is_fallback: true,
            topic_name: card.topic_id.replace(/_/g, ' '),
            mastery_score: null
          });
          usedCardIds.add(card.id);
          strongCount++;
        }
      }
    }

    // ---------------------------------------------------------
    // STEP 2: Select 2 Flashcards from Weak Topics
    // ---------------------------------------------------------
    let weakCount = 0;
    const weakTopicIds = weakTopics.map(t => t.topic_id);

    // Weak candidates: prioritize cards user marked 'need_practice' or missed in attempts
    const weakCandidates = knowledgeBank
      .filter(c => weakTopicIds.includes(c.topic_id))
      .sort((a, b) => {
        const aDiff = (difficultCardIds.has(a.id) ? 2 : 0) + (difficultTopicIds.has(a.topic_id) ? 1 : 0);
        const bDiff = (difficultCardIds.has(b.id) ? 2 : 0) + (difficultTopicIds.has(b.topic_id) ? 1 : 0);
        return bDiff - aDiff;
      });

    for (const card of weakCandidates) {
      if (weakCount >= 2) break;
      if (!usedCardIds.has(card.id)) {
        const topicMeta = weakTopics.find(t => t.topic_id === card.topic_id);
        selectedCards.push({
          ...card,
          card_label: 'weak',
          is_fallback: false,
          topic_name: topicMeta ? topicMeta.name : card.topic_id.replace(/_/g, ' '),
          mastery_score: topicMeta?.p_know ? Math.round(topicMeta.p_know * 100) : null
        });
        usedCardIds.add(card.id);
        weakCount++;
      }
    }

    // Fallback if fewer than 2 weak cards available
    if (weakCount < 2) {
      fallbackReasons.push(`Only ${weakCount}/2 weak topics with available cards found; filled with challenge/unseen topics for diagnostic practice`);

      // Fallback candidates: topics with 'need_practice' feedback -> unseen topics -> neutral topics -> any unused
      const fallbackWeakPool = [
        ...knowledgeBank.filter(c => difficultTopicIds.has(c.topic_id)),
        ...knowledgeBank.filter(c => unseenTopics.some(t => t.topic_id === c.topic_id)),
        ...knowledgeBank.filter(c => insufficientDataTopics.some(t => t.topic_id === c.topic_id)),
        ...knowledgeBank
      ];

      for (const card of fallbackWeakPool) {
        if (weakCount >= 2) break;
        if (!usedCardIds.has(card.id)) {
          selectedCards.push({
            ...card,
            card_label: 'weak',
            is_fallback: true,
            topic_name: card.topic_id.replace(/_/g, ' '),
            mastery_score: null
          });
          usedCardIds.add(card.id);
          weakCount++;
        }
      }
    }

    // ---------------------------------------------------------
    // STEP 3: Verify Exact 5 Cards and Unique IDs Guarantee
    // ---------------------------------------------------------
    while (selectedCards.length < 5) {
      for (const card of knowledgeBank) {
        if (!usedCardIds.has(card.id)) {
          selectedCards.push({
            ...card,
            card_label: selectedCards.filter(c => c.card_label === 'strong').length < 3 ? 'strong' : 'weak',
            is_fallback: true,
            topic_name: card.topic_id.replace(/_/g, ' '),
            mastery_score: null
          });
          usedCardIds.add(card.id);
          break;
        }
      }
    }

    // Guarantee exactly 5
    const finalCards = selectedCards.slice(0, 5);

    // ---------------------------------------------------------
    // STEP 4: Persist Session into Database
    // ---------------------------------------------------------
    const sessionId = `sfc_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Verify userId exists in users table to respect foreign keys
    let validUserId = null;
    if (userId) {
      const userRow = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (userRow) validUserId = userRow.id;
    }

    try {
      db.prepare(`
        INSERT INTO smart_fc_sessions (id, user_id, created_at, strong_count, weak_count, completed, summary_json)
        VALUES (?, ?, ?, ?, ?, 0, NULL)
      `).run(sessionId, validUserId, now, 3, 2);

      const insertCardStmt = db.prepare(`
        INSERT INTO smart_fc_session_cards (id, session_id, flashcard_id, topic_id, subject, card_label, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      finalCards.forEach((c, idx) => {
        insertCardStmt.run(
          `scard_${crypto.randomUUID()}`,
          sessionId,
          c.id,
          c.topic_id,
          c.subject,
          c.card_label === 'weak' ? 'weak' : 'strong',
          idx
        );
      });
    } catch (dbErr) {
      console.warn('Could not persist smart_fc_session in SQLite:', dbErr.message);
    }

    return {
      sessionId,
      createdAt: now,
      totalCards: finalCards.length,
      targetBreakdown: { strong: 3, weak: 2 },
      actualBreakdown: {
        strong: finalCards.filter(c => c.card_label === 'strong').length,
        weak: finalCards.filter(c => c.card_label === 'weak').length
      },
      fallbackUsed: fallbackReasons.length > 0,
      fallbackReasons,
      classificationSummary: {
        strongTopicsCount: strongTopics.length,
        weakTopicsCount: weakTopics.length,
        neutralTopicsCount: neutralTopics.length,
        insufficientDataCount: insufficientDataTopics.length,
        unseenTopicsCount: unseenTopics.length
      },
      cards: finalCards.map((c, idx) => ({
        position: idx + 1,
        id: c.id,
        subject: c.subject,
        topic_id: c.topic_id,
        topic_name: c.topic_name,
        type: c.type || 'concept',
        front: c.front,
        back: c.back,
        card_label: c.card_label,
        is_fallback: c.is_fallback,
        mastery_score: c.mastery_score
      }))
    };
  }

  /**
   * Record student self-evaluation feedback on a flashcard
   * @param {object} params
   * @param {string} params.sessionId
   * @param {string} params.flashcardId
   * @param {string} params.userId
   * @param {string} params.response - 'got_it' | 'need_practice'
   */
  recordFeedback({ sessionId, flashcardId, userId = null, response }) {
    if (!sessionId || !flashcardId) {
      throw new Error('sessionId and flashcardId are required');
    }

    if (!['got_it', 'need_practice'].includes(response)) {
      throw new Error("response must be either 'got_it' or 'need_practice'");
    }

    // Verify card belongs to session and get topic_id
    const cardRecord = db.prepare(`
      SELECT topic_id, subject, card_label 
      FROM smart_fc_session_cards 
      WHERE session_id = ? AND flashcard_id = ?
    `).get(sessionId, flashcardId);

    const topicId = cardRecord ? cardRecord.topic_id : null;
    const feedbackId = `fb_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    let validUserId = null;
    if (userId) {
      const userRow = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (userRow) validUserId = userRow.id;
    }

    // 1. Record feedback in database
    db.prepare(`
      INSERT INTO smart_fc_feedback (id, session_id, flashcard_id, user_id, topic_id, response, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(feedbackId, sessionId, flashcardId, validUserId, topicId, response, now);

    // 2. Count feedback for this session
    const feedbackList = db.prepare(`
      SELECT f.flashcard_id, f.topic_id, f.response, c.card_label, c.subject
      FROM smart_fc_feedback f
      LEFT JOIN smart_fc_session_cards c ON c.session_id = f.session_id AND c.flashcard_id = f.flashcard_id
      WHERE f.session_id = ?
    `).all(sessionId);

    // Deduplicate by flashcard_id (in case of double clicks)
    const uniqueFeedbackMap = new Map();
    for (const f of feedbackList) {
      uniqueFeedbackMap.set(f.flashcard_id, f);
    }

    const uniqueFeedbacks = Array.from(uniqueFeedbackMap.values());
    const isCompleted = uniqueFeedbacks.length >= 5;

    let summary = null;

    if (isCompleted) {
      const gotItCount = uniqueFeedbacks.filter(f => f.response === 'got_it').length;
      const needPracticeCount = uniqueFeedbacks.filter(f => f.response === 'need_practice').length;
      const strongReviewed = uniqueFeedbacks.filter(f => f.card_label === 'strong').length;
      const weakReviewed = uniqueFeedbacks.filter(f => f.card_label === 'weak').length;

      // Identify topics recommended for further revision
      const practiceTopicIds = new Set(uniqueFeedbacks.filter(f => f.response === 'need_practice').map(f => f.topic_id).filter(Boolean));
      
      const topicsRecommended = [];
      for (const tId of practiceTopicIds) {
        const topic = db.prepare('SELECT id, name, subject FROM topics WHERE id = ?').get(tId);
        if (topic) {
          topicsRecommended.push({
            topic_id: topic.id,
            topic_name: topic.name,
            subject: topic.subject,
            reason: 'Flagged for reinforcement during Smart Flashcard review',
            study_url: `study.html?topic=${topic.id}`,
            recall_url: `recall.html?topic=${topic.id}`
          });
        }
      }

      summary = {
        sessionId,
        completedAt: now,
        flashcardsCompleted: uniqueFeedbacks.length,
        strongReviewed,
        weakReviewed,
        gotItCount,
        needPracticeCount,
        accuracyRate: Math.round((gotItCount / uniqueFeedbacks.length) * 100),
        topicsRecommended,
        cardsFeedback: uniqueFeedbacks.map(f => ({
          flashcard_id: f.flashcard_id,
          topic_id: f.topic_id,
          card_label: f.card_label,
          response: f.response
        }))
      };

      // Update session in DB
      db.prepare(`
        UPDATE smart_fc_sessions 
        SET completed = 1, summary_json = ? 
        WHERE id = ?
      `).run(JSON.stringify(summary), sessionId);
    }

    return {
      recorded: true,
      feedbackId,
      sessionCompleted: isCompleted,
      cardsAnswered: uniqueFeedbacks.length,
      totalCards: 5,
      summary
    };
  }

  /**
   * Get past smart flashcard sessions for a user
   */
  getHistory(userId, limit = 10) {
    if (!userId) return [];

    const sessions = db.prepare(`
      SELECT id, created_at, strong_count, weak_count, completed, summary_json
      FROM smart_fc_sessions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit);

    return sessions.map(s => ({
      sessionId: s.id,
      createdAt: s.created_at,
      completed: Boolean(s.completed),
      strongCount: s.strong_count,
      weakCount: s.weak_count,
      summary: s.summary_json ? JSON.parse(s.summary_json) : null
    }));
  }
}

module.exports = new SmartFlashcardsService();
