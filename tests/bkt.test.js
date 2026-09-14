const assert = require('assert');
const { updateBKT, recordAttempt, getMastery } = require('../backend/knowledge_tracing/bkt');
const db = require('../backend/database/db');

console.log('--- Testing BKT Knowledge Tracing ---');

// 1. Initial state
const p0 = 0.30;

// 2. Correct answer calculation
// P(L|Obs=1) = (0.30 * 0.90) / (0.30 * 0.90 + 0.70 * 0.20) = 0.27 / (0.27 + 0.14) = 0.27 / 0.41 = 0.6585
// P(L1) = 0.6585 + (1 - 0.6585) * 0.15 = 0.6585 + 0.0512 = 0.7097
const p1 = updateBKT(p0, 1);
console.log(`P(Know) after 1 correct attempt: ${p1}`);
assert(p1 > p0, 'P(Know) must increase after correct attempt');
assert(Math.abs(p1 - 0.7097) < 0.01, `Expected ~0.7097, got ${p1}`);

// 3. Second correct answer
const p2 = updateBKT(p1, 1);
console.log(`P(Know) after 2nd correct attempt: ${p2}`);
assert(p2 > p1, 'P(Know) must increase after 2nd correct attempt');
assert(p2 > 0.85, 'P(Know) should be high after 2 consecutive correct answers');

// 4. Incorrect answer from p0
// P(L|Obs=0) = (0.30 * 0.10) / (0.30 * 0.10 + 0.70 * 0.80) = 0.03 / (0.03 + 0.56) = 0.03 / 0.59 = 0.0508
// P(L1) = 0.0508 + (1 - 0.0508) * 0.15 = 0.0508 + 0.1424 = 0.1932
const pWrong = updateBKT(p0, 0);
console.log(`P(Know) after 1 incorrect attempt: ${pWrong}`);
assert(pWrong < p0, 'P(Know) must decrease after incorrect attempt');
assert(Math.abs(pWrong - 0.1932) < 0.01, `Expected ~0.1932, got ${pWrong}`);

// 5. Test recordAttempt with DB
const testUserId = `test_user_bkt_${Date.now()}`;
const testTopicId = 'os_scheduling';

// Ensure user exists
db.prepare('INSERT OR IGNORE INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(
  testUserId, 'Test User', `${testUserId}@example.com`, 'dummyhash'
);

const attempt1 = recordAttempt(testUserId, testTopicId, 'ProblemSolver', 'What is SJF?', 'Shortest Job First', 1);
console.log('Recorded Attempt 1:', attempt1);
assert.strictEqual(attempt1.isCorrect, true);
assert.strictEqual(attempt1.previousPKnow, 0.30);
assert(attempt1.newPKnow > 0.30);

// Check DB state
const masteryRow = db.prepare('SELECT * FROM mastery WHERE user_id = ? AND topic_id = ?').get(testUserId, testTopicId);
assert.strictEqual(masteryRow.p_know, attempt1.newPKnow);

const revisionRow = db.prepare('SELECT * FROM revision_schedule WHERE user_id = ? AND topic_id = ?').get(testUserId, testTopicId);
assert(revisionRow !== undefined);
assert(revisionRow.priority > 0);

console.log('All BKT unit tests passed successfully!');
