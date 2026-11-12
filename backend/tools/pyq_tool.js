const bank = require('../services/question_bank');

/**
 * PYQ Tool — thin, agent-facing wrapper over the SQLite question bank.
 * Kept API-compatible with the previous JSON-file implementation.
 */
class PYQTool {
  constructor() {
    this.name = 'pyq_tool';
    this.description = 'Searches, filters, and analyzes GATE previous year questions from the verified question bank.';
  }
  getAllPYQs() { return bank.getAll(); }
  getPYQsByTopic(topicId, opts = {}) { return bank.search({ topic_id: topicId, ...opts }, { limit: 200 }).questions; }
  getPYQsBySubject(subject) { return bank.search({ subject }, { limit: 500 }).questions; }
  getPYQById(id) { return bank.getById(id); }
  search(filters, opts) { return bank.search(filters, opts); }
  getTopicStats(topicId) { return bank.topicStats(topicId); }
}

module.exports = new PYQTool();
