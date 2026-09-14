const fs = require('fs');
const path = require('path');

/**
 * PYQ Tool
 * Queries and analyzes GATE previous year questions dataset.
 */
class PYQTool {
  constructor() {
    this.name = 'pyq_tool';
    this.description = 'Searches, filters, and analyzes GATE Previous Year Questions (PYQs).';
    this.pyqs = [];
    this.loadAll();
  }

  loadAll() {
    const pyqDirs = [
      { subject: 'Operating Systems', dir: 'os' },
      { subject: 'Algorithms', dir: 'algorithms' },
      { subject: 'Database Management Systems', dir: 'dbms' }
    ];

    const all = [];
    for (const item of pyqDirs) {
      const qFile = path.resolve(__dirname, `../../data/pyq/${item.dir}/questions.json`);
      if (fs.existsSync(qFile)) {
        const questions = JSON.parse(fs.readFileSync(qFile, 'utf8'));
        all.push(...questions);
      }
    }
    this.pyqs = all;
  }

  getAllPYQs() {
    if (this.pyqs.length === 0) this.loadAll();
    return this.pyqs;
  }

  getPYQsByTopic(topicId) {
    if (this.pyqs.length === 0) this.loadAll();
    return this.pyqs.filter(q => q.topic_id === topicId);
  }

  getPYQsBySubject(subject) {
    if (this.pyqs.length === 0) this.loadAll();
    return this.pyqs.filter(q => q.subject.toLowerCase() === subject.toLowerCase());
  }

  getPYQById(id) {
    if (this.pyqs.length === 0) this.loadAll();
    return this.pyqs.find(q => q.id === id);
  }

  getTopicStats(topicId) {
    const qs = this.getPYQsByTopic(topicId);
    const years = [...new Set(qs.map(q => q.year))].sort((a, b) => b - a);
    const types = {};
    qs.forEach(q => {
      types[q.type] = (types[q.type] || 0) + 1;
    });

    return {
      topic_id: topicId,
      total_questions: qs.length,
      years_appeared: years,
      frequency_rate: `${qs.length} questions in ${years.length > 0 ? years.length : 0} exam sessions`,
      types
    };
  }
}

module.exports = new PYQTool();
