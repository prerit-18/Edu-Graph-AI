const db = require('../database/db');

/**
 * Syllabus Tool
 * Queries topics, prerequisites, and curriculum graph for GATE CSE.
 */
class SyllabusTool {
  constructor() {
    this.name = 'syllabus_tool';
    this.description = 'Fetches GATE syllabus topics, prerequisite dependencies, and subject weightings.';
  }

  getAllSubjects() {
    return db.prepare('SELECT DISTINCT subject FROM topics ORDER BY subject').all().map(r => r.subject);
  }

  getTopicsBySubject(subject) {
    return db.prepare('SELECT * FROM topics WHERE subject = ?').all(subject);
  }

  getTopicById(topicId) {
    return db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId);
  }

  getAllTopics() {
    return db.prepare('SELECT * FROM topics ORDER BY subject, id').all();
  }

  getPrerequisiteChain(topicId) {
    const chain = [];
    let currentId = topicId;

    while (currentId) {
      const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(currentId);
      if (!topic) break;
      chain.unshift(topic);
      currentId = topic.prerequisite_id;
    }

    return chain;
  }
}

module.exports = new SyllabusTool();
