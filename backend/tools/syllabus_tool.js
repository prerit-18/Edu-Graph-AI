const fs = require('fs');
const path = require('path');
const db = require('../database/db');

const SYLLABUS_FILE = path.resolve(__dirname, '../../data/syllabus/syllabus.json');
let _cache = { mtime: 0, data: [] };
/** Official syllabus text + topic descriptions come from the data file, never from the model. */
function syllabusFile() {
  try {
    const m = fs.statSync(SYLLABUS_FILE).mtimeMs;
    if (m !== _cache.mtime) _cache = { mtime: m, data: JSON.parse(fs.readFileSync(SYLLABUS_FILE, 'utf8')) };
  } catch (e) { /* fall through with the last good copy */ }
  return _cache.data;
}

/**
 * Syllabus Tool
 * Queries topics, prerequisites, and curriculum graph for GATE CSE.
 */
class SyllabusTool {
  constructor() {
    this.name = 'syllabus_tool';
    this.description = 'Fetches GATE syllabus topics, prerequisite dependencies, and subject weightings.';
  }

  getOfficialSyllabus(subject) {
    const s = syllabusFile().find(x => x.subject.toLowerCase() === String(subject).toLowerCase());
    return s ? s.official_syllabus || null : null;
  }

  getTopicDescription(topicId) {
    for (const s of syllabusFile()) {
      const t = s.topics.find(x => x.id === topicId);
      if (t) return t.description || null;
    }
    return null;
  }

  getTopicKeywords(topicId) {
    for (const s of syllabusFile()) {
      const t = s.topics.find(x => x.id === topicId);
      if (t) return t.keywords || '';
    }
    return '';
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
