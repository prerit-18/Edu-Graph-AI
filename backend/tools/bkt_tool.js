const { recordAttempt, getMastery, updateBKT, PARAMS_BY_TYPE } = require('../knowledge_tracing/bkt');

/**
 * BKT Tool
 * Deterministic calculation wrapper for agents to query and log skill updates.
 */
class BKTTool {
  constructor() {
    this.name = 'bkt_tool';
    this.description = 'Deterministic Bayesian Knowledge Tracing engine. Updates mastery probabilities upon observed practice.';
  }

  recordPractice(userId, topicId, agentName, question, answer, isCorrect, opts = {}) {
    return recordAttempt(userId, topicId, agentName, question, answer, isCorrect, opts);
  }

  checkMastery(userId, topicId) {
    return getMastery(userId, topicId);
  }

  simulateOutcome(currentPKnow, isCorrect, type) {
    return updateBKT(currentPKnow, isCorrect ? 1 : 0, PARAMS_BY_TYPE[type] || {});
  }
}

module.exports = new BKTTool();
