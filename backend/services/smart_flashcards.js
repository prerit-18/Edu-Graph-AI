const db = require('../database/db');

/**
 * Topic classification for Smart Flashcards (strong / weak / neutral / insufficient data / unseen) from BKT + attempts.
 * Card generation lives in services/daily_flashcards.js.
 * Default configurable thresholds
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
             SUM(CASE WHEN feedback = 'need_practice' THEN 1 ELSE 0 END) as need_practice_count,
             SUM(CASE WHEN feedback = 'got_it' THEN 1 ELSE 0 END) as got_it_count
      FROM fc_daily_cards
      WHERE user_id = ? AND feedback IS NOT NULL
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
}

module.exports = new SmartFlashcardsService();
