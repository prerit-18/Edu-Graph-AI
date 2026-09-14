const fs = require('fs');
const path = require('path');
const db = require('./db');

function seedDatabase() {
  const syllabusPath = path.resolve(__dirname, '../../data/syllabus/syllabus.json');
  if (!fs.existsSync(syllabusPath)) {
    console.error('syllabus.json not found at:', syllabusPath);
    return;
  }

  const syllabus = JSON.parse(fs.readFileSync(syllabusPath, 'utf8'));
  const insertTopic = db.prepare(`
    INSERT OR REPLACE INTO topics (id, subject, name, prerequisite_id, pyq_weight)
    VALUES (?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const subjectObj of syllabus) {
    const subject = subjectObj.subject;
    for (const topic of subjectObj.topics) {
      insertTopic.run(topic.id, subject, topic.name, topic.prerequisite || null, topic.pyq_weight || 0.5);
      count++;
    }
  }

  console.log(`Successfully seeded ${count} topics across ${syllabus.length} subjects.`);
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
