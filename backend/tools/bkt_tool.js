const { recordAttempt, getMastery, updateBKT } = require('../knowledge_tracing/bkt');

/**
 * BKT Tool
 * Deterministic calculation wrapper for agents to query and log skill updates.
 */
class BKTTool {
  constructor() {
    this.name = 'bkt_tool';
    this.description = 'Deterministic Bayesian Knowledge Tracing engine. Updates mastery probabilities upon observed practice.';
  }

  recordPractice(userId, topicId, agentName, question, answer, isCorrect) {
    return recordAttempt(userId, topicId, agentName, question, answer, isCorrect);
  }

  checkMastery(userId, topicId) {
    return getMastery(userId, topicId);
  }

  simulateOutcome(currentPKnow, isCorrect) {
    return updateBKT(currentPKnow, isCorrect ? 1 : 0);
  }
}

module.exports = new BKTTool();
