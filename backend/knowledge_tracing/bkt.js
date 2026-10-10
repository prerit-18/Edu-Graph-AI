const crypto = require('crypto');
const db = require('../database/db');

// Standard BKT parameters as specified in the Minor Project Guide
const DEFAULT_BKT_PARAMS = {
  p_l0: 0.30,   // Initial probability of knowing the topic
  p_t: 0.15,    // Transition (learn) probability
  p_s: 0.10,    // Slip probability (knows but answers incorrectly)
  p_g: 0.20     // Guess probability (doesn't know but answers correctly)
};

/**
 * Pure deterministic Bayesian Knowledge Tracing update
 * @param {number} pKnow - Current prior probability of knowing the skill P(L_t)
 * @param {boolean|number} isCorrect - 1 if student answered correctly, 0 if incorrect
 * @param {object} params - BKT parameters (p_t, p_s, p_g)
 * @returns {number} Updated posterior probability P(L_t+1)
 */
function updateBKT(pKnow, isCorrect, params = DEFAULT_BKT_PARAMS) {
  const { p_t, p_s, p_g } = { ...DEFAULT_BKT_PARAMS, ...params };
  
  // Ensure pKnow is within valid probability bounds
  const pL = Math.max(0.001, Math.min(0.999, pKnow));
  
  let pPosterior;
  if (isCorrect) {
    // P(L | Obs = Correct)
    const numerator = pL * (1 - p_s);
    const denominator = numerator + (1 - pL) * p_g;
    pPosterior = numerator / (denominator || 1e-9);
  } else {
    // P(L | Obs = Incorrect)
    const numerator = pL * p_s;
    const denominator = numerator + (1 - pL) * (1 - p_g);
    pPosterior = numerator / (denominator || 1e-9);
  }

  // Account for learning transition: P(L_t+1) = P(L|Obs) + (1 - P(L|Obs)) * P(T)
  const pNext = pPosterior + (1 - pPosterior) * p_t;
  
  // Round to 4 decimal places and clamp
  return Math.max(0.01, Math.min(0.99, Number(pNext.toFixed(4))));
}

/**
 * Get or initialize current mastery for a user and topic
 * @param {string} userId 
 * @param {string} topicId 
 * @returns {object} { user_id, topic_id, p_know, last_seen }
 */
function getMastery(userId, topicId) {
  const row = db.prepare(`
    SELECT user_id, topic_id, p_know, last_seen 
    FROM mastery 
    WHERE user_id = ? AND topic_id = ?
  `).get(userId, topicId);

  if (row) {
    return row;
  }

  // If not yet present in mastery table, return the standard Bayesian initial prior p_l0 (0.30)
  // for mathematical updating on the first attempt without modifying the DB prematurely.
  return {
    user_id: userId,
    topic_id: topicId,
    p_know: DEFAULT_BKT_PARAMS.p_l0,
    last_seen: null
  };
}

/**
 * Recalculate revision priority and due date for a topic
 * @param {string} userId 
 * @param {string} topicId 
 * @param {number} pKnow 
 */
function recalculateRevision(userId, topicId, pKnow) {
  const topic = db.prepare('SELECT pyq_weight FROM topics WHERE id = ?').get(topicId);
  const pyqWeight = topic ? topic.pyq_weight : 0.5;

  // Weak topics (low p_know) with high PYQ importance get highest revision priority
  // Priority ranges roughly from 0 to 1+
  const now = new Date();
  const priority = Number(((1 - pKnow) * pyqWeight * 1.5).toFixed(4));
  
  // Interval: if high mastery (>0.8), due in 7 days; if medium (>0.5), 3 days; if weak, 1 day
  let daysToAdd = 1;
  if (pKnow >= 0.8) daysToAdd = 7;
  else if (pKnow >= 0.5) daysToAdd = 3;

  const dueDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO revision_schedule (user_id, topic_id, due_at, priority)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, topic_id) DO UPDATE SET
      due_at = excluded.due_at,
      priority = excluded.priority
  `).run(userId, topicId, dueDate, priority);

  return { dueDate, priority };
}

/**
 * Phase 5 recordAttempt implementation:
 * 1. Save attempt
 * 2. Read previous P(Know)
 * 3. Apply BKT update
 * 4. Save new mastery
 * 5. Update last_seen
 * 6. Recalculate revision
 */
function recordAttempt(userId, topicId, agent, question, answer, correct) {
  const attemptId = crypto.randomUUID();
  const isCorrect = correct ? 1 : 0;
  const now = new Date().toISOString();

  // 1. Save attempt
  db.prepare(`
    INSERT INTO attempts (id, user_id, topic_id, agent, question, answer, correct, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(attemptId, userId, topicId, agent, question, String(answer), isCorrect, now);

  // 2. Read previous P(Know)
  const current = getMastery(userId, topicId);
  const previousPKnow = current.p_know;

  // 3. Apply BKT update
  const newPKnow = updateBKT(previousPKnow, isCorrect);

  // 4 & 5. Save new mastery & update last_seen
  db.prepare(`
    INSERT INTO mastery (user_id, topic_id, p_know, last_seen)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, topic_id) DO UPDATE SET
      p_know = excluded.p_know,
      last_seen = excluded.last_seen
  `).run(userId, topicId, newPKnow, now);

  // 6. Recalculate revision
  const revision = recalculateRevision(userId, topicId, newPKnow);

  return {
    attemptId,
    topicId,
    previousPKnow,
    newPKnow,
    isCorrect: Boolean(isCorrect),
    revisionDue: revision.dueDate,
    revisionPriority: revision.priority
  };
}

module.exports = {
  DEFAULT_BKT_PARAMS,
  updateBKT,
  getMastery,
  recalculateRevision,
  recordAttempt
};
