const fs = require('fs');
const path = require('path');
const db = require('./db');

/**
 * Idempotent, NON-destructive seeding of the syllabus.
 * Uses UPSERT (never INSERT OR REPLACE, which would delete the row and cascade away
 * learner mastery/attempts). Topics that disappear from syllabus.json are left alone
 * so student history is never lost.
 */
function seedDatabase({ quiet = false } = {}) {
  const syllabusPath = path.resolve(__dirname, '../../data/syllabus/syllabus.json');
  if (!fs.existsSync(syllabusPath)) {
    console.error('syllabus.json not found at:', syllabusPath);
    return 0;
  }
  const syllabus = JSON.parse(fs.readFileSync(syllabusPath, 'utf8'));
  const upsert = db.prepare(`
    INSERT INTO topics (id, subject, name, prerequisite_id, pyq_weight)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET subject = excluded.subject, name = excluded.name,
      prerequisite_id = excluded.prerequisite_id, pyq_weight = excluded.pyq_weight
  `);
  let count = 0;
  const tx = db.transaction ? db.transaction.bind(db) : (fn) => () => fn();
  tx(() => {
    for (const subjectObj of syllabus) {
      for (const topic of subjectObj.topics) {
        upsert.run(topic.id, subjectObj.subject, topic.name, topic.prerequisite || null, topic.pyq_weight || 0.5);
        count++;
      }
    }
  })();
  if (!quiet) console.log(`Seeded ${count} topics across ${syllabus.length} subjects.`);
  return count;
}

if (require.main === module) {
  seedDatabase();
  const { importAll } = require('../services/question_bank');
  console.log('Question bank:', importAll());
}

module.exports = seedDatabase;
